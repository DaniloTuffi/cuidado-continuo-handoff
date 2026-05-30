// apps/mobile/components/score-chip.tsx
//
// Chip compacto do Score de Cuidado, persistente no header das telas
// do Modo Profissional. Click abre popover com breakdown rápido.
//
// Uso:
//   import { ScoreChip } from "@/components/score-chip";
//   <ScoreChip />   // só funciona se useAuth().role for "employee"+

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth-context";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

interface ScoreSummary {
  total_score: number;
  trend_vs_last_month: number;
  premio_centavos: number;
  execucao_score: number;
  relacionamento_score: number;
  vendas_score: number;
  cocriacao_score: number;
  ranking_unidade: number | null;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function brlFromCentavos(c: number): string {
  return (c / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}

export function ScoreChip() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<ScoreSummary | null>(null);

  const fetchScore = useCallback(async () => {
    if (!profile?.id) return;
    const ym = currentYearMonth();
    const { data } = await supabase
      .from("profile_score_monthly")
      .select(
        "total_score, premio_centavos, execucao_score, relacionamento_score, vendas_score, cocriacao_score, ranking_unidade"
      )
      .eq("profile_id", profile.id)
      .eq("year_month", ym)
      .maybeSingle();

    // Mês anterior pra trend
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const ymPrev = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    const { data: dataPrev } = await supabase
      .from("profile_score_monthly")
      .select("total_score")
      .eq("profile_id", profile.id)
      .eq("year_month", ymPrev)
      .maybeSingle();

    if (data) {
      setScore({
        total_score: Number(data.total_score) || 0,
        trend_vs_last_month: dataPrev
          ? Math.round(Number(data.total_score) - Number(dataPrev.total_score))
          : 0,
        premio_centavos: data.premio_centavos || 0,
        execucao_score: Number(data.execucao_score) || 0,
        relacionamento_score: Number(data.relacionamento_score) || 0,
        vendas_score: Number(data.vendas_score) || 0,
        cocriacao_score: Number(data.cocriacao_score) || 0,
        ranking_unidade: data.ranking_unidade,
      });
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchScore();
    const id = setInterval(fetchScore, 5 * 60 * 1000); // 5 min
    return () => clearInterval(id);
  }, [fetchScore]);

  if (!score) return null;

  const trendColor =
    score.trend_vs_last_month > 0
      ? "#6b8e6f"
      : score.trend_vs_last_month < 0
        ? colors.danger
        : colors.textMuted;
  const trendLabel =
    score.trend_vs_last_month === 0
      ? "—"
      : `${score.trend_vs_last_month > 0 ? "↑" : "↓"}${Math.abs(score.trend_vs_last_month)}`;

  return (
    <>
      <TouchableOpacity
        style={[styles.chip, { backgroundColor: isDark ? "#2a2331" : "#1f1a17" }]}
        onPress={() => setOpen(true)}
        accessibilityLabel="Abrir resumo do Score de Cuidado"
      >
        <Text style={styles.star}>⭐</Text>
        <Text style={styles.value}>{Math.round(score.total_score)}</Text>
        <Text style={[styles.trend, { color: trendColor }]}>{trendLabel}</Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.popover,
              { backgroundColor: isDark ? "#1a1722" : "#1f1a17" },
            ]}
            onPress={() => {}}
          >
            <View style={styles.popHeader}>
              <Text style={styles.popTitle}>⭐ Score · {monthLabel()}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={styles.popClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.popBig}>
              <Text style={styles.popNum}>
                {Math.round(score.total_score)}
                <Text style={styles.popMax}>/100</Text>
              </Text>
              {score.ranking_unidade && (
                <Text style={styles.popSub}>
                  ✦ {ordinal(score.ranking_unidade)} da unidade · {trendLabel} vs mês passado
                </Text>
              )}
            </View>

            {score.premio_centavos > 0 && (
              <View style={styles.popPrize}>
                <Text style={styles.popPrizeTag}>🏆 Prêmio do mês desbloqueado</Text>
                <Text style={styles.popPrizeVal}>
                  {brlFromCentavos(score.premio_centavos)}
                </Text>
              </View>
            )}

            <KpiRow name="🎯 Execução" pct={score.execucao_score} />
            <KpiRow name="💝 Relacionamento" pct={score.relacionamento_score} />
            <KpiRow name="💰 Vendas" pct={score.vendas_score} />
            <KpiRow name="🌟 Co-Criação" pct={score.cocriacao_score} />

            <TouchableOpacity
              style={styles.popCta}
              onPress={() => {
                setOpen(false);
                router.push("/(employee)/score");
              }}
            >
              <Text style={styles.popCtaText}>Ver Score completo →</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function KpiRow({ name, pct }: { name: string; pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <View style={styles.kpiRow}>
      <Text style={styles.kpiName}>{name}</Text>
      <View style={styles.kpiBar}>
        <View style={[styles.kpiFill, { width: `${p}%` }]} />
      </View>
      <Text style={styles.kpiVal}>{p}%</Text>
    </View>
  );
}

function ordinal(n: number): string {
  return `${n}º`;
}

function monthLabel(): string {
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(184,153,104,0.4)",
    gap: 6,
  },
  star: { fontSize: 13, color: "#b89968" },
  value: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f4ece2",
    letterSpacing: -0.5,
  },
  trend: { fontSize: 10, fontWeight: "700" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 70,
    paddingRight: 16,
  },
  popover: {
    width: 320,
    borderRadius: 18,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 20,
  },
  popHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  popTitle: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#d4bf95",
    fontWeight: "700",
  },
  popClose: { color: "rgba(244,236,226,0.5)", fontSize: 18 },
  popBig: { alignItems: "center", marginBottom: 14 },
  popNum: {
    fontSize: 60,
    fontWeight: "600",
    color: "#f4ece2",
    letterSpacing: -2,
    lineHeight: 60,
  },
  popMax: { fontSize: 22, color: "#d4bf95", fontWeight: "400" },
  popSub: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#d4bf95",
    fontWeight: "700",
    marginTop: 4,
  },
  popPrize: {
    backgroundColor: "rgba(184,153,104,0.15)",
    borderWidth: 1,
    borderColor: "rgba(184,153,104,0.3)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  popPrizeTag: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#d4bf95",
    fontWeight: "700",
  },
  popPrizeVal: {
    fontSize: 24,
    fontWeight: "600",
    color: "#b89968",
    marginTop: 4,
  },
  kpiRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    gap: 8,
  },
  kpiName: { flex: 1, fontSize: 11, color: "rgba(244,236,226,0.85)" },
  kpiBar: {
    width: 80,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
    overflow: "hidden",
  },
  kpiFill: { height: 4, backgroundColor: "#b89968" },
  kpiVal: { fontSize: 11, fontWeight: "700", color: "#d4bf95", width: 38, textAlign: "right" },
  popCta: {
    backgroundColor: "#b89968",
    borderRadius: 100,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 14,
  },
  popCtaText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#1f1a17",
  },
});
