// apps/mobile/app/(employee)/briefing.tsx
//
// Briefing Diário — tela inicial do Modo Profissional.
// Lista as 5 ações priorizadas do dia + score chip + memória das clientes.
//
// Dependências (já existem no repo):
//   - decision-engine: next_best_actions_for_professional (function nova a criar)
//   - tabela appointments + client_details + profile_score_monthly
//   - components/score-chip.tsx

import React, { useCallback, useEffect, useState } from "react";
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
import { ScoreChip } from "../../components/score-chip";

interface NextAction {
  id: string;
  client_id: string;
  client_name: string;
  action_title: string;
  action_desc: string;
  action_context: string;
  priority: "high" | "med" | "low";
  cta_label: string;
  cta_kind: "message" | "call" | "audio" | "script";
}

interface DailyMemory {
  client_id: string;
  client_name: string;
  memory_text: string;
}

interface ProfileStats {
  total_score: number;
  actions_done: number;
  actions_suggested: number;
  nps_avg: number | null;
  repurchases_this_month: number;
  repurchases_target: number;
}

function todayLabel(): string {
  const d = new Date();
  const days = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`;
}

export default function BriefingScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actions, setActions] = useState<NextAction[]>([]);
  const [memories, setMemories] = useState<DailyMemory[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    try {
      // 5 ações priorizadas — function a ser criada no banco
      const { data: actionsData, error: errActions } = await supabase.rpc(
        "next_best_actions_for_professional",
        { p_profile_id: profile.id, p_scope: "today", p_limit: 5 }
      );
      if (errActions) console.warn("next_best_actions error:", errActions.message);
      setActions((actionsData ?? []) as NextAction[]);

      // Memória das clientes do dia
      const todayISO = new Date().toISOString().split("T")[0];
      const { data: appts } = await supabase
        .from("appointments")
        .select("client_id, client_details(id, full_name, memory_notes)")
        .eq("professional_id", profile.id)
        .gte("scheduled_at", `${todayISO}T00:00:00`)
        .lte("scheduled_at", `${todayISO}T23:59:59`);

      setMemories(
        (appts ?? [])
          .filter((a: any) => a.client_details?.memory_notes)
          .map((a: any) => ({
            client_id: a.client_id,
            client_name: a.client_details.full_name,
            memory_text: a.client_details.memory_notes,
          }))
      );

      // Stats do mês corrente
      const ym = currentYearMonth();
      const { data: scoreRow } = await supabase
        .from("profile_score_monthly")
        .select("total_score")
        .eq("profile_id", profile.id)
        .eq("year_month", ym)
        .maybeSingle();

      setStats({
        total_score: Number(scoreRow?.total_score) || 0,
        actions_done: (actionsData ?? []).filter((a: any) => a.executed_at)
          .length,
        actions_suggested: (actionsData ?? []).length,
        nps_avg: null, // a popular via function
        repurchases_this_month: 0,
        repurchases_target: 8,
      });
    } catch (e) {
      console.error("Erro ao carregar briefing:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleAction = async (action: NextAction) => {
    // marcar como executada no log
    await supabase.from("next_best_actions_log").update({
      status: "executed",
      executed_at: new Date().toISOString(),
    }).eq("id", action.id);

    if (action.cta_kind === "message" || action.cta_kind === "audio") {
      router.push(`/(employee)/chat?clientId=${action.client_id}`);
    } else if (action.cta_kind === "call") {
      Alert.alert("Ligar", `Abrir telefone com o número da cliente?`);
    } else {
      router.push(`/(employee)/client-file?id=${action.client_id}`);
    }
    fetchAll();
  };

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: "Briefing Hoje",
          headerRight: () => <ScoreChip />,
        }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchAll();
            }}
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      >
        <Text style={[styles.greeting, { color: colors.textMuted }]}>
          {todayLabel().toUpperCase()}
        </Text>
        <Text style={[styles.name, { color: colors.text }]}>
          {profile?.full_name ?? "Profissional"} ✦
        </Text>
        <Text style={[styles.role, { color: colors.textMuted }]}>
          {profile?.role ?? ""} · {profile?.franchise_name ?? ""}
        </Text>

        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <Stat label="Score" value={`${Math.round(stats.total_score)}/100`} colors={colors} />
            <Stat
              label="Ações hoje"
              value={`${stats.actions_done}/${stats.actions_suggested}`}
              colors={colors}
            />
            <Stat
              label="Recompras"
              value={`${stats.repurchases_this_month}/${stats.repurchases_target}`}
              colors={colors}
            />
          </View>
        )}

        {/* Briefing card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🔔 Suas ações hoje</Text>
            <View style={[styles.badge, { backgroundColor: "#8a3a4f" }]}>
              <Text style={styles.badgeText}>{actions.length} pendentes</Text>
            </View>
          </View>

          {actions.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Nenhuma ação priorizada agora. Atualize daqui a pouco.
            </Text>
          )}

          {actions.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.actionItem, { borderBottomColor: colors.border }]}
              onPress={() => handleAction(a)}
            >
              <View
                style={[
                  styles.priorityBar,
                  {
                    backgroundColor:
                      a.priority === "high"
                        ? "#c25a4a"
                        : a.priority === "med"
                          ? "#b89968"
                          : "#6b8e6f",
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  {a.action_title}
                </Text>
                <Text style={[styles.actionDesc, { color: colors.textMuted }]}>
                  {a.action_desc}
                </Text>
                {!!a.action_context && (
                  <Text style={styles.actionContext}>{a.action_context}</Text>
                )}
              </View>
              <Text style={[styles.actionCta, { color: colors.primary }]}>
                {ctaIcon(a.cta_kind)} {a.cta_label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Memória */}
        {memories.length > 0 && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={styles.cardTitle}>🧠 Memória das suas clientes hoje</Text>
            {memories.map((m) => (
              <TouchableOpacity
                key={m.client_id}
                style={[styles.memoryItem, { borderBottomColor: colors.border }]}
                onPress={() =>
                  router.push(`/(employee)/client-file?id=${m.client_id}`)
                }
              >
                <Text style={[styles.memoryName, { color: colors.text }]}>
                  {m.client_name}
                </Text>
                <Text style={[styles.memoryText, { color: colors.textMuted }]}>
                  {m.memory_text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Nav rápida */}
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.push("/(employee)/pipeline")}
          >
            <Text style={[styles.navIcon]}>📊</Text>
            <Text style={[styles.navLabel, { color: colors.text }]}>Pipeline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.push("/(employee)/score")}
          >
            <Text style={[styles.navIcon]}>⭐</Text>
            <Text style={[styles.navLabel, { color: colors.text }]}>Score</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function ctaIcon(kind: NextAction["cta_kind"]): string {
  switch (kind) {
    case "message": return "💬";
    case "call": return "📞";
    case "audio": return "🎙️";
    case "script": return "📋";
  }
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  greeting: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  name: {
    fontSize: 28,
    fontWeight: "600",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  role: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: 4,
  },
  statValue: { fontSize: 18, fontWeight: "600" },
  card: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  cardTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: "700",
    color: "#8a3a4f",
  },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  actionItem: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "flex-start",
  },
  priorityBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  actionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  actionDesc: { fontSize: 13, lineHeight: 18 },
  actionContext: {
    marginTop: 6,
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: "700",
    color: "#8a3a4f",
    backgroundColor: "#fdf5f7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  actionCta: { fontSize: 12, fontWeight: "700", alignSelf: "center" },
  memoryItem: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memoryName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  memoryText: { fontSize: 12, lineHeight: 17 },
  empty: { fontSize: 13, textAlign: "center", paddingVertical: 16 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  navBtn: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  navIcon: { fontSize: 24 },
  navLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
});
