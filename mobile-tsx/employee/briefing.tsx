// apps/mobile/app/(employee)/briefing.tsx
//
// Briefing Diário — tela inicial do Modo Profissional.
// 100% integrada com schema real: employee_details + decision_actions_queue + appointments(date,start_time).

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme";
import { ScoreChip } from "../../components/score-chip";
import {
  getMyEmployee, getNextActions, getTodayAppointments, getMyScoreSummary, markActionExecuted,
} from "../../lib/cuidado-continuo-queries";

function todayLabel(): string {
  const d = new Date();
  const days = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`;
}

function ctaIcon(kind: string): string {
  if (kind === "message") return "💬";
  if (kind === "call") return "📞";
  if (kind === "audio") return "🎙️";
  if (kind === "script") return "📋";
  return "→";
}

export default function BriefingScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employee, setEmployee] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [scoreSum, setScoreSum] = useState<any>(null);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const emp = await getMyEmployee(profile.id);
      setEmployee(emp);
      if (!emp) {
        // não é employee → fallback
        setActions([]); setAppointments([]); setScoreSum(null);
        return;
      }
      const [acts, appts, sc] = await Promise.all([
        getNextActions(profile.id, "today", 5),
        getTodayAppointments(emp.id),
        getMyScoreSummary(profile.id),
      ]);
      setActions(acts);
      setAppointments(appts);
      setScoreSum(sc);
    } catch (e) {
      console.error("[briefing] erro:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleAction = async (action: any) => {
    await markActionExecuted(action.id);
    if (action.cta_kind === "message" || action.cta_kind === "audio") {
      router.push(`/(employee)/chat?clientId=${action.client_id}`);
    } else if (action.cta_kind === "call") {
      Alert.alert("Ligar", "Abrir telefone com o número da cliente?");
    } else {
      router.push(`/(employee)/client-file?id=${action.client_id}`);
    }
    fetchAll();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!employee) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textMuted, padding: 30, textAlign: "center" }}>
          Briefing disponível somente para funcionários do Estúdio Mais.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Briefing Hoje",
          headerRight: () => <ScoreChip />,
        }}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      >
        <Text style={[styles.greeting, { color: colors.textMuted }]}>{todayLabel().toUpperCase()}</Text>
        <Text style={[styles.name, { color: colors.text }]}>{profile?.full_name ?? "Profissional"} ✦</Text>
        <Text style={[styles.role, { color: colors.textMuted }]}>
          {employee.position ?? "Profissional"} · {employee.units?.name ?? ""}
        </Text>

        {scoreSum && (
          <View style={styles.statsRow}>
            <Stat label="Score" value={`${Math.round(scoreSum.total_score)}/100`} colors={colors} />
            <Stat label="Ações hoje" value={`${actions.filter(a => a.executed_at).length}/${actions.length}`} colors={colors} />
            <Stat label="Agendados hoje" value={appointments.length.toString()} colors={colors} />
          </View>
        )}

        {/* Briefing card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>🔔 Suas ações hoje</Text>
            <View style={[styles.badge, { backgroundColor: "#8a3a4f" }]}>
              <Text style={styles.badgeText}>
                {actions.filter(a => !a.executed_at).length} pendentes
              </Text>
            </View>
          </View>

          {actions.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Nada priorizado agora. Atualize daqui a pouco — o sistema decide a cada execução do decision-engine.
            </Text>
          )}

          {actions.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={[styles.actionItem, { borderBottomColor: colors.border, opacity: a.executed_at ? 0.5 : 1 }]}
              onPress={() => handleAction(a)}
            >
              <View
                style={[styles.priorityBar, {
                  backgroundColor: a.priority === "high" ? "#c25a4a" : a.priority === "med" ? "#b89968" : "#6b8e6f",
                }]}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>{a.action_title}</Text>
                <Text style={[styles.actionDesc, { color: colors.textMuted }]}>
                  {a.client_name} · {a.action_desc}
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

        {/* Agenda do dia */}
        {appointments.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={styles.cardTitle}>📅 Agenda de hoje</Text>
            {appointments.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.apptItem, { borderBottomColor: colors.border }]}
                onPress={() => router.push(`/(employee)/client-file?id=${a.client_id}`)}
              >
                <View style={styles.apptTime}>
                  <Text style={[styles.apptTimeText, { color: "#8a3a4f" }]}>{a.start_time?.slice(0, 5) ?? "—"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.apptName, { color: colors.text }]}>
                    {a.client_details?.profiles?.full_name ?? "Cliente"}
                  </Text>
                  <Text style={[styles.apptService, { color: colors.textMuted }]}>
                    {a.services?.name ?? "—"} · {a.status}
                  </Text>
                  {!!a.client_details?.memory_notes && (
                    <Text style={[styles.apptMemory, { color: colors.textMuted }]} numberOfLines={2}>
                      🧠 {a.client_details.memory_notes}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Nav rápida */}
        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.surface }]} onPress={() => router.push("/(employee)/pipeline")}>
            <Text style={styles.navIcon}>📊</Text>
            <Text style={[styles.navLabel, { color: colors.text }]}>Pipeline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.surface }]} onPress={() => router.push("/(employee)/score")}>
            <Text style={styles.navIcon}>⭐</Text>
            <Text style={[styles.navLabel, { color: colors.text }]}>Score</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, colors }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  greeting: { fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" },
  name: { fontSize: 28, fontWeight: "600", letterSpacing: -0.5, marginTop: 2 },
  role: { fontSize: 13, marginTop: 2, marginBottom: 16 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 14, padding: 12 },
  statLabel: { fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "600" },
  card: { borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(0,0,0,0.08)" },
  cardTitle: { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "700", color: "#8a3a4f" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  actionItem: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  priorityBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  actionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  actionDesc: { fontSize: 13, lineHeight: 18 },
  actionContext: { marginTop: 6, fontSize: 10, letterSpacing: 0.5, fontWeight: "700", color: "#8a3a4f", backgroundColor: "#fdf5f7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start" },
  actionCta: { fontSize: 12, fontWeight: "700", alignSelf: "center" },
  apptItem: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  apptTime: { width: 50, alignItems: "center", justifyContent: "center" },
  apptTimeText: { fontSize: 16, fontWeight: "600" },
  apptName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  apptService: { fontSize: 11 },
  apptMemory: { fontSize: 11, fontStyle: "italic", marginTop: 4, lineHeight: 14 },
  empty: { fontSize: 13, textAlign: "center", paddingVertical: 16 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  navBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: "center" },
  navIcon: { fontSize: 24 },
  navLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
});
