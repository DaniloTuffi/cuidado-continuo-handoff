// apps/mobile/app/(employee)/liberar-madrinha.tsx
//
// Profissional libera exceção à fila do Clube das Madrinhas durante atendimento.
// Aparece após Briefing → Cliente em atendimento → botão "Liberar Madrinha".
// Cria membership status=invited automaticamente.

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { getMyEmployee } from "../../lib/cuidado-continuo-queries";

export default function LiberarMadrinhaScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [client, setClient] = useState<any>(null);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<string>("not_member");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [recentReleases, setRecentReleases] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!profile?.id || !clientId) return;
    try {
      const emp = await getMyEmployee(profile.id);
      setEmployeeId(emp?.id ?? null);

      const { data: cd } = await supabase
        .from("client_details")
        .select(`
          id, total_spent, total_visits,
          loyalty_tiers!loyalty_tier_id(name),
          profiles!profile_id(full_name, avatar_url)
        `)
        .eq("id", clientId)
        .maybeSingle();
      setClient(cd);

      const { data: status } = await supabase.rpc("client_clube_status", {
        p_client_id: clientId,
      });
      setCurrentStatus(status?.membership_status ?? "not_member");

      if (emp) {
        const { data: recent } = await supabase
          .from("clube_madrinhas_membership")
          .select(`
            id, invited_at, status,
            client_details!client_id(profiles!profile_id(full_name))
          `)
          .eq("invited_by_employee_id", emp.id)
          .gte("invited_at", new Date(Date.now() - 30 * 86400000).toISOString())
          .order("invited_at", { ascending: false })
          .limit(5);
        setRecentReleases(recent ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id, clientId]);

  useEffect(() => { load(); }, [load]);

  const releaseAccess = async () => {
    if (!employeeId || !clientId) return;
    setSubmitting(true);
    try {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 12);

      const { error } = await supabase.from("clube_madrinhas_membership").upsert({
        client_id: clientId,
        status: "invited",
        entry_type: "manual_professional",
        invited_at: new Date().toISOString(),
        invited_by_employee_id: employeeId,
        expires_at: expiry.toISOString(),
        metadata: { notes },
      }, { onConflict: "client_id" });

      if (error) throw error;

      Alert.alert(
        "✓ Madrinha liberada",
        `${client?.profiles?.full_name?.split(" ")[0]} já pode acessar o Painel. Conta a história das Madrinhas e do Instituto pra ela.`,
        [{ text: "Voltar pro atendimento", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const isAlreadyMember = currentStatus === "active" || currentStatus === "invited";

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Liberar Madrinha" }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Card da cliente */}
        <View style={[styles.clientCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>
              {client?.profiles?.full_name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clientName, { color: colors.text }]}>
              {client?.profiles?.full_name}
            </Text>
            <Text style={[styles.clientMeta, { color: colors.textMuted }]}>
              {client?.loyalty_tiers?.name ?? "Início"} · {client?.total_visits ?? 0} visitas · R$ {(client?.total_spent ?? 0).toLocaleString("pt-BR")}
            </Text>
          </View>
        </View>

        {isAlreadyMember ? (
          <View style={[styles.alreadyBox, { backgroundColor: "#ecf2ed" }]}>
            <Text style={[styles.alreadyText, { color: "#4a6e4f" }]}>
              ✓ Ela já é Madrinha (status: {currentStatus}). Não precisa liberar de novo.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.intro, { color: colors.textMuted }]}>
              Você está prestes a liberar uma <strong>exceção da fila</strong> pro Clube das Madrinhas. Essa é uma decisão sua. Use bem.
            </Text>

            <View style={[styles.scriptBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.scriptH, { color: "#8a3a4f" }]}>📜 ANTES DE LIBERAR · LEMBRA</Text>
              <Text style={[styles.scriptItem, { color: colors.text }]}>
                · Conta a história das Madrinhas. Por que existe. O que muda pra cliente.
              </Text>
              <Text style={[styles.scriptItem, { color: colors.text }]}>
                · Menciona o Instituto Estúdio Mais. Cita 1 aluna pelo nome (você sabe — Renata, Camila, etc).
              </Text>
              <Text style={[styles.scriptItem, { color: colors.text }]}>
                · Não fecha venda neste momento. Libera o acesso, deixa ela ver. Decisão dela.
              </Text>
              <Text style={[styles.scriptItem, { color: colors.text }]}>
                · Se ela fechar pacote ≥ R$ 10k, acompanhamento médico/nutri ativa automático.
              </Text>
            </View>

            <Text style={[styles.label, { color: colors.text }]}>Por que essa cliente, hoje? (opcional)</Text>
            <TextInput
              style={[styles.notes, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
              placeholder="Ex: Cliente desde 2022, pediu informações sobre acompanhamento médico hoje."
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <TouchableOpacity
              style={[styles.releaseBtn, submitting && { opacity: 0.5 }]}
              onPress={releaseAccess}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#1f1a17" /> : (
                <Text style={styles.releaseBtnText}>LIBERAR ACESSO À MADRINHA</Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.fineprint, { color: colors.textMuted }]}>
              A cliente entra com status "invited" por 12 meses. Se ela fechar pacote ≥ R$ 10k vira "active" automático.
            </Text>
          </>
        )}

        {/* Histórico recente */}
        {recentReleases.length > 0 && (
          <View style={{ marginTop: 30 }}>
            <Text style={[styles.histH, { color: "#8a3a4f" }]}>SUAS LIBERAÇÕES NOS ÚLTIMOS 30 DIAS</Text>
            {recentReleases.map((r) => (
              <View key={r.id} style={[styles.histRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.histName, { color: colors.text }]}>
                    {r.client_details?.profiles?.full_name}
                  </Text>
                  <Text style={[styles.histMeta, { color: colors.textMuted }]}>
                    {new Date(r.invited_at).toLocaleDateString("pt-BR")} · status: {r.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  clientCard: { flexDirection: "row", padding: 14, borderRadius: 16, borderWidth: 1, alignItems: "center", gap: 12, marginBottom: 16 },
  clientAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#b89968", justifyContent: "center", alignItems: "center" },
  clientAvatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  clientName: { fontSize: 16, fontWeight: "600" },
  clientMeta: { fontSize: 11, marginTop: 2 },

  alreadyBox: { padding: 16, borderRadius: 12, marginBottom: 16 },
  alreadyText: { fontSize: 13, fontWeight: "600", textAlign: "center" },

  intro: { fontSize: 13, lineHeight: 18, marginBottom: 16, fontStyle: "italic" },

  scriptBox: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 18 },
  scriptH: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  scriptItem: { fontSize: 12, lineHeight: 17, marginBottom: 6 },

  label: { fontSize: 12, fontWeight: "600", marginBottom: 6 },
  notes: { borderRadius: 10, padding: 12, fontSize: 13, borderWidth: 1, minHeight: 80, textAlignVertical: "top", marginBottom: 14 },

  releaseBtn: { backgroundColor: "#b89968", paddingVertical: 14, borderRadius: 100, alignItems: "center", marginTop: 6 },
  releaseBtnText: { color: "#1f1a17", fontWeight: "700", letterSpacing: 1.5 },
  fineprint: { fontSize: 11, textAlign: "center", marginTop: 12, lineHeight: 15 },

  histH: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 10 },
  histRow: { padding: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  histName: { fontSize: 13, fontWeight: "600" },
  histMeta: { fontSize: 10, marginTop: 2 },
});
