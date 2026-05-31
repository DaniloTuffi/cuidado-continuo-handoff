// apps/mobile/app/(client)/self-assessment.tsx
// Análises Domésticas — cliente registra estado em casa.
// Cada análise vira sinal pro decision-engine + alimenta KPI Score profissional.

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

type Kind =
  | "photo_evolution" | "pain_scale" | "sleep_quality" | "energy_level"
  | "cycle_log" | "skin_hydration" | "mood_check" | "inchaco_post_op" | "side_effect_check";

const KINDS: { key: Kind; emoji: string; title: string; subtitle: string; scale: "0to10" | "low_med_high" | "text" }[] = [
  { key: "pain_scale",       emoji: "🤕", title: "Dor",            subtitle: "Como está sua dor agora?",    scale: "0to10" },
  { key: "inchaco_post_op",  emoji: "💧", title: "Inchaço",        subtitle: "Visual do inchaço da área",   scale: "0to10" },
  { key: "skin_hydration",   emoji: "✨", title: "Hidratação",     subtitle: "Sua pele está…",              scale: "low_med_high" },
  { key: "sleep_quality",    emoji: "😴", title: "Sono",           subtitle: "Qualidade do sono ontem",     scale: "low_med_high" },
  { key: "energy_level",     emoji: "⚡", title: "Energia",         subtitle: "Nível de energia hoje",       scale: "low_med_high" },
  { key: "mood_check",       emoji: "💖", title: "Como você está", subtitle: "Bem-estar emocional",         scale: "low_med_high" },
  { key: "side_effect_check",emoji: "🚨", title: "Efeito estranho?", subtitle: "Notou algo fora do esperado?", scale: "text" },
  { key: "photo_evolution",  emoji: "📷", title: "Foto evolução",  subtitle: "Tire foto da área",          scale: "text" },
];

