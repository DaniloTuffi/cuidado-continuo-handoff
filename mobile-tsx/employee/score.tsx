// apps/mobile/app/(employee)/score.tsx
//
// Score de Cuidado completo — hero com score + prêmio · breakdown 4 KPIs ·
// escala de prêmios · ranking unidade · histórico 6 meses · bugs e ideias.
//
// Lê de profile_score_monthly + profile_score_kpi_log + bug_reports + feature_ideas.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

interface MonthlyScore {
  year_month: string;
  total_score: number;
  premio_centavos: number;
  execucao_score: number;
  relacionamento_score: number;
  vendas_score: number;
  cocriacao_score: number;
  ranking_unidade: number | null;
}

interface RankingEntry {
  profile_id: string;
  full_name: string;
  total_score: number;
  premio_centavos: number;
  is_self: boolean;
}

interface CocreateItem {
  id: string;
  title: string;
  status: string;
  premio_centavos: number;
  created_at: string;
  kind: "bug" | "idea";
}

function ym(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymMinus(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

const PRIZE_STEPS = [
  { range: "70-79", label: "Iniciante+", val: "R$ 200", desc: "Estrela no app + grupo Vencedores", min: 70, max: 79 },
  { range: "80-89", label: "Boa", val: "R$ 500", desc: "Foto destaque + 1 dia flex", min: 80, max: 89 },
  { range: "90-99", label: "Excelente", val: "R$ 1.000", desc: "Almoço Constelação + áudio Paula", min: 90, max: 99 },
  { range: "100", label: "Perfeição", val: "R$ 1.500", desc: "Folga premium + capa Diário", min: 100, max: 100 },
];

export default function ScoreScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [current, setCurrent] = useState<MonthlyScore | null>(null);
  const [history, setHistory] = useState<MonthlyScore[]>([]);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [bugs, setBugs] = useState<CocreateItem[]>([]);
  const [ideas, setIdeas] = useState<CocreateItem[]>([]);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    try {
      // Mês atual
      const { data: curr } = await supabase
        .from("profile_score_monthly")
        .select("*")
        .eq("profile_id", profile.id)
        .eq("year_month", ym())
        .maybeSingle();
      setCurrent(curr as MonthlyScore | null);

      // Histórico 6 meses
      const { data: hist } = await supabase
        .from("profile_score_monthly")
        .select("year_month, total_score, premio_centavos")
        .eq("profile_id", profile.id)
        .order("year_month", { ascending: false })
        .limit(6);
      setHistory((hist ?? []) as MonthlyScore[]);

      // Ranking unidade
      if (profile.franchise_id) {
        const { data: rank } = await supabase
          .from("profile_score_monthly")
          .select("profile_id, total_score, premio_centavos, profiles!inner(full_name)")
          .eq("franchise_id", profile.franchise_id)
          .eq("year_month", ym())
          .order("total_score", { ascending: false })
          .limit(5);
        setRanking(
          (rank ?? []).map((r: any) => ({
            profile_id: r.profile_id,
            full_name: r.profiles.full_name,
            total_score: Number(r.total_score) || 0,
            premio_centavos: r.premio_centavos || 0,
            is_self: r.profile_id === profile.id,
          }))
        );
      }

      // Bugs e Ideas
      const { data: bugRows } = await supabase
        .from("bug_reports")
        .select("id, title, status, premio_centavos, created_at")
        .eq("reporter_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5);
      setBugs(
        (bugRows ?? []).map((b: any) => ({ ...b, kind: "bug" as const }))
      );

      const { data: ideaRows } = await supabase
        .from("feature_ideas")
        .select("id, title, status, premio_centavos, created_at")
        .eq("reporter_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5);
      setIdeas(
        (ideaRows ?? []).map((i: any) => ({ ...i, kind: "idea" as const }))
      );
    } catch (e) {
      console.error("Erro ao carregar Score:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.franchise_id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Score de Cuidado" }} />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>SCORE DE CUIDADO · {monthLabelPretty()}</Text>
          <Text style={styles.heroNum}>
            {current ? Math.round(current.total_score) : 0}
            <Text style={styles.heroMax}>/100</Text>
          </Text>
          {current?.ranking_unidade && (
            <Text style={styles.heroSub}>✦ {current.ranking_unidade}º da unidade</Text>
          )}
          {current && current.premio_centavos > 0 && (
            <View style={styles.heroPrize}>
              <Text style={styles.heroPrizeTag}>🏆 Prêmio do mês desbloqueado</Text>
              <Text style={styles.heroPrizeVal}>{brl(current.premio_centavos)}</Text>
            </View>
          )}
        </View>

        {/* KPI BREAKDOWN */}
        <SectionHeader title="Como seu Score se forma" colors={colors} />
        <View style={{ paddingHorizontal: 16 }}>
          <KpiCard name="🎯 Execução" weight="Peso 40%" pct={current?.execucao_score ?? 0} colors={colors} />
          <KpiCard name="💝 Relacionamento" weight="Peso 30%" pct={current?.relacionamento_score ?? 0} colors={colors} />
          <KpiCard name="💰 Vendas" weight="Peso 20%" pct={current?.vendas_score ?? 0} colors={colors} />
          <KpiCard name="🌟 Co-Criação" weight="Peso 10%" pct={current?.cocriacao_score ?? 0} colors={colors} />
        </View>

        {/* PRÊMIOS */}
        <SectionHeader title="Escala de prêmios mensais" colors={colors} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
          {PRIZE_STEPS.map((step) => {
            const score = current?.total_score ?? 0;
            const isCurrent = score >= step.min && score <= step.max;
            return (
              <View
                key={step.range}
                style={[
                  styles.prizeStep,
                  isCurrent && { backgroundColor: "#1f1a17", borderColor: "#b89968" },
                ]}
              >
                <Text style={[styles.prizeRange, isCurrent && { color: "#d4bf95" }]}>
                  {step.range} pts
                </Text>
                <Text style={[styles.prizeLabel, isCurrent && { color: "#d4bf95" }]}>
                  {step.label}
                </Text>
                <Text style={[styles.prizeVal, isCurrent && { color: "#b89968" }]}>
                  {step.val}
                </Text>
                <Text style={[styles.prizeDesc, isCurrent && { color: "rgba(255,255,255,0.7)" }]}>
                  {step.desc}
                </Text>
                {isCurrent && <Text style={styles.youTag}>VOCÊ</Text>}
              </View>
            );
          })}
        </ScrollView>

        {/* RANKING */}
        {ranking.length > 0 && (
          <>
            <SectionHeader title="Ranking · sua unidade" colors={colors} />
            <View style={[styles.rankingCard, { backgroundColor: "#1f1a17" }]}>
              {ranking.map((r, i) => (
                <View
                  key={r.profile_id}
                  style={[styles.rankRow, r.is_self && { backgroundColor: "rgba(184,153,104,0.1)" }]}
                >
                  <Text style={styles.rankPos}>{i + 1}º</Text>
                  <Text style={[styles.rankName, r.is_self && { fontWeight: "700" }]}>
                    {r.full_name} {r.is_self && "← você"}
                  </Text>
                  <Text style={styles.rankScore}>{Math.round(r.total_score)}</Text>
                  <Text style={styles.rankPrize}>{brl(r.premio_centavos)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* HISTÓRICO */}
        {history.length > 0 && (
          <>
            <SectionHeader title="Últimos 6 meses" colors={colors} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {history.slice().reverse().map((h) => (
                <View key={h.year_month} style={[styles.histCol, { backgroundColor: colors.surface }]}>
                  <View style={[styles.histBar, { height: Math.max(20, h.total_score * 1.2) }]} />
                  <Text style={[styles.histNum, { color: colors.text }]}>{Math.round(h.total_score)}</Text>
                  <Text style={[styles.histMonth, { color: colors.textMuted }]}>{histLabel(h.year_month)}</Text>
                  {h.premio_centavos > 0 && (
                    <Text style={styles.histPrize}>{brl(h.premio_centavos)}</Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* CO-CRIAÇÃO */}
        <SectionHeader title="Co-Criação · você melhorando o app" colors={colors} />
        <View style={{ paddingHorizontal: 16 }}>
          <View style={[styles.cocreateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cocreateHeader}>
              <Text style={[styles.cocreateTitle, { color: colors.text }]}>🐛 Bugs reportados</Text>
              <TouchableOpacity
                style={styles.cocreateCta}
                onPress={() => router.push("/(employee)/bug-report")}
              >
                <Text style={styles.cocreateCtaText}>+ Reportar</Text>
              </TouchableOpacity>
            </View>
            {bugs.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, paddingVertical: 8 }}>
                Você ainda não reportou bugs. Cada bug validado: R$ 100-500.
              </Text>
            ) : (
              bugs.map((b) => <CocreateRow key={b.id} item={b} colors={colors} />)
            )}
          </View>

          <View style={[styles.cocreateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.cocreateHeader}>
              <Text style={[styles.cocreateTitle, { color: colors.text }]}>💡 Suas ideias</Text>
              <TouchableOpacity
                style={styles.cocreateCta}
                onPress={() => router.push("/(employee)/idea-submit")}
              >
                <Text style={styles.cocreateCtaText}>+ Nova ideia</Text>
              </TouchableOpacity>
            </View>
            {ideas.length === 0 ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, paddingVertical: 8 }}>
                Compartilhe ideias. Implementadas: R$ 500-2.000.
              </Text>
            ) : (
              ideas.map((i) => <CocreateRow key={i.id} item={i} colors={colors} />)
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, colors }: { title: string; colors: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <Text style={[styles.sectionH, { color: "#8a3a4f" }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

function KpiCard({ name, weight, pct, colors }: { name: string; weight: string; pct: number; colors: any }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <View style={[styles.kpiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.kpiHead}>
        <View>
          <Text style={[styles.kpiName, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.kpiWeight, { color: colors.textMuted }]}>{weight}</Text>
        </View>
        <Text style={[styles.kpiScore, { color: colors.text }]}>{p}<Text style={{ fontSize: 14 }}>%</Text></Text>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.surfaceMuted }]}>
        <View style={[styles.barFill, { width: `${p}%` }]} />
      </View>
    </View>
  );
}

function CocreateRow({ item, colors }: { item: CocreateItem; colors: any }) {
  const statusColor =
    item.status === "validated" || item.status === "implemented"
      ? "#4a6e4f"
      : item.status === "fixed" || item.status === "paid"
        ? "#4a6e4f"
        : "#8a6f3d";
  return (
    <View style={[styles.cocreateRow, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cocreateRowTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={[styles.cocreateStatus, { color: statusColor }]}>{item.status}</Text>
      </View>
      {item.premio_centavos > 0 && (
        <Text style={styles.cocreatePrize}>{brl(item.premio_centavos)}</Text>
      )}
    </View>
  );
}

function monthLabelPretty(): string {
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function histLabel(y_m: string): string {
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [y, m] = y_m.split("-");
  return `${months[Number(m) - 1]}/${y.slice(2)}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    backgroundColor: "#1f1a17",
    padding: 30,
    paddingTop: 50,
    alignItems: "center",
  },
  heroEyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: "#d4bf95",
    fontWeight: "700",
    marginBottom: 12,
  },
  heroNum: {
    fontSize: 90,
    fontWeight: "300",
    color: "#fff",
    letterSpacing: -3,
    lineHeight: 90,
  },
  heroMax: { fontSize: 30, color: "#d4bf95" },
  heroSub: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#d4bf95",
    fontWeight: "700",
    marginTop: 6,
  },
  heroPrize: {
    backgroundColor: "rgba(184,153,104,0.18)",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 18,
    alignItems: "center",
  },
  heroPrizeTag: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: "#d4bf95",
    fontWeight: "700",
  },
  heroPrizeVal: {
    fontSize: 36,
    color: "#b89968",
    fontWeight: "600",
    marginTop: 4,
  },
  sectionH: {
    fontSize: 11,
    letterSpacing: 1.8,
    fontWeight: "700",
  },
  kpiCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kpiHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 },
  kpiName: { fontSize: 14, fontWeight: "600" },
  kpiWeight: { fontSize: 10, marginTop: 1 },
  kpiScore: { fontSize: 36, fontWeight: "600", letterSpacing: -1, lineHeight: 36 },
  bar: { height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: "#b89968" },
  prizeStep: {
    width: 130,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "transparent",
  },
  prizeRange: { fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "700", marginBottom: 6 },
  prizeLabel: { fontSize: 9, color: "#6f6878", marginBottom: 2, textTransform: "uppercase", fontWeight: "700", letterSpacing: 1 },
  prizeVal: { fontSize: 24, fontWeight: "600", color: "#8a6f3d", letterSpacing: -0.5 },
  prizeDesc: { fontSize: 10, marginTop: 4, color: "#6f6878", lineHeight: 13 },
  youTag: {
    position: "absolute",
    top: -8,
    right: 10,
    backgroundColor: "#b89968",
    color: "#1f1a17",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 100,
  },
  rankingCard: { borderRadius: 14, marginHorizontal: 16, padding: 14 },
  rankRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 8 },
  rankPos: { fontSize: 16, color: "#d4bf95", width: 30, fontWeight: "600" },
  rankName: { fontSize: 13, color: "#fff", flex: 1 },
  rankScore: { fontSize: 16, color: "#fff", fontWeight: "600", width: 40, textAlign: "right" },
  rankPrize: { fontSize: 11, color: "#d4bf95", fontWeight: "700", width: 80, textAlign: "right" },
  histCol: { width: 70, alignItems: "center", borderRadius: 10, padding: 8 },
  histBar: { width: 30, backgroundColor: "#b89968", borderRadius: 4, marginBottom: 6 },
  histNum: { fontSize: 16, fontWeight: "600" },
  histMonth: { fontSize: 9, marginTop: 2, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "700" },
  histPrize: { fontSize: 9, color: "#8a6f3d", marginTop: 3, fontWeight: "700" },
  cocreateCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cocreateHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  cocreateTitle: { fontSize: 15, fontWeight: "600" },
  cocreateCta: {
    backgroundColor: "#1f1a17",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  cocreateCtaText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  cocreateRow: {
    flexDirection: "row",
    paddingVertical: 8,
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  cocreateRowTitle: { fontSize: 12, fontWeight: "600", marginBottom: 2 },
  cocreateStatus: { fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: "700" },
  cocreatePrize: { fontSize: 13, fontWeight: "700", color: "#8a6f3d" },
});
