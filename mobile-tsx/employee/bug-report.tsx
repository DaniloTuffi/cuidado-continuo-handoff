// apps/mobile/app/(employee)/bug-report.tsx
// Formulário pra reportar bug + ganhar prêmio (R$ 100-500 conforme severidade).

import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme";
import { getMyEmployee, reportBug } from "../../lib/cuidado-continuo-queries";

const FREQUENCIES = [
  { key: "once", label: "Aconteceu 1 vez" },
  { key: "rare", label: "Raramente" },
  { key: "sometimes", label: "Às vezes" },
  { key: "often", label: "Frequente" },
  { key: "always", label: "Sempre" },
];

export default function BugReportScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [frequency, setFrequency] = useState("sometimes");
  const [screen, setScreen] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!profile) return;
    if (!title.trim() || !description.trim()) {
      Alert.alert("Faltam campos", "Preencha pelo menos título e descrição.");
      return;
    }
    setSubmitting(true);
    try {
      const emp = await getMyEmployee(profile.id);
      const { error } = await reportBug({
        profileId: profile.id,
        unitId: emp?.unit_id ?? null,
        title: title.trim(),
        description: description.trim(),
        steps: steps.trim() || undefined,
        frequency,
        screen: screen.trim() || undefined,
      });
      if (error) throw error;
      Alert.alert(
        "🐛 Bug enviado!",
        "Nossa equipe técnica valida em até 48h. Se confirmado, prêmio cai junto da próxima comissão (R$ 100 a 500 conforme severidade).",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não consegui enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Reportar bug" }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.intro, { backgroundColor: "#fff4e0" }]}>
          <Text style={styles.introTag}>🏆 PROGRAMA DE CO-CRIAÇÃO</Text>
          <Text style={styles.introTitle}>Achou um bug? Bônus pra você.</Text>
          <Text style={styles.introText}>
            R$ 100 (baixo) · R$ 300 (médio) · R$ 500 (crítico) — pago junto da comissão depois de validado pela equipe técnica.
          </Text>
        </View>

        <Field label="Título do bug *" colors={colors}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Ex: Notificação D+15 chega duas vezes em fim de semana"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
        </Field>

        <Field label="Descrição do problema *" colors={colors}>
          <TextInput
            style={[styles.textarea, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="O que aconteceu? O que esperava que acontecesse?"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
          />
        </Field>

        <Field label="Passos pra reproduzir" colors={colors}>
          <TextInput
            style={[styles.textarea, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="1. Abri a tela X… 2. Cliquei em Y… 3. Aconteceu Z."
            placeholderTextColor={colors.textMuted}
            value={steps}
            onChangeText={setSteps}
            multiline
          />
        </Field>

        <Field label="Frequência" colors={colors}>
          <View style={styles.choicesRow}>
            {FREQUENCIES.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.choice,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  frequency === f.key && { backgroundColor: "#1f1a17", borderColor: "#1f1a17" },
                ]}
                onPress={() => setFrequency(f.key)}
              >
                <Text style={{ color: frequency === f.key ? "#fff" : colors.text, fontSize: 12, fontWeight: "600" }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label="Tela ou área (opcional)" colors={colors}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Ex: Briefing Diário, Pipeline, Score…"
            placeholderTextColor={colors.textMuted}
            value={screen}
            onChangeText={setScreen}
          />
        </Field>

        <TouchableOpacity
          style={[styles.submit, submitting && { opacity: 0.5 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>🐛 ENVIAR BUG</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          Bugs duplicados ou inválidos não são premiados. Avaliados em até 48h.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children, colors }: any) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: { padding: 14, borderRadius: 12, marginBottom: 20 },
  introTag: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700", color: "#8a6f3d", marginBottom: 4 },
  introTitle: { fontSize: 16, fontWeight: "600", color: "#1f1a17", marginBottom: 4 },
  introText: { fontSize: 12, color: "#5a4f47", lineHeight: 16 },

  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 },
  input: { borderRadius: 10, padding: 12, fontSize: 13, borderWidth: StyleSheet.hairlineWidth },
  textarea: { borderRadius: 10, padding: 12, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, minHeight: 100, textAlignVertical: "top" },
  choicesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  choice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1 },

  submit: { backgroundColor: "#1f1a17", paddingVertical: 14, borderRadius: 100, alignItems: "center", marginTop: 14 },
  submitText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 1.5 },
  disclaimer: { fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 16 },
});
