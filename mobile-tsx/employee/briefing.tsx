// apps/mobile/app/(employee)/briefing.tsx
//
// COMANDO DO DIA — tela inicial do profissional ao logar.
// 7 seções operacionais:
//   1. Estratégia das clientes de hoje (planejamento por atendimento)
//   2. Follow-up das clientes de ontem
//   3. Janela de Ouro · entrando HOJE em D+8 (com script dedicado)
//   4. Zona Perigosa · D+25-30 sem retorno marcado
//   5. Pra presentear hoje (cortesia)
//   6. Divulgar a promoção do dia/semana
//   7. Ações priorizadas (decision-engine)
//
// 100% integrado com schema Belle real via funções RPC da migration 00169.

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Image, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme";
import { ScoreChip } from "../../components/score-chip";
import { GoldenWindowScript } from "../../components/golden-window-script";
import {
  getMyEmployee, getMyScoreSummary,
  getFollowupsYesterday, getGoldenWindowToday, getDangerZone,
  getGiftCandidates, getPromoTargets, getTodayStrategy,
  getNextActions, markActionExecuted, brl,
} from "../../lib/cuidado-continuo-queries";

function todayLabel(): string {
  const d = new Date();
  const days = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]}`;
}

function greetingHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "BOM DIA";
  if (h < 18) return "BOA TARDE";
  return "BOA NOITE";
}

export default function BriefingScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employee, setEmployee] = useState<any>(null);
  const [scoreSum, setScoreSum] = useState<any>(null);

  // 6 seções de dados
  const [strategy, setStrategy] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [goldenWindow, setGoldenWindow] = useState<any[]>([]);
  const [dangerZone, setDangerZone] = useState<any[]>([]);
  const [gifts, setGifts] = useState<any[]>([]);
  const [promo, setPromo] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);

  // Modal do script da Janela de Ouro
  const [scriptClient, setScriptClient] = useState<any | null>(null);

  const fetchAll = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const emp = await getMyEmployee(profile.id);
      setEmployee(emp);
      if (!emp) {
        setLoading(false);
        return;
      }
      const [sc, st, fu, gw, dz, gi, pm, ac] = await Promise.all([
        getMyScoreSummary(profile.id),
        getTodayStrategy(profile.id),
        getFollowupsYesterday(profile.id, 10),
        getGoldenWindowToday(profile.id, 8),
        getDangerZone(profile.id, 10),
        getGiftCandidates(profile.id, 5),
        getPromoTargets(profile.id, 10),
        getNextActions(profile.id, "today", 5),
      ]);
      setScoreSum(sc);
      setStrategy(st);
      setFollowups(fu);
      setGoldenWindow(gw);
      setDangerZone(dz);
      setGifts(gi);
      setPromo(pm);
      setActions(ac);
    } catch (e) {
      console.error("[briefing] erro:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── handlers ───
  const handleOpenScript = (c: any) => setScriptClient(c);
  const handleSendAudio = (clientId: string) => {
    setScriptClient(null);
    router.push(`/(employee)/chat?clientId=${clientId}&mode=audio` as any);
  };
  const handleSendMessage = (clientId: string, message: string) => {
    setScriptClient(null);
    router.push(`/(employee)/chat?clientId=${clientId}&prefill=${encodeURIComponent(message)}` as any);
  };
  const handleScheduleReturn = (clientId: string) => {
    setScriptClient(null);
    router.push(`/(employee)/schedule?clientId=${clientId}&kind=return_check` as any);
  };
  const handleOfferCourtesy = (clientId: string) => {
    setScriptClient(null);
    router.push(`/(employee)/offer-courtesy?clientId=${clientId}` as any);
  };
  const handleAction = async (a: any) => {
    await markActionExecuted(a.id);
    if (a.cta_kind === "message" || a.cta_kind === "audio") {
      router.push(`/(employee)/chat?clientId=${a.client_id}` as any);
    } else if (a.cta_kind === "call") {
      Alert.alert("Ligar", "Abrir telefone com o número da cliente?");
    } else {
      router.push(`/(employee)/client-360?id=${a.client_id}` as any);
    }
    fetchAll();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }
  if (!employee) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.textMuted, padding: 30, textAlign: "center" }}>
          Comando do Dia disponível somente pra profissionais do Estúdio Mais.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: "Comando do Dia", headerRight: () => <ScoreChip /> }}
      />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      >
        {/* Header */}
        <Text style={[styles.greetingLabel, { color: colors.textMuted }]}>{greetingHour()} · {todayLabel().toUpperCase()}</Text>
        <Text style={[styles.name, { color: colors.text }]}>{profile?.full_name?.split(" ")[0] ?? "Profissional"} ✦</Text>
        <Text style={[styles.role, { color: colors.textMuted }]}>
          {employee.position ?? "Profissional"} · {employee.units?.name ?? ""}
        </Text>

        {/* Stats compactos */}
        {scoreSum && (
          <View style={styles.statsRow}>
            <Stat label="Score" value={`${Math.round(scoreSum.total_score)}/100`} colors={colors} />
            <Stat label="Hoje" value={`${strategy.length} clientes`} colors={colors} />
            <Stat label="Follow-up" value={`${followups.length}`} colors={colors} />
            <Stat label="Janela ⚡" value={`${goldenWindow.length}`} colors={colors} hot={goldenWindow.length > 0} />
          </View>
        )}

        {/* ─── 1. ESTRATÉGIA DAS CLIENTES DE HOJE ─── */}
        {strategy.length > 0 && (
          <Section title="🎯 Estratégia · Quem vem hoje" eyebrow="PREPARAR ANTES DE ELAS CHEGAREM" colors={colors}>
            {strategy.map((s) => (
              <TouchableOpacity
                key={s.appointment_id}
                style={[styles.stratCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/(employee)/client-360?id=${s.client_id}` as any)}
              >
                <View style={styles.stratHeader}>
                  <Text style={[styles.stratTime, { color: "#8a3a4f" }]}>{s.start_time}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stratName, { color: colors.text }]}>{s.client_name}</Text>
                    <Text style={[styles.stratMeta, { color: colors.textMuted }]}>
                      {s.service_name} · {s.visit_count}ª visita{s.tier_name && ` · ${s.tier_name}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.stratHint}>
                  <Text style={styles.stratHintLabel}>ESTRATÉGIA</Text>
                  <Text style={[styles.stratHintText, { color: colors.text }]}>{s.strategy_hint}</Text>
                </View>

                {Array.isArray(s.memory_facts) && s.memory_facts.length > 0 && (
                  <View style={styles.stratMemories}>
                    {s.memory_facts.slice(0, 2).map((f: any, i: number) => (
                      <Text key={i} style={[styles.stratMemory, { color: colors.textMuted }]}>
                        🧠 {f.fact}
                      </Text>
                    ))}
                  </View>
                )}

                {!!s.upsell_opportunity && (
                  <Text style={styles.stratUpsell}>💡 {s.upsell_opportunity}</Text>
                )}
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ─── 2. FOLLOW-UP DE ONTEM ─── */}
        {followups.length > 0 && (
          <Section title={`💬 Follow-up · ${followups.length} clientes de ontem`} eyebrow="MENSAGEM AINDA HOJE" colors={colors}>
            {followups.map((f) => (
              <TouchableOpacity
                key={f.appointment_id}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => router.push(`/(employee)/chat?clientId=${f.client_id}&prefill=${encodeURIComponent(f.suggested_opener)}` as any)}
              >
                <Avatar name={f.client_name} url={f.avatar_url} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.text }]}>{f.client_name}</Text>
                  <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                    {f.service_name} · {f.hours_since}h atrás
                  </Text>
                  <Text style={styles.rowSuggestion}>"{f.suggested_opener}"</Text>
                  {!!f.memory_snippet && (
                    <Text style={[styles.rowMemory, { color: colors.textMuted }]}>🧠 {f.memory_snippet}</Text>
                  )}
                </View>
                <Text style={styles.rowCta}>💬</Text>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ─── 3. JANELA DE OURO · D+8 ─── */}
        {goldenWindow.length > 0 && (
          <Section
            title={`⚡ Janela de Ouro · ${goldenWindow.length} entrando em D+8 hoje`}
            eyebrow="12,6× CHANCE DE PREMIUM · CONTATO HOJE"
            accent="#8a3a4f"
            colors={colors}
          >
            {goldenWindow.map((g) => (
              <View key={g.client_id} style={[styles.goldenCard, { backgroundColor: "#fdf5f7", borderColor: "#c97d8e" }]}>
                <View style={styles.row}>
                  <Avatar name={g.client_name} url={g.avatar_url} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: "#1f1a17" }]}>{g.client_name}</Text>
                    <Text style={[styles.rowMeta, { color: "#5a4f47" }]}>
                      {g.procedure_name} · D+{g.days_since} · LTV {brl(g.ltv_centavos)}
                    </Text>
                    {!!g.memory_snippet && (
                      <Text style={styles.goldenMemory}>🧠 {g.memory_snippet}</Text>
                    )}
                    {g.has_upcoming_appt && (
                      <Text style={styles.goldenOk}>✓ Retorno já marcado · só fortalecer vínculo</Text>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.goldenBtn}
                  onPress={() => handleOpenScript(g)}
                >
                  <Text style={styles.goldenBtnText}>📋 ABRIR SCRIPT DA LIGAÇÃO</Text>
                </TouchableOpacity>
              </View>
            ))}
          </Section>
        )}

        {/* ─── 4. ZONA PERIGOSA ─── */}
        {dangerZone.length > 0 && (
          <Section
            title={`🚨 Zona Perigosa · ${dangerZone.length} saindo da janela`}
            eyebrow="ÚLTIMA CHANCE ANTES DA NÃO-RECOMPRA"
            accent="#c25a4a"
            colors={colors}
          >
            {dangerZone.map((d) => (
              <TouchableOpacity
                key={d.client_id}
                style={[styles.dangerCard, { backgroundColor: "#fef0ed" }]}
                onPress={() => router.push(`/(employee)/chat?clientId=${d.client_id}&context=danger` as any)}
              >
                <View style={styles.row}>
                  <Avatar name={d.client_name} url={d.avatar_url} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: "#1f1a17" }]}>{d.client_name}</Text>
                    <Text style={[styles.rowMeta, { color: "#5a4f47" }]}>
                      {d.procedure_name} · LTV {brl(d.ltv_centavos)}
                      {d.last_visit_date && ` · última ${d.last_visit_date}`}
                    </Text>
                    <Text style={styles.dangerUrgency}>{d.urgency_text}</Text>
                    {!!d.memory_snippet && (
                      <Text style={[styles.rowMemory, { color: "#5a4f47" }]}>🧠 {d.memory_snippet}</Text>
                    )}
                  </View>
                  <Text style={styles.rowCta}>📞</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ─── 5. PRA PRESENTEAR ─── */}
        {gifts.length > 0 && (
          <Section
            title={`🎁 Pra presentear · ${gifts.length} merecem mimo`}
            eyebrow="CORTESIA INTELIGENTE · FIDELIZAÇÃO"
            accent="#b89968"
            colors={colors}
          >
            {gifts.map((g) => (
              <TouchableOpacity
                key={g.client_id}
                style={[styles.giftCard, { backgroundColor: "#fff4e0", borderColor: "#f4d999" }]}
                onPress={() => router.push(`/(employee)/offer-courtesy?clientId=${g.client_id}` as any)}
              >
                <Avatar name={g.client_name} url={g.avatar_url} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: "#1f1a17" }]}>{g.client_name}</Text>
                  <Text style={[styles.rowMeta, { color: "#5a4f47" }]}>
                    {g.tier_name ?? "—"} · LTV {brl(g.ltv_centavos)}
                  </Text>
                  <Text style={styles.giftReason}>✨ {g.reason}</Text>
                  <Text style={styles.giftSuggestion}>💝 {g.suggested_gift}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ─── 6. DIVULGAR PROMO ─── */}
        {promo.length > 0 && (
          <Section
            title={`📢 Divulgar · ${promo[0]?.campaign_title}`}
            eyebrow={`${promo[0]?.campaign_kind?.toUpperCase().replace("_"," ")} · ${promo.length} ALVOS RELEVANTES`}
            accent="#6b8e6f"
            colors={colors}
          >
            <View style={styles.promoBanner}>
              <Text style={styles.promoBody}>{promo[0]?.campaign_body}</Text>
              {!!promo[0]?.ends_at && (
                <Text style={styles.promoEnd}>
                  Termina em {new Date(promo[0].ends_at).toLocaleDateString("pt-BR")}
                </Text>
              )}
            </View>
            {promo.map((p) => (
              <TouchableOpacity
                key={p.client_id}
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => router.push(`/(employee)/chat?clientId=${p.client_id}&prefill=${encodeURIComponent(p.campaign_body)}` as any)}
              >
                <Avatar name={p.client_name} url={p.avatar_url} small />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.text }]}>{p.client_name}</Text>
                  <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                    LTV {brl(p.ltv_centavos)} · {p.affinity_reason}
                  </Text>
                </View>
                <Text style={styles.rowCta}>📤</Text>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ─── 7. AÇÕES PRIORIZADAS (decision engine) ─── */}
        {actions.length > 0 && (
          <Section title="🔔 Outras ações priorizadas" eyebrow="DO MOTOR DE DECISÃO" colors={colors}>
            {actions.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[styles.actionItem, { borderBottomColor: colors.border, opacity: a.executed_at ? 0.4 : 1 }]}
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
                  {!!a.action_context && <Text style={styles.actionContext}>{a.action_context}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* Nav */}
        <View style={styles.navRow}>
          <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.surface }]} onPress={() => router.push("/(employee)/pipeline" as any)}>
            <Text style={styles.navIcon}>📊</Text>
            <Text style={[styles.navLabel, { color: colors.text }]}>Pipeline</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navBtn, { backgroundColor: colors.surface }]} onPress={() => router.push("/(employee)/score" as any)}>
            <Text style={styles.navIcon}>⭐</Text>
            <Text style={[styles.navLabel, { color: colors.text }]}>Score</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Modal do script da Janela de Ouro */}
      <GoldenWindowScript
        visible={!!scriptClient}
        client={scriptClient}
        onClose={() => setScriptClient(null)}
        onSendAudio={handleSendAudio}
        onSendMessage={handleSendMessage}
        onScheduleReturn={handleScheduleReturn}
        onOfferCourtesy={handleOfferCourtesy}
      />
    </SafeAreaView>
  );
}

// ── Subcomponentes ──

function Section({ title, eyebrow, children, colors, accent }: any) {
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionEyebrow, { color: accent ?? "#8a3a4f" }]}>{eyebrow}</Text>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Stat({ label, value, colors, hot }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: hot ? "#8a3a4f" : colors.surface }]}>
      <Text style={[styles.statLabel, { color: hot ? "rgba(244,236,226,0.8)" : colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: hot ? "#f4ece2" : colors.text }]}>{value}</Text>
    </View>
  );
}

function Avatar({ name, url, small }: { name: string; url: string | null; small?: boolean }) {
  const size = small ? 30 : 40;
  return (
    <View style={[styles.avatarBox, { width: size, height: size, borderRadius: size / 2 }]}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: small ? 12 : 16 }]}>
          {name?.[0]?.toUpperCase() ?? "?"}
        </Text>
      )}
    </View>
  );
}

// ── Estilos ──
const styles = StyleSheet.create({
  container: { flex: 1 },
  greetingLabel: { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: "700" },
  name: { fontSize: 32, fontWeight: "600", letterSpacing: -1, marginTop: 2 },
  role: { fontSize: 13, marginTop: 2, marginBottom: 16 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 14, padding: 12 },
  statLabel: { fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: "700", marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "600" },

  section: { borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: StyleSheet.hairlineWidth },
  sectionHeader: { paddingBottom: 12, marginBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionEyebrow: { fontSize: 9, letterSpacing: 2, fontWeight: "700", marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },

  row: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "flex-start" },
  avatarBox: { backgroundColor: "#b89968", justifyContent: "center", alignItems: "center", overflow: "hidden", flexShrink: 0 },
  avatarText: { color: "#fff", fontWeight: "700" },
  rowName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  rowMeta: { fontSize: 11, marginBottom: 4 },
  rowSuggestion: { fontSize: 12, color: "#8a3a4f", fontStyle: "italic", lineHeight: 16, marginVertical: 4 },
  rowMemory: { fontSize: 10, marginTop: 4, fontStyle: "italic" },
  rowCta: { fontSize: 20, alignSelf: "center" },

  stratCard: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth },
  stratHeader: { flexDirection: "row", gap: 14, alignItems: "center", marginBottom: 10 },
  stratTime: { fontSize: 18, fontWeight: "700", width: 56 },
  stratName: { fontSize: 15, fontWeight: "600" },
  stratMeta: { fontSize: 11, marginTop: 2 },
  stratHint: { backgroundColor: "rgba(138,58,79,0.08)", padding: 10, borderRadius: 8, marginBottom: 8 },
  stratHintLabel: { fontSize: 8, letterSpacing: 1.5, color: "#8a3a4f", fontWeight: "700", marginBottom: 3 },
  stratHintText: { fontSize: 12, lineHeight: 17 },
  stratMemories: { gap: 4, marginTop: 4 },
  stratMemory: { fontSize: 11, fontStyle: "italic", lineHeight: 15 },
  stratUpsell: { fontSize: 11, color: "#b89968", fontWeight: "600", marginTop: 8, padding: 8, backgroundColor: "rgba(184,153,104,0.1)", borderRadius: 6 },

  goldenCard: { padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1 },
  goldenMemory: { fontSize: 11, color: "#8a3a4f", fontStyle: "italic", marginTop: 4 },
  goldenOk: { fontSize: 10, color: "#6b8e6f", fontWeight: "700", marginTop: 4 },
  goldenBtn: { backgroundColor: "#8a3a4f", paddingVertical: 12, borderRadius: 100, alignItems: "center", marginTop: 12 },
  goldenBtnText: { color: "#fff", fontWeight: "700", letterSpacing: 1.2, fontSize: 12 },

  dangerCard: { borderRadius: 12, padding: 12, marginBottom: 10 },
  dangerUrgency: { fontSize: 11, color: "#c25a4a", fontWeight: "700", letterSpacing: 0.5, marginVertical: 4 },

  giftCard: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, alignItems: "flex-start" },
  giftReason: { fontSize: 11, color: "#8a6f3d", fontWeight: "600", marginTop: 4 },
  giftSuggestion: { fontSize: 12, color: "#1f1a17", marginTop: 2 },

  promoBanner: { backgroundColor: "rgba(107,142,111,0.12)", padding: 12, borderRadius: 10, marginBottom: 10 },
  promoBody: { fontSize: 13, color: "#3a2e2a", lineHeight: 18 },
  promoEnd: { fontSize: 10, color: "#6b8e6f", fontWeight: "700", marginTop: 6, letterSpacing: 0.5 },

  actionItem: { flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  priorityBar: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  actionTitle: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  actionDesc: { fontSize: 11, lineHeight: 15 },
  actionContext: { marginTop: 4, fontSize: 9, letterSpacing: 0.5, fontWeight: "700", color: "#8a3a4f", backgroundColor: "#fdf5f7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: "flex-start" },

  navRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  navBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: "center" },
  navIcon: { fontSize: 24 },
  navLabel: { fontSize: 12, fontWeight: "600", marginTop: 4 },
});
