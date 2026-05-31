// apps/mobile/app/(client)/casa-do-cuidado.tsx
// Casa do Cuidado — home redesenhada do cliente (substitui ou estende portal.tsx).
// Mostra: contador D+X, banner Janela Mágica, cuidados de hoje, sua equipe, Diário, próximas consultas.

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

interface CareSnapshot {
  active_protocol: any | null;
  days_since: number;
  next_appointment: any | null;
  pending_courtesy: any | null;
  todays_actions: any[];
  recent_featured_column: any | null;
  upcoming_event: any | null;
  clube_status: {
    membership_status: string;
    has_active_benefits: boolean;
    medical_consultations_remaining?: number;
    nutri_consultations_remaining?: number;
    waitlist_position?: number | null;
  } | null;
  professional: { id: string; full_name: string; photo_url: string | null } | null;
}

export default function CasaDoCuidado() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [snap, setSnap] = useState<CareSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data: cd } = await supabase
        .from("client_details")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!cd) return;

      // 1. Protocolo ativo
      const { data: protocol } = await supabase
        .from("client_protocol_progress")
        .select(`
          id, started_at, expected_end_at, adherence_score, daily_log,
          protocol_definitions!protocol_definition_id (
            procedure_name, procedure_key, duration_days, daily_actions, emotional_logic
          )
        `)
        .eq("client_id", cd.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const daysSince = protocol
        ? Math.floor((Date.now() - new Date(protocol.started_at).getTime()) / 86400000)
        : 0;

      // 2. Próxima consulta (appointment futuro)
      const today = new Date().toISOString().split("T")[0];
      const { data: appt } = await supabase
        .from("appointments")
        .select(`
          id, date, start_time, services!service_id(name),
          employee_details!employee_id(profile_id, photo_url, profiles!profile_id(full_name))
        `)
        .eq("client_id", cd.id)
        .gte("date", today)
        .in("status", ["scheduled","confirmed"])
        .order("date")
        .limit(1)
        .maybeSingle();

      // 3. Cortesia pendente
      const { data: courtesy } = await supabase
        .from("decision_actions_queue")
        .select("id, action_type, payload, scheduled_for")
        .eq("client_id", cd.id)
        .eq("action_type", "dispatch_courtesy")
        .eq("status", "pending")
        .order("scheduled_for", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 4. Ações de hoje do protocolo
      const dailyActions: any[] = (protocol as any)?.protocol_definitions?.daily_actions ?? [];
      const todays = dailyActions.filter((a: any) => {
        const r = a.day_range ?? [];
        return daysSince >= r[0] && daysSince <= r[1];
      });

      // 5. Última coluna em destaque do Diário
      const { data: column } = await supabase
        .from("diario_columns")
        .select("id, slug, title, deck, cover_image_url, author:profiles!author_profile_id(full_name)")
        .eq("is_featured", true)
        .eq("is_draft", false)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 6. Próximo evento Constelação
      const { data: event } = await supabase
        .from("diario_events")
        .select("id, title, starts_at, location")
        .eq("is_published", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(1)
        .maybeSingle();

      // 7. Status no Clube das Madrinhas (substitui assinaturas)
      const { data: clubeStatus } = await supabase.rpc("client_clube_status", {
        p_client_id: cd.id,
      });

      setSnap({
        active_protocol: protocol,
        days_since: daysSince,
        next_appointment: appt,
        pending_courtesy: courtesy,
        todays_actions: todays,
        recent_featured_column: column,
        upcoming_event: event,
        clube_status: clubeStatus ?? null,
        professional: appt
          ? {
              id: (appt as any).employee_details?.profile_id,
              full_name: (appt as any).employee_details?.profiles?.full_name,
              photo_url: (appt as any).employee_details?.photo_url,
            }
          : null,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Casa do Cuidado" }} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View style={styles.greeting}>
          <Text style={[styles.greetEyebrow, { color: colors.textMuted }]}>BOM DIA, {weekdayBr()}</Text>
          <Text style={[styles.greetName, { color: colors.text }]}>
            Olá, {profile?.full_name?.split(" ")[0] ?? "querida"} ✨
          </Text>
        </View>

        {/* Contador D+X */}
        {snap?.active_protocol && (
          <View style={styles.dayCounter}>
            <Text style={styles.dayLabel}>CUIDADO CONTÍNUO · ESTÚDIO MAIS</Text>
            <Text style={styles.dayNumber}>D+{snap.days_since}</Text>
            <Text style={styles.dayText}>
              desde sua {(snap.active_protocol as any).protocol_definitions?.procedure_name}
              {snap.professional && ` com a ${snap.professional.full_name?.split(" ")[0]}`}
            </Text>
          </View>
        )}

        {/* Banner Janela Mágica (cortesia pendente) */}
        {snap?.pending_courtesy && (
          <TouchableOpacity
            style={styles.magicBanner}
            onPress={() => router.push("/(client)/my-appointments")}
          >
            <Text style={styles.magicLabel}>🎁 CONVITE ESPECIAL PRA VOCÊ</Text>
            <Text style={styles.magicTitle}>
              {(snap.pending_courtesy.payload as any)?.title ?? "Sua cortesia está reservada"}
            </Text>
            <Text style={styles.magicText}>
              {(snap.pending_courtesy.payload as any)?.description ?? ""}
            </Text>
            <View style={styles.magicCta}>
              <Text style={styles.magicCtaText}>ESCOLHER MEU HORÁRIO →</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Próxima visita */}
        {snap?.next_appointment && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardEyebrow, { color: "#8a6f3d" }]}>SUA PRÓXIMA VISITA</Text>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {(snap.next_appointment as any).services?.name}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
              {fmtApptDate(snap.next_appointment.date)} · {snap.next_appointment.start_time?.slice(0, 5)}
              {snap.professional && ` · com ${snap.professional.full_name}`}
            </Text>
          </View>
        )}

        {/* Cuidados de hoje */}
        {snap && snap.todays_actions.length > 0 && (
          <>
            <Text style={[styles.sectionH, { color: "#8a3a4f" }]}>HOJE NO SEU CUIDADO</Text>
            {snap.todays_actions.map((a: any) => (
              <View key={a.id} style={[styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.actionDay, { color: "#8a6f3d" }]}>
                  {a.time_of_day ? a.time_of_day.toUpperCase() : "HOJE"} · D+{snap.days_since}
                </Text>
                <Text style={[styles.actionTitle, { color: colors.text }]}>{a.action}</Text>
              </View>
            ))}

            <TouchableOpacity
              style={styles.assessmentLink}
              onPress={() => router.push("/(client)/self-assessment")}
            >
              <Text style={styles.assessmentText}>📊 Quer registrar como você está hoje? →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Sua equipe */}
        {snap?.professional && (
          <>
            <Text style={[styles.sectionH, { color: "#8a3a4f" }]}>SUA EQUIPE</Text>
            <TouchableOpacity
              style={[styles.personRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push("/(client)/chat")}
            >
              <View style={styles.personAvatar}>
                {snap.professional.photo_url ? (
                  <Image source={{ uri: snap.professional.photo_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                ) : (
                  <Text style={styles.personAvatarText}>{snap.professional.full_name[0]?.toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.personName, { color: colors.text }]}>
                  {snap.professional.full_name} · Sua designer
                </Text>
                <Text style={[styles.personSub, { color: colors.textMuted }]}>Online · responde até 18h</Text>
              </View>
              <Text style={styles.chatIcon}>💬</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.personRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => router.push("/(client)/ai-care-chat")}
            >
              <View style={[styles.personAvatar, { backgroundColor: "#1f1a17" }]}>
                <Text style={[styles.personAvatarText, { color: "#d4bf95" }]}>IA</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.personName, { color: colors.text }]}>Cuidadora 24/7</Text>
                <Text style={[styles.personSub, { color: colors.textMuted }]}>Dúvidas a qualquer hora</Text>
              </View>
              <Text style={styles.chatIcon}>💬</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Diário */}
        {snap?.recent_featured_column && (
          <>
            <Text style={[styles.sectionH, { color: "#8a3a4f" }]}>VOCÊ NO DIÁRIO ESTÚDIO MAIS</Text>
            <TouchableOpacity
              style={[styles.diarioCard]}
              onPress={() => router.push(`/(client)/diario/${snap.recent_featured_column.slug}`)}
            >
              <Text style={styles.diarioLabel}>📰 COLUNA EM DESTAQUE</Text>
              <Text style={styles.diarioTitle}>"{snap.recent_featured_column.title}"</Text>
              <Text style={styles.diarioMeta}>
                Por {snap.recent_featured_column.author?.full_name}
              </Text>
              <Text style={styles.diarioCta}>LER NO DIÁRIO →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Evento */}
        {snap?.upcoming_event && (
          <TouchableOpacity
            style={[styles.eventCard, { backgroundColor: "#faf7f1", borderColor: "#b89968" }]}
            onPress={() => router.push(`/(client)/diario/evento/${snap.upcoming_event.id}`)}
          >
            <Text style={[styles.eventLabel, { color: "#8a6f3d" }]}>🌟 ENCONTRO CONSTELAÇÃO PRA VOCÊ</Text>
            <Text style={[styles.eventTitle, { color: colors.text }]}>
              {snap.upcoming_event.title}
            </Text>
            <Text style={[styles.eventMeta, { color: colors.textMuted }]}>
              {fmtApptDate(snap.upcoming_event.starts_at)} · {snap.upcoming_event.location}
            </Text>
          </TouchableOpacity>
        )}

        {/* Clube das Madrinhas — banner contextual ao status */}
        {snap?.clube_status?.membership_status === "active" || snap?.clube_status?.membership_status === "invited" ? (
          <TouchableOpacity
            style={styles.clubeActiveBanner}
            onPress={() => router.push("/(client)/clube-madrinhas/painel" as any)}
          >
            <Text style={styles.clubeActiveTag}>✦ MADRINHA · ACESSO PLENO</Text>
            <Text style={styles.clubeActiveTitle}>Seu Painel das Madrinhas</Text>
            <Text style={styles.clubeActiveText}>
              {snap.clube_status.has_active_benefits
                ? `Você tem acompanhamento médico/nutri ativo · ${snap.clube_status.medical_consultations_remaining ?? 0} consultas médicas, ${snap.clube_status.nutri_consultations_remaining ?? 0} com nutri restantes.`
                : "Descontos exclusivos, pré-lançamentos e estoques limitados estão te esperando."}
            </Text>
            <Text style={styles.clubeActiveCta}>ABRIR PAINEL →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.subUpsell}
            onPress={() => router.push("/(client)/clube-madrinhas" as any)}
          >
            <Text style={styles.subUpsellTag}>✦ EXCLUSIVO · 360 MULHERES</Text>
            <Text style={styles.subUpsellTitle}>Sou Madrinha</Text>
            <Text style={styles.subUpsellText}>
              {snap?.clube_status?.membership_status === "waitlist"
                ? `Você está na posição #${snap.clube_status.waitlist_position ?? "—"} da fila. Veja a história do Clube.`
                : "Uma camada do Estúdio Mais que pouca gente vê. Madrinhas têm acesso a estoques limitados e parte do que pagam financia mulheres do Instituto."}
            </Text>
            <Text style={styles.subUpsellCta}>VERIFICAR ACESSO →</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function weekdayBr(): string {
  const d = ["DOMINGO","SEGUNDA-FEIRA","TERÇA-FEIRA","QUARTA-FEIRA","QUINTA-FEIRA","SEXTA-FEIRA","SÁBADO"];
  return d[new Date().getDay()];
}

function fmtApptDate(iso: string): string {
  const d = new Date(iso);
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${d.getDate()} de ${months[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  greeting: { padding: 20 },
  greetEyebrow: { fontSize: 11, letterSpacing: 1, fontWeight: "600" },
  greetName: { fontSize: 28, fontWeight: "600", letterSpacing: -0.5, marginTop: 4 },
  dayCounter: {
    marginHorizontal: 16, padding: 22,
    background: "linear-gradient(135deg, #8a3a4f, #c97d8e)",
    backgroundColor: "#8a3a4f",
    borderRadius: 22, marginBottom: 18,
  },
  dayLabel: { fontSize: 10, letterSpacing: 1.5, color: "rgba(244,236,226,0.8)", fontWeight: "700", marginBottom: 8 },
  dayNumber: { fontSize: 48, fontWeight: "300", color: "#f4ece2", letterSpacing: -2, lineHeight: 48, marginBottom: 6 },
  dayText: { fontSize: 14, color: "rgba(244,236,226,0.95)" },
  magicBanner: { marginHorizontal: 16, marginBottom: 18, padding: 18, borderRadius: 20, backgroundColor: "#fff4e0", borderWidth: 1, borderColor: "#f4d999" },
  magicLabel: { fontSize: 10, letterSpacing: 1.5, color: "#b89968", fontWeight: "700", marginBottom: 6 },
  magicTitle: { fontSize: 18, fontWeight: "700", color: "#1f1a17", marginBottom: 6 },
  magicText: { fontSize: 13, color: "#5a4f47", lineHeight: 18, marginBottom: 12 },
  magicCta: { backgroundColor: "#1f1a17", paddingVertical: 10, borderRadius: 100, alignItems: "center" },
  magicCtaText: { color: "#fff", fontWeight: "700", fontSize: 11, letterSpacing: 1 },
  card: { marginHorizontal: 16, marginBottom: 12, padding: 18, borderRadius: 20, borderWidth: 1 },
  cardEyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: "700", textTransform: "uppercase", marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  cardMeta: { fontSize: 13 },
  sectionH: { fontSize: 12, letterSpacing: 1.5, fontWeight: "600", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 10 },
  actionCard: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 16, borderWidth: 1 },
  actionDay: { fontSize: 10, letterSpacing: 1.2, fontWeight: "700", marginBottom: 6 },
  actionTitle: { fontSize: 14, lineHeight: 18 },
  assessmentLink: { marginHorizontal: 16, paddingVertical: 10, alignItems: "center", marginBottom: 16 },
  assessmentText: { color: "#8a3a4f", fontSize: 12, fontWeight: "600" },
  personRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 16, borderWidth: 1, gap: 12 },
  personAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#b89968", justifyContent: "center", alignItems: "center" },
  personAvatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  personName: { fontSize: 14, fontWeight: "600" },
  personSub: { fontSize: 11, marginTop: 2 },
  chatIcon: { fontSize: 20 },
  diarioCard: { marginHorizontal: 16, marginBottom: 12, padding: 18, borderRadius: 18, backgroundColor: "#1f1a17" },
  diarioLabel: { fontSize: 10, letterSpacing: 1.5, color: "#d4bf95", fontWeight: "700", marginBottom: 6 },
  diarioTitle: { fontSize: 18, fontStyle: "italic", color: "#f4ece2", marginBottom: 8 },
  diarioMeta: { fontSize: 11, color: "rgba(244,236,226,0.7)", marginBottom: 12 },
  diarioCta: { fontSize: 11, letterSpacing: 1, color: "#b89968", fontWeight: "700" },
  eventCard: { marginHorizontal: 16, marginVertical: 8, padding: 18, borderRadius: 18, borderWidth: 1 },
  eventLabel: { fontSize: 10, letterSpacing: 1.5, fontWeight: "700", marginBottom: 6 },
  eventTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  eventMeta: { fontSize: 12 },
  subUpsell: { marginHorizontal: 16, marginTop: 12, padding: 20, borderRadius: 20, backgroundColor: "#1f1a17" },
  subUpsellTag: { fontSize: 10, letterSpacing: 1.5, color: "#d4bf95", fontWeight: "700", marginBottom: 6 },
  subUpsellTitle: { fontSize: 20, fontWeight: "600", color: "#f4ece2", marginBottom: 6 },
  subUpsellText: { fontSize: 13, color: "rgba(244,236,226,0.85)", lineHeight: 18, marginBottom: 12 },
  subUpsellCta: { fontSize: 11, letterSpacing: 1.5, color: "#b89968", fontWeight: "700" },
  clubeActiveBanner: { marginHorizontal: 16, marginTop: 12, padding: 20, borderRadius: 20, backgroundColor: "#3a2e2a", borderWidth: 1, borderColor: "#b89968" },
  clubeActiveTag: { fontSize: 10, letterSpacing: 1.5, color: "#d4bf95", fontWeight: "700", marginBottom: 6 },
  clubeActiveTitle: { fontSize: 20, fontWeight: "600", color: "#f4ece2", marginBottom: 6 },
  clubeActiveText: { fontSize: 13, color: "rgba(244,236,226,0.85)", lineHeight: 18, marginBottom: 12 },
  clubeActiveCta: { fontSize: 11, letterSpacing: 1.5, color: "#b89968", fontWeight: "700" },
});
