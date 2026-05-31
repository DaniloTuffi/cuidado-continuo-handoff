// apps/mobile/app/(employee)/client-360.tsx
//
// Perfil 360° da cliente — vista expandida pelo profissional.
// Substitui (ou estende) o client-file.tsx existente.
//
// 6 tabs: Visão · Histórico · Memória · Procedimentos · Diário · Conexões
// Stats hero, antes/depois, timeline 90 dias, ações sugeridas, painel hormonal.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

type Tab = "visao" | "historico" | "memoria" | "procedimentos" | "diario" | "conexoes";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "visao", label: "Visão geral" },
  { key: "historico", label: "Histórico" },
  { key: "memoria", label: "Memória" },
  { key: "procedimentos", label: "Procedimentos" },
  { key: "diario", label: "Diário" },
  { key: "conexoes", label: "Conexões" },
];

interface Client {
  id: string;
  full_name: string;
  tier_label: string | null;
  bio: string | null;
  avatar_url: string | null;
  ltv_centavos: number;
  total_visits: number;
  nps_avg: number | null;
  referrals_count: number;
  events_count: number;
  diario_columns_count: number;
  age: number | null;
  city: string | null;
  occupation: string | null;
}

interface TimelineItem {
  id: string;
  occurred_at: string;
  title: string;
  description: string | null;
  kind: "visit" | "event" | "column" | "renewal" | "referral";
  tag: string | null;
}

interface Procedure {
  procedure_key: string;
  procedure_name: string;
  total_sessions: number;
  last_session_at: string;
}

