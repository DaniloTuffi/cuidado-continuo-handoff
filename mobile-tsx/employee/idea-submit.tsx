// apps/mobile/app/(employee)/idea-submit.tsx
// Formulário pra enviar ideia + ganhar prêmio (R$ 500-2.000 se implementada).

import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme";
import { getMyEmployee, submitIdea } from "../../lib/cuidado-continuo-queries";

export default function IdeaSubmitScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [howItWorks, setHowItWorks] = useState("");
  const [whoBenefits, setWhoBenefits] = useState("");
  const [willingToTest, setWillingToTest] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!profile) return;
    if (!title.trim() || !problem.trim()) {
      Alert.alert("Faltam campos", "Pelo menos título e problema que resolve.");
      return;
    }
    setSubmitting(true);
    try {
      const emp = await getMyEmployee(profile.id);
      const { error } = await submitIdea({
        profileId: profile.id,
        unitId: emp?.unit_id ?? null,
        title: title.trim(),
        problem: problem.trim(),
        howItWorks: howItWorks.trim() || undefined,
        whoBenefits: whoBenefits.trim() || undefined,
        willingToTest,
      });
      if (error) throw error;
      Alert.alert(
        "💡 Ideia recebida!",
        "Avaliamos em até 2 semanas. Se implementada: R$ 500 + nome da feature no app. Se mover KPI da rede: R$ 2.000 + apresentação no Encontro Constelação.",
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
      <Stack.Screen options={{ title: "Nova ideia" }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[styles.intro, { backgroundColor: "#f3eaf0" }]}>
          <Text style={styles.introTag}>🏆 PROGRAMA DE CO-CRIAÇÃO</Text>
          <Text style={styles.introTitle}>Sua ideia pode virar feature do app.</Text>
          <Text style={styles.introText}>
            R$ 500 + nome da feature se implementada · R$ 2.000 se mover KPI da rede · Apresentação no Encontro Constelação se for grande.
          </Text>
        </View>

        <Field label="Título da ideia *" colors={colors}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Ex: 'Lembrar da viagem dela' — alerta 14 dias antes"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
          />
        </Field>

        <Field label="Que problema resolve? *" colors={colors}>
          <TextInput
            style={[styles.textarea, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Hoje a profissional esquece de avisar a cliente sobre planos de viagem. Resultado: cliente vai sem retoque…"
            placeholderTextColor={colors.textMuted}
            value={problem}
            onChangeText={setProblem}
            multiline
          />
        </Field>

        <Field label="Como funcionaria?" colors={colors}>
          <TextInput
            style={[styles.textarea, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Campo de data no perfil da cliente. Quando faltam 14 dias, sistema gera ação no briefing."
            placeholderTextColor={colors.textMuted}
            value={howItWorks}
            onChangeText={setHowItWorks}
            multiline
          />
        </Field>

        <Field label="Quem se beneficia?" colors={colors}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            placeholder="Profissional, cliente, gerente, ambos?"
            placeholderTextColor={colors.textMuted}
            value={whoBenefits}
            onChangeText={setWhoBenefits}
          />
        </Field>

        <View style={[styles.testRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.testLabel, { color: colors.text }]}>Topa testar quando estiver pronta?</Text>
            <Text style={[styles.testSub, { color: colors.textMuted }]}>
              Quem testa early ganha +R$ 200 extra se a ideia virar feature.
            </Text>
          </View>
          <Switch value={willingToTest} onValueChange={setWillingToTest} trackColor={{ true: "#b89968" }} />
        </View>

        <TouchableOpacity
          style={[styles.submit, submitting && { opacity: 0.5 }]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>💡 ENVIAR IDEIA</Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
          Ideias duplicadas ou já em roadmap não são premiadas. Resposta em até 2 semanas.
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
  introTag: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700", color: "#8a3a4f", marginBottom: 4 },
  introTitle: { fontSize: 16, fontWeight: "600", color: "#1f1a17", marginBottom: 4 },
  introText: { fontSize: 12, color: "#5a4f47", lineHeight: 16 },

  label: { fontSize: 12, fontWeight: "600", marginBottom: 6, letterSpacing: 0.3 },
  input: { borderRadius: 10, padding: 12, fontSize: 13, borderWidth: StyleSheet.hairlineWidth },
  textarea: { borderRadius: 10, padding: 12, fontSize: 13, borderWidth: StyleSheet.hairlineWidth, minHeight: 80, textAlignVertical: "top" },

  testRow: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 10 },
  testLabel: { fontSize: 13, fontWeight: "600", marginBottom: 2 },
  testSub: { fontSize: 11, lineHeight: 14 },

  submit: { backgroundColor: "#8a3a4f", paddingVertical: 14, borderRadius: 100, alignItems: "center", marginTop: 14 },
  submitText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 1.5 },
  disclaimer: { fontSize: 11, textAlign: "center", marginTop: 14, lineHeight: 16 },
});