export default function SelfAssessmentScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Kind | null>(null);
  const [value, setValue] = useState<number | string | null>(null);
  const [note, setNote] = useState("");
  const [recent, setRecent] = useState<any[]>([]);

  const loadRecent = useCallback(async () => {
    if (!profile?.id) return;
    const { data: cd } = await supabase.from("client_details").select("id").eq("profile_id", profile.id).maybeSingle();
    if (!cd) return;
    const { data } = await supabase
      .from("client_self_assessments")
      .select("id, kind, numeric_value, scale_value, text_note, created_at, alert_triggered")
      .eq("client_id", cd.id)
      .order("created_at", { ascending: false })
      .limit(8);
    setRecent(data ?? []);
  }, [profile?.id]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const submit = async () => {
    if (!profile?.id || !selected) return;
    const kind = KINDS.find((k) => k.key === selected)!;
    if (kind.scale !== "text" && value === null) {
      Alert.alert("Selecione um valor.");
      return;
    }
    setLoading(true);
    try {
      const { data: cd } = await supabase.from("client_details").select("id").eq("profile_id", profile.id).maybeSingle();
      if (!cd) throw new Error("client not found");

      const { data: protocol } = await supabase
        .from("client_protocol_progress")
        .select("id, started_at, protocol_definitions(procedure_key)")
        .eq("client_id", cd.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const dayRel = protocol
        ? Math.floor((Date.now() - new Date(protocol.started_at).getTime()) / 86400000)
        : null;

      const payload: Record<string, unknown> = {
        client_id: cd.id,
        related_protocol_id: protocol?.id ?? null,
        related_procedure_key: (protocol as any)?.protocol_definitions?.procedure_key ?? null,
        kind: selected,
        day_relative: dayRel,
        text_note: note.trim() || null,
      };

      if (kind.scale === "0to10") payload.numeric_value = value;
      else if (kind.scale === "low_med_high") payload.scale_value = value;

      const { error } = await supabase.from("client_self_assessments").insert(payload);
      if (error) throw error;

      Alert.alert(
        "✅ Registrado",
        "Sua profissional vê isso no próximo briefing. Se for sério, ela te liga.",
        [{ text: "OK", onPress: () => { setSelected(null); setValue(null); setNote(""); loadRecent(); } }]
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setLoading(false);
    }
  };

  const currentKind = selected ? KINDS.find((k) => k.key === selected) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Análise Doméstica" }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {!selected && (
          <>
            <Text style={[styles.intro, { color: colors.textMuted }]}>
              Registre como você está agora. Sua profissional acompanha — se algo fugir do esperado, ela te liga.
            </Text>

            <View style={styles.kindGrid}>
              {KINDS.map((k) => (
                <TouchableOpacity
                  key={k.key}
                  style={[styles.kindCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setSelected(k.key)}
                >
                  <Text style={styles.kindEmoji}>{k.emoji}</Text>
                  <Text style={[styles.kindTitle, { color: colors.text }]}>{k.title}</Text>
                  <Text style={[styles.kindSub, { color: colors.textMuted }]}>{k.subtitle}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {recent.length > 0 && (
              <>
                <Text style={[styles.sectionH, { color: "#8a3a4f" }]}>SUAS ÚLTIMAS ANÁLISES</Text>
                {recent.map((r) => (
                  <View key={r.id} style={[styles.recentItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.recentTitle, { color: colors.text }]}>
                        {KINDS.find((k) => k.key === r.kind)?.emoji ?? ""} {KINDS.find((k) => k.key === r.kind)?.title}
                      </Text>
                      <Text style={[styles.recentVal, { color: colors.textMuted }]}>
                        {r.numeric_value !== null ? `${r.numeric_value}/10` : r.scale_value ?? r.text_note?.substring(0, 40)}
                      </Text>
                    </View>
                    <Text style={[styles.recentTime, { color: colors.textMuted }]}>
                      {fmtRel(r.created_at)}
                    </Text>
                    {r.alert_triggered && <Text style={styles.alert}>⚠️</Text>}
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {currentKind && (
          <View style={{ marginTop: 20 }}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={[styles.back, { color: colors.textMuted }]}>← Voltar</Text>
            </TouchableOpacity>
            <Text style={styles.bigEmoji}>{currentKind.emoji}</Text>
            <Text style={[styles.bigTitle, { color: colors.text }]}>{currentKind.title}</Text>
            <Text style={[styles.bigSub, { color: colors.textMuted }]}>{currentKind.subtitle}</Text>

            {currentKind.scale === "0to10" && (
              <View style={styles.scaleRow}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.scaleBtn, value === n && { backgroundColor: "#1f1a17" }]}
                    onPress={() => setValue(n)}
                  >
                    <Text style={{ color: value === n ? "#fff" : colors.text, fontWeight: "700" }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {currentKind.scale === "low_med_high" && (
              <View style={styles.choicesCol}>
                {[
                  { key: "muito_baixo", label: "Muito baixo" },
                  { key: "baixo", label: "Baixo" },
                  { key: "medio", label: "Médio" },
                  { key: "alto", label: "Alto" },
                  { key: "muito_alto", label: "Muito alto" },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.choice, { borderColor: colors.border }, value === c.key && { backgroundColor: "#1f1a17", borderColor: "#1f1a17" }]}
                    onPress={() => setValue(c.key)}
                  >
                    <Text style={{ color: value === c.key ? "#fff" : colors.text, fontWeight: "600" }}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={[styles.label, { color: colors.text }]}>Quer escrever algo? (opcional)</Text>
            <TextInput
              style={[styles.note, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Ex: senti incômodo só ao tocar a área…"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />

            <TouchableOpacity style={[styles.submit, loading && { opacity: 0.5 }]} onPress={submit} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>REGISTRAR ANÁLISE</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtRel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  kindGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  kindCard: { width: "47%", padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  kindEmoji: { fontSize: 32, marginBottom: 6 },
  kindTitle: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  kindSub: { fontSize: 10, lineHeight: 13, textAlign: "center" },
  sectionH: { fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginBottom: 10, marginTop: 10 },
  recentItem: { flexDirection: "row", padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, marginBottom: 6, alignItems: "center" },
  recentTitle: { fontSize: 13, fontWeight: "600" },
  recentVal: { fontSize: 12, marginTop: 2 },
  recentTime: { fontSize: 10 },
  alert: { fontSize: 16, marginLeft: 8 },
  back: { fontSize: 13, marginBottom: 12 },
  bigEmoji: { fontSize: 48, marginBottom: 4 },
  bigTitle: { fontSize: 26, fontWeight: "600", letterSpacing: -0.5, marginBottom: 6 },
  bigSub: { fontSize: 14, lineHeight: 18, marginBottom: 18 },
  scaleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 18 },
  scaleBtn: { width: 50, height: 44, borderRadius: 10, backgroundColor: "#f5f5f5", justifyContent: "center", alignItems: "center" },
  choicesCol: { gap: 8, marginBottom: 18 },
  choice: { padding: 14, borderRadius: 10, borderWidth: 1 },
  label: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  note: { borderRadius: 10, padding: 12, fontSize: 13, borderWidth: 1, minHeight: 80, textAlignVertical: "top", marginBottom: 14 },
  submit: { backgroundColor: "#1f1a17", paddingVertical: 14, borderRadius: 100, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "700", letterSpacing: 1.5 },
});