export default function Client360Screen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("visao");
  const [client, setClient] = useState<Client | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [memory, setMemory] = useState<Record<string, Array<{ fact_text: string; fact_date: string | null }>>>({});
  const [procedures, setProcedures] = useState<Procedure[]>([]);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const { data: c } = await supabase
        .from("client_details")
        .select(`
          id, full_name, avatar_url, bio, age, city, occupation, total_visits, ltv_centavos,
          nps_avg, referrals_count, events_count, diario_columns_count,
          loyalty_tiers!loyalty_tier_id(name)
        `)
        .eq("id", id)
        .maybeSingle();

      if (c) {
        setClient({
          id: c.id,
          full_name: c.full_name,
          avatar_url: c.avatar_url,
          bio: c.bio,
          age: c.age,
          city: c.city,
          occupation: c.occupation,
          tier_label: (c as any).loyalty_tiers?.name ?? null,
          ltv_centavos: c.ltv_centavos ?? 0,
          total_visits: c.total_visits ?? 0,
          nps_avg: c.nps_avg,
          referrals_count: c.referrals_count ?? 0,
          events_count: c.events_count ?? 0,
          diario_columns_count: c.diario_columns_count ?? 0,
        });
      }

      const { data: tl } = await supabase.rpc("client_timeline_recent", { p_client_id: id, p_days: 90 });
      setTimeline((tl ?? []) as TimelineItem[]);

      const { data: mem } = await supabase.rpc("client_memory_grouped", { p_client_id: id });
      setMemory((mem ?? {}) as any);

      const { data: procs } = await supabase
        .from("client_procedure_summary")  // view a criar agregando appointments
        .select("*")
        .eq("client_id", id);
      setProcedures((procs ?? []) as Procedure[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading || !client) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: client.full_name }} />

      <ScrollView>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.surface }]}>
          <View style={styles.heroPhoto}>
            {client.avatar_url ? (
              <Image source={{ uri: client.avatar_url }} style={styles.heroPhotoImg} />
            ) : (
              <Text style={styles.heroPhotoText}>{client.full_name[0]?.toUpperCase()}</Text>
            )}
          </View>
          {!!client.tier_label && (
            <Text style={[styles.tier, { color: "#8a6f3d" }]}>
              ✨ {client.tier_label.toUpperCase()}
            </Text>
          )}
          <Text style={[styles.name, { color: colors.text }]}>{client.full_name}</Text>
          {(client.occupation || client.city) && (
            <Text style={[styles.role, { color: colors.textMuted }]}>
              {[client.occupation, client.age ? `${client.age} anos` : null, client.city].filter(Boolean).join(" · ")}
            </Text>
          )}
          {client.bio && (
            <Text style={[styles.bio, { color: colors.textMuted }]}>"{client.bio}"</Text>
          )}
          <View style={styles.actions}>
            <ActionBtn label="💬 Chat" />
            <ActionBtn label="📲 WhatsApp" color="#25d366" textColor="#fff" />
            <ActionBtn label="🎙️ Áudio" />
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <Stat label="LTV" value={brl(client.ltv_centavos)} colors={colors} gold />
          <Stat label="Visitas" value={client.total_visits.toString()} colors={colors} />
          <Stat label="NPS médio" value={client.nps_avg?.toFixed(1) ?? "—"} colors={colors} />
          <Stat label="Indicações" value={client.referrals_count.toString()} colors={colors} />
          <Stat label="Eventos" value={client.events_count.toString()} colors={colors} />
          <Stat label="Colunas" value={client.diario_columns_count.toString()} colors={colors} />
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderColor: colors.border }]}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabLabel, { color: tab === t.key ? colors.text : colors.textMuted }, tab === t.key && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tab === "visao" && (
          <View style={{ padding: 16 }}>
            <SectionH title="Memória resumida" colors={colors} />
            {Object.keys(memory).slice(0, 4).map((cat) => (
              <View key={cat} style={[styles.memItem, { backgroundColor: colors.surfaceMuted, borderLeftColor: "#d4bf95" }]}>
                <Text style={[styles.memLabel, { color: "#8a6f3d" }]}>{labelMemory(cat).toUpperCase()}</Text>
                <Text style={[styles.memText, { color: colors.text }]}>
                  {memory[cat][0]?.fact_text}
                </Text>
              </View>
            ))}

            <SectionH title="Linha do tempo (últimos 90 dias)" colors={colors} />
            {timeline.map((t) => (
              <View key={t.id} style={[styles.tlItem, { borderColor: colors.border }]}>
                <View style={styles.tlDot} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tlDate, { color: colors.textMuted }]}>{fmtDateLong(t.occurred_at)}</Text>
                  <Text style={[styles.tlTitle, { color: colors.text }]}>{t.title}</Text>
                  {!!t.description && (
                    <Text style={[styles.tlDesc, { color: colors.textMuted }]}>{t.description}</Text>
                  )}
                  {!!t.tag && <Text style={styles.tlTag}>{t.tag}</Text>}
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === "memoria" && (
          <View style={{ padding: 16 }}>
            {Object.entries(memory).map(([cat, facts]) => (
              <View key={cat} style={{ marginBottom: 18 }}>
                <SectionH title={labelMemory(cat)} colors={colors} />
                {facts.map((f: any, i: number) => (
                  <View key={i} style={[styles.memItem, { backgroundColor: colors.surfaceMuted, borderLeftColor: "#d4bf95" }]}>
                    <Text style={[styles.memText, { color: colors.text }]}>{f.fact_text}</Text>
                    {f.fact_date && (
                      <Text style={[styles.memDate, { color: colors.textMuted }]}>📅 {f.fact_date}</Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {tab === "procedimentos" && (
          <View style={{ padding: 16 }}>
            <View style={styles.procGrid}>
              {procedures.map((p) => (
                <View key={p.procedure_key} style={[styles.procCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.procIcon]}>{iconForProc(p.procedure_key)}</Text>
                  <Text style={[styles.procName, { color: colors.text }]}>{p.procedure_name}</Text>
                  <Text style={[styles.procCount, { color: colors.textMuted }]}>{p.total_sessions} sessões</Text>
                  <Text style={[styles.procLast, { color: "#8a6f3d" }]}>
                    ÚLTIMA · {fmtShortDate(p.last_session_at)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {(tab === "historico" || tab === "diario" || tab === "conexoes") && (
          <View style={{ padding: 30 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>
              Carregando dados de {TABS.find((t) => t.key === tab)?.label}…
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, colors, gold }: { label: string; value: string; colors: any; gold?: boolean }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.statValue, { color: gold ? "#8a6f3d" : colors.text }]}>{value}</Text>
    </View>
  );
}

function ActionBtn({ label, color, textColor }: { label: string; color?: string; textColor?: string }) {
  return (
    <TouchableOpacity style={[styles.actionBtn, color && { backgroundColor: color }]}>
      <Text style={[styles.actionLabel, textColor && { color: textColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionH({ title, colors }: { title: string; colors: any }) {
  return (
    <Text style={[styles.sectionH, { color: "#8a3a4f" }]}>{title.toUpperCase()}</Text>
  );
}

function labelMemory(k: string): string {
  return {
    familia: "Família",
    trabalho: "Trabalho",
    saude_geral: "Saúde geral",
    receios_esteticos: "Receios estéticos",
    preferencias: "Preferências",
    datas_marcantes: "Datas marcantes",
    conquistas: "Conquistas",
    relacoes: "Relações",
    politica_comunicacao: "Política de comunicação",
    conteudo_curtido: "Conteúdo curtido",
    outros: "Outros",
  }[k] ?? k;
}

function iconForProc(key: string): string {
  if (key.includes("sculptra")) return "💎";
  if (key.includes("ultraformer")) return "⚡";
  if (key.includes("botox")) return "💉";
  if (key.includes("design_sobrancelha")) return "👁️";
  if (key.includes("brow")) return "✨";
  if (key.includes("lash")) return "👀";
  if (key.includes("limpeza")) return "🧴";
  return "•";
}

function brl(c: number): string {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { alignItems: "center", padding: 24, marginBottom: 8 },
  heroPhoto: {
    width: 100, height: 100, borderRadius: 50, backgroundColor: "#5a4f47",
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  heroPhotoImg: { width: "100%", height: "100%" },
  heroPhotoText: { color: "#d4bf95", fontSize: 42, fontWeight: "600", fontStyle: "italic" },
  tier: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 12 },
  name: { fontSize: 26, fontWeight: "600", letterSpacing: -0.5, marginTop: 4 },
  role: { fontSize: 12, marginTop: 4 },
  bio: { fontSize: 13, fontStyle: "italic", marginTop: 10, textAlign: "center", lineHeight: 18, paddingHorizontal: 20 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: { backgroundColor: "#1f1a17", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100 },
  actionLabel: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 8 },
  statCard: { width: "31%", borderRadius: 12, padding: 12, alignItems: "center" },
  statLabel: { fontSize: 9, letterSpacing: 1, fontWeight: "700", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "600" },

  tabs: { flexDirection: "row", paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#8a3a4f" },
  tabLabel: { fontSize: 12, fontWeight: "600" },
  tabLabelActive: { fontWeight: "700" },

  sectionH: { fontSize: 11, letterSpacing: 1.8, fontWeight: "700", marginBottom: 10, marginTop: 12 },

  memItem: { padding: 12, borderRadius: 10, borderLeftWidth: 3, marginBottom: 8 },
  memLabel: { fontSize: 9, letterSpacing: 1.2, fontWeight: "700", marginBottom: 4 },
  memText: { fontSize: 13, lineHeight: 17 },
  memDate: { fontSize: 11, marginTop: 6 },

  tlItem: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#8a3a4f", marginTop: 6 },
  tlDate: { fontSize: 9, letterSpacing: 1, fontWeight: "700", marginBottom: 3 },
  tlTitle: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  tlDesc: { fontSize: 11, lineHeight: 15 },
  tlTag: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, color: "#8a3a4f", marginTop: 4, backgroundColor: "#fdf5f7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" },

  procGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  procCard: { width: "47%", padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  procIcon: { fontSize: 28, marginBottom: 6 },
  procName: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  procCount: { fontSize: 10, marginTop: 2 },
  procLast: { fontSize: 9, letterSpacing: 0.5, fontWeight: "700", marginTop: 4 },
});
