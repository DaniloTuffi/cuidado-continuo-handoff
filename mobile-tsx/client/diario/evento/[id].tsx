// apps/mobile/app/(client)/diario/evento/[id].tsx
// Página de evento Constelação — detalhes + RSVP funcional.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth-context";
import { supabase } from "../../../../lib/supabase";
import { useTheme } from "../../../../lib/theme";

interface DiarioEvent {
  id: string;
  slug: string;
  title: string;
  deck: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  location_address: string | null;
  capacity: number;
  rsvp_count: number;
  host_profile_ids: string[];
  agenda_jsonb: Array<{ time: string; title: string; desc: string }>;
  faq_jsonb: Array<{ q: string; a: string }>;
  min_tier: string | null;
  is_off_record: boolean;
}

interface Host {
  id: string;
  full_name: string;
  role_label: string | null;
}

interface AttendeeAvatar {
  profile_id: string;
  full_name: string;
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<DiarioEvent | null>(null);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [attendees, setAttendees] = useState<AttendeeAvatar[]>([]);
  const [myRsvp, setMyRsvp] = useState<"confirmed" | "waitlist" | "canceled" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const { data: ev } = await supabase
        .from("diario_events")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!ev) return;
      setEvent(ev as DiarioEvent);

      if (ev.host_profile_ids?.length > 0) {
        const { data: hs } = await supabase
          .from("profiles")
          .select("id, full_name, role_label")
          .in("id", ev.host_profile_ids);
        setHosts((hs ?? []) as Host[]);
      }

      const { data: att } = await supabase
        .from("diario_event_rsvp")
        .select("profile_id, profiles!profile_id(full_name)")
        .eq("event_id", id)
        .eq("status", "confirmed")
        .limit(20);
      setAttendees(
        (att ?? []).map((a: any) => ({
          profile_id: a.profile_id,
          full_name: a.profiles?.full_name ?? "—",
        }))
      );

      const { data: myr } = await supabase
        .from("diario_event_rsvp")
        .select("status")
        .eq("event_id", id)
        .eq("profile_id", profile?.id)
        .maybeSingle();
      setMyRsvp((myr?.status as any) ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id, profile?.id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const toggleRsvp = async () => {
    if (!event || !profile) return;
    setSubmitting(true);
    try {
      if (myRsvp === "confirmed") {
        await supabase
          .from("diario_event_rsvp")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("event_id", event.id)
          .eq("profile_id", profile.id);
        await supabase.from("diario_events").update({ rsvp_count: Math.max(0, event.rsvp_count - 1) }).eq("id", event.id);
        setMyRsvp("canceled");
        setEvent({ ...event, rsvp_count: Math.max(0, event.rsvp_count - 1) });
      } else {
        const status = event.rsvp_count >= event.capacity ? "waitlist" : "confirmed";
        const { error } = await supabase.from("diario_event_rsvp").upsert({
          event_id: event.id,
          profile_id: profile.id,
          status,
          confirmed_at: new Date().toISOString(),
        });
        if (error) throw error;
        if (status === "confirmed") {
          await supabase.from("diario_events").update({ rsvp_count: event.rsvp_count + 1 }).eq("id", event.id);
          setEvent({ ...event, rsvp_count: event.rsvp_count + 1 });
        }
        setMyRsvp(status as any);
        Alert.alert(
          status === "confirmed" ? "🌟 Presença confirmada" : "Lista de espera",
          status === "confirmed"
            ? "A Paula vai te chamar no app em alguns minutos com mais detalhes."
            : "Você está na lista de espera. Vamos te avisar quando abrir vaga."
        );
      }
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não consegui processar.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !event) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const remaining = Math.max(0, event.capacity - event.rsvp_count);
  const confirmed = myRsvp === "confirmed";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Encontro" }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: "#1f1a17" }]}>
          <Text style={styles.heroEyebrow}>✨ ENCONTRO CONSTELAÇÃO</Text>
          <Text style={styles.heroTitle}>{event.title}</Text>
          {event.deck && <Text style={styles.heroDeck}>{event.deck}</Text>}

          <View style={styles.metaRow}>
            <MetaItem icon="📅" strong={fmtDateLong(event.starts_at)} sub={fmtTime(event.starts_at) + " às " + fmtTime(event.ends_at)} />
            {event.location && <MetaItem icon="📍" strong={event.location} sub={event.location_address ?? ""} />}
            <MetaItem icon="👥" strong={`${event.capacity} vagas`} sub={`${remaining} restantes`} />
          </View>

          <TouchableOpacity
            style={[styles.heroBtn, confirmed && { backgroundColor: "#6b8e6f" }]}
            onPress={toggleRsvp}
            disabled={submitting}
          >
            <Text style={styles.heroBtnText}>
              {confirmed ? "✓ PRESENÇA CONFIRMADA" : "CONFIRMAR MINHA PRESENÇA"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Programação */}
        {event.agenda_jsonb?.length > 0 && (
          <Section title="Programação" colors={colors}>
            {event.agenda_jsonb.map((slot, i) => (
              <View key={i} style={[styles.agendaRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.agendaTime, { color: "#8a3a4f" }]}>{slot.time}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.agendaTitle, { color: colors.text }]}>{slot.title}</Text>
                  {slot.desc && (
                    <Text style={[styles.agendaDesc, { color: colors.textMuted }]}>{slot.desc}</Text>
                  )}
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* Anfitriãs */}
        {hosts.length > 0 && (
          <Section title="Anfitriãs da noite" colors={colors}>
            {hosts.map((h) => (
              <View key={h.id} style={[styles.host, { backgroundColor: colors.surfaceMuted }]}>
                <View style={styles.hostAvatar}>
                  <Text style={styles.hostAvatarText}>{h.full_name[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={[styles.hostName, { color: colors.text }]}>{h.full_name}</Text>
                  {!!h.role_label && (
                    <Text style={[styles.hostRole, { color: colors.textMuted }]}>{h.role_label}</Text>
                  )}
                </View>
              </View>
            ))}
          </Section>
        )}

        {/* Confirmadas */}
        {attendees.length > 0 && (
          <Section title={`${attendees.length} mulheres já confirmadas`} colors={colors}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {attendees.map((a) => (
                <View key={a.profile_id} style={styles.attendee}>
                  <View style={styles.attAvatar}>
                    <Text style={styles.attAvatarText}>{a.full_name[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.attName, { color: colors.text }]} numberOfLines={1}>
                    {firstAndLastInitial(a.full_name)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Section>
        )}

        {/* FAQ */}
        {event.faq_jsonb?.length > 0 && (
          <Section title="Perguntas frequentes" colors={colors}>
            {event.faq_jsonb.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.faqItem, { borderBottomColor: colors.border }]}
                onPress={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <View style={styles.faqQ}>
                  <Text style={[styles.faqQText, { color: colors.text }]}>{item.q}</Text>
                  <Text style={[styles.faqPlus, { color: "#8a3a4f" }]}>{openFaq === i ? "−" : "+"}</Text>
                </View>
                {openFaq === i && (
                  <Text style={[styles.faqA, { color: colors.textMuted }]}>{item.a}</Text>
                )}
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {event.is_off_record && (
          <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
            🔒 Encontro off-the-record. Sem registro em redes sociais, sem áudio. O que se diz na sala fica na sala.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children, colors }: any) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function MetaItem({ icon, strong, sub }: { icon: string; strong: string; sub: string }) {
  return (
    <View style={styles.metaItem}>
      <View style={styles.metaIcon}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View>
        <Text style={styles.metaStrong}>{strong}</Text>
        <Text style={styles.metaSub}>{sub}</Text>
      </View>
    </View>
  );
}

function fmtDateLong(iso: string): string {
  const days = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const d = new Date(iso);
  return `${days[d.getDay()]} · ${d.getDate()} de ${months[d.getMonth()]}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}h${d.getMinutes().toString().padStart(2, "0")}`;
}

function firstAndLastInitial(full: string): string {
  const parts = full.split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { padding: 26 },
  heroEyebrow: { fontSize: 10, letterSpacing: 2.5, color: "#d4bf95", fontWeight: "700", marginBottom: 16 },
  heroTitle: { fontSize: 38, fontWeight: "600", color: "#fff", letterSpacing: -1.5, lineHeight: 40, marginBottom: 12 },
  heroDeck: { fontSize: 14, fontStyle: "italic", color: "rgba(244,236,226,0.85)", lineHeight: 20, marginBottom: 20 },
  metaRow: { gap: 12, marginBottom: 20 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 12 },
  metaIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(212,191,149,0.15)",
    justifyContent: "center", alignItems: "center",
  },
  metaStrong: { color: "#fff", fontSize: 13, fontWeight: "600" },
  metaSub: { color: "rgba(244,236,226,0.7)", fontSize: 11 },
  heroBtn: {
    backgroundColor: "#b89968",
    paddingVertical: 14, borderRadius: 100, alignItems: "center",
  },
  heroBtnText: { color: "#1f1a17", fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },

  section: { padding: 20 },
  sectionTitle: { fontSize: 22, fontWeight: "600", letterSpacing: -0.3, marginBottom: 14 },

  agendaRow: { flexDirection: "row", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  agendaTime: { fontSize: 18, fontWeight: "600", width: 70 },
  agendaTitle: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  agendaDesc: { fontSize: 12, lineHeight: 16 },

  host: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14, marginBottom: 8, gap: 12 },
  hostAvatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: "#5a4f47",
    justifyContent: "center", alignItems: "center",
  },
  hostAvatarText: { color: "#d4bf95", fontSize: 22, fontWeight: "600", fontStyle: "italic" },
  hostName: { fontSize: 14, fontWeight: "600" },
  hostRole: { fontSize: 11, marginTop: 2 },

  attendee: { alignItems: "center", marginRight: 14, width: 60 },
  attAvatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: "#b89968",
    justifyContent: "center", alignItems: "center", marginBottom: 4,
  },
  attAvatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  attName: { fontSize: 10, fontWeight: "600", textAlign: "center" },

  faqItem: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  faqQ: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  faqQText: { fontSize: 14, fontWeight: "600", flex: 1 },
  faqPlus: { fontSize: 22, fontWeight: "400", paddingLeft: 8 },
  faqA: { fontSize: 13, lineHeight: 18, marginTop: 8 },

  disclaimer: { paddingHorizontal: 26, paddingBottom: 30, fontSize: 11, fontStyle: "italic", textAlign: "center", lineHeight: 16 },
});
