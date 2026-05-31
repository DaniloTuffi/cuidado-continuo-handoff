// apps/mobile/app/(client)/clube-madrinhas/index.tsx
//
// Entrada do Clube das Madrinhas — cliente verifica CPF.
// Fluxo:
//   1. Cliente clica "Sou Madrinha" na Casa do Cuidado
//   2. Esta tela pergunta CPF
//   3. RPC verify_cpf_madrinha retorna status
//   4. Se member ativo → abre webview do Painel Flask
//   5. Se não member → mostra fila + storytelling Instituto + opção entrar na fila

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

interface ClubeStatus {
  found: boolean;
  is_member?: boolean;
  membership_status?: string;
  can_join_waitlist?: boolean;
  client_id?: string;
}

interface Metric {
  metric_key: string;
  current_value: number;
  display_format: string;
  label: string;
}

interface Depoimento {
  id: string;
  full_name: string;
  short_quote: string;
  current_status: string;
  photo_url: string | null;
  video_url: string | null;
}

function fmtCpf(s: string): string {
  const d = s.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

export default function ClubeIndex() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [cpfInput, setCpfInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<ClubeStatus | null>(null);

  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [stats, setStats] = useState<{ active: number; waitlist: number } | null>(null);

  const loadContext = useCallback(async () => {
    const [m, d, count] = await Promise.all([
      supabase.from("instituto_metrics").select("*"),
      supabase.from("instituto_depoimentos")
        .select("id, full_name, short_quote, current_status, photo_url, video_url")
        .eq("is_published", true)
        .order("display_order")
        .limit(3),
      supabase.rpc("clube_overview_counts"),
    ]);
    setMetrics((m.data ?? []) as Metric[]);
    setDepoimentos((d.data ?? []) as Depoimento[]);
    setStats(count.data ?? { active: 360, waitlist: 47 });
  }, []);

  useEffect(() => { loadContext(); }, [loadContext]);

  const checkCpf = async () => {
    if (cpfInput.replace(/\D/g, "").length !== 11) {
      Alert.alert("CPF inválido", "Digite os 11 dígitos completos.");
      return;
    }
    setChecking(true);
    try {
      const { data, error } = await supabase.rpc("verify_cpf_madrinha", { p_cpf: cpfInput });
      if (error) throw error;
      setVerified(data as ClubeStatus);

      if (data?.is_member) {
        // membro ativo — vai pra webview
        setTimeout(() => router.push("/(client)/clube-madrinhas/painel"), 800);
      }
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setChecking(false);
    }
  };

  const joinWaitlist = async () => {
    if (!verified?.client_id) return;
    try {
      const { error } = await supabase.from("clube_madrinhas_waitlist").insert({
        client_id: verified.client_id,
        source: "app_self",
      });
      if (error) throw error;
      Alert.alert(
        "💛 Você entrou na lista",
        `Vamos te chamar quando abrirem vagas. Hoje há ${stats?.waitlist ?? "—"} mulheres esperando.`,
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#1f1a17" }]}>
      <Stack.Screen options={{ title: "Clube das Madrinhas", headerStyle: { backgroundColor: "#1f1a17" }, headerTintColor: "#f4ece2" }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>EXCLUSIVO · 360 MULHERES NO MUNDO</Text>
          <Text style={styles.heroTitle}>Clube das Madrinhas</Text>
          <Text style={styles.heroDeck}>
            "Uma camada do Estúdio Mais que pouca gente vê. Madrinhas têm acesso a estoques limitados, pré-lançamentos, e acompanhamento próximo. E parte do que pagam financia mulheres do Instituto."
          </Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{stats?.active ?? 360}</Text>
              <Text style={styles.heroStatLabel}>Madrinhas ativas</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatNum}>{stats?.waitlist ?? 47}</Text>
              <Text style={styles.heroStatLabel}>Na fila de espera</Text>
            </View>
          </View>
        </View>

        {/* CPF Verification */}
        {!verified && (
          <View style={styles.cpfBox}>
            <Text style={styles.cpfLabel}>JÁ É MADRINHA?</Text>
            <Text style={styles.cpfText}>
              Digite seu CPF — se você já tem acesso ou foi liberada por uma profissional, eu reconheço.
            </Text>
            <TextInput
              style={styles.cpfInput}
              placeholder="000.000.000-00"
              placeholderTextColor="rgba(244,236,226,0.4)"
              keyboardType="number-pad"
              value={cpfInput}
              onChangeText={(t) => setCpfInput(fmtCpf(t))}
              maxLength={14}
            />
            <TouchableOpacity
              style={[styles.cpfBtn, (checking || cpfInput.length < 14) && { opacity: 0.5 }]}
              onPress={checkCpf}
              disabled={checking || cpfInput.length < 14}
            >
              {checking ? <ActivityIndicator color="#1f1a17" /> : <Text style={styles.cpfBtnText}>VERIFICAR ACESSO</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* Resultado da verificação */}
        {verified && verified.found && verified.is_member && (
          <View style={[styles.resultBox, { backgroundColor: "#6b8e6f" }]}>
            <Text style={styles.resultIcon}>✓</Text>
            <Text style={styles.resultTitle}>Bem-vinda de volta</Text>
            <Text style={styles.resultText}>Abrindo seu Painel das Madrinhas…</Text>
          </View>
        )}

        {verified && verified.found && !verified.is_member && (
          <View style={styles.resultBox}>
            <Text style={styles.resultIcon}>⏳</Text>
            <Text style={styles.resultTitle}>Você está na nossa base</Text>
            <Text style={styles.resultText}>
              Mas ainda não foi liberada pro Clube. Posso colocar você na fila — quando abrir vaga, te chamo.
            </Text>
            {verified.can_join_waitlist && (
              <TouchableOpacity style={styles.resultBtn} onPress={joinWaitlist}>
                <Text style={styles.resultBtnText}>ENTRAR NA FILA</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {verified && !verified.found && (
          <View style={styles.resultBox}>
            <Text style={styles.resultIcon}>👋</Text>
            <Text style={styles.resultTitle}>Ainda não nos conhecemos pessoalmente</Text>
            <Text style={styles.resultText}>
              O Clube das Madrinhas é exclusivo pra clientes do Estúdio Mais. Marque sua primeira visita — e durante o atendimento, a profissional pode te liberar uma exceção.
            </Text>
            <TouchableOpacity
              style={[styles.resultBtn, { backgroundColor: "#b89968" }]}
              onPress={() => router.push("/(client)/booking" as any)}
            >
              <Text style={[styles.resultBtnText, { color: "#1f1a17" }]}>AGENDAR PRIMEIRA VISITA</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Instituto storytelling */}
        <View style={styles.institutoBox}>
          <Text style={styles.institutoEyebrow}>O QUE NINGUÉM TE CONTOU AINDA</Text>
          <Text style={styles.institutoTitle}>Parte do que você paga forma uma mulher.</Text>
          <Text style={styles.institutoText}>
            O Instituto Estúdio Mais forma esteticistas, biomédicas e nutricionistas em vulnerabilidade — gratuitamente. Cada Madrinha co-financia uma vaga.
          </Text>

          {/* Métricas só aparecem quando admin popular valores reais (current_value > 0) */}
          {metrics.filter((m) => Number(m.current_value) > 0).length > 0 && (
            <View style={styles.institutoMetrics}>
              {metrics
                .filter((m) => Number(m.current_value) > 0)
                .map((m) => (
                  <View key={m.metric_key} style={styles.institutoMetric}>
                    <Text style={styles.institutoMetricNum}>
                      {m.display_format === "currency"
                        ? `R$ ${(m.current_value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                        : Math.round(m.current_value).toLocaleString("pt-BR")}
                    </Text>
                    <Text style={styles.institutoMetricLabel}>{m.label}</Text>
                  </View>
                ))}
            </View>
          )}

          {depoimentos.length > 0 && (
            <>
              <Text style={styles.depoimentosTitle}>DEPOIMENTOS</Text>
              {depoimentos.map((d) => (
                <View key={d.id} style={styles.depoimento}>
                  <View style={styles.depoimentoAvatar}>
                    {d.photo_url ? (
                      <Image source={{ uri: d.photo_url }} style={styles.depoimentoPhoto} />
                    ) : (
                      <Text style={styles.depoimentoAvatarText}>{d.full_name[0]?.toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.depoimentoName}>{d.full_name}</Text>
                    <Text style={styles.depoimentoQuote}>"{d.short_quote}"</Text>
                    {!!d.current_status && (
                      <Text style={styles.depoimentoStatus}>{d.current_status}</Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}

          <TouchableOpacity
            style={styles.institutoBtn}
            onPress={() => router.push("/(client)/clube-madrinhas/instituto" as any)}
          >
            <Text style={styles.institutoBtnText}>CONHECER O INSTITUTO →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { padding: 28, paddingBottom: 40 },
  heroEyebrow: { fontSize: 10, letterSpacing: 3, color: "#d4bf95", fontWeight: "700", marginBottom: 14 },
  heroTitle: { fontSize: 36, fontWeight: "600", color: "#f4ece2", letterSpacing: -1, marginBottom: 14, lineHeight: 38 },
  heroDeck: { fontSize: 14, color: "rgba(244,236,226,0.85)", fontStyle: "italic", lineHeight: 22, marginBottom: 22 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  heroStat: { flex: 1 },
  heroStatNum: { fontSize: 32, fontWeight: "600", color: "#b89968", letterSpacing: -1 },
  heroStatLabel: { fontSize: 10, letterSpacing: 1.5, color: "rgba(244,236,226,0.6)", fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  heroDivider: { width: 1, height: 36, backgroundColor: "rgba(244,236,226,0.15)", marginHorizontal: 16 },

  cpfBox: { backgroundColor: "rgba(212,191,149,0.08)", margin: 20, padding: 22, borderRadius: 18, borderWidth: 1, borderColor: "rgba(212,191,149,0.2)" },
  cpfLabel: { fontSize: 10, letterSpacing: 2, color: "#d4bf95", fontWeight: "700", marginBottom: 8 },
  cpfText: { fontSize: 13, color: "rgba(244,236,226,0.85)", lineHeight: 18, marginBottom: 14 },
  cpfInput: { backgroundColor: "rgba(244,236,226,0.08)", padding: 14, borderRadius: 10, color: "#f4ece2", fontSize: 18, letterSpacing: 1, textAlign: "center", marginBottom: 14 },
  cpfBtn: { backgroundColor: "#b89968", paddingVertical: 14, borderRadius: 100, alignItems: "center" },
  cpfBtnText: { color: "#1f1a17", fontWeight: "700", letterSpacing: 1.5 },

  resultBox: { backgroundColor: "rgba(184,153,104,0.15)", margin: 20, padding: 22, borderRadius: 18, alignItems: "center" },
  resultIcon: { fontSize: 36, marginBottom: 8 },
  resultTitle: { fontSize: 18, color: "#f4ece2", fontWeight: "600", marginBottom: 6, textAlign: "center" },
  resultText: { fontSize: 13, color: "rgba(244,236,226,0.85)", lineHeight: 18, textAlign: "center", marginBottom: 14 },
  resultBtn: { backgroundColor: "#d4bf95", paddingVertical: 12, paddingHorizontal: 22, borderRadius: 100 },
  resultBtnText: { color: "#1f1a17", fontWeight: "700", letterSpacing: 1.5 },

  institutoBox: { backgroundColor: "rgba(138,58,79,0.15)", margin: 20, padding: 22, borderRadius: 18 },
  institutoEyebrow: { fontSize: 10, letterSpacing: 2, color: "#c97d8e", fontWeight: "700", marginBottom: 8 },
  institutoTitle: { fontSize: 22, color: "#f4ece2", fontWeight: "600", marginBottom: 8, letterSpacing: -0.5, lineHeight: 26 },
  institutoText: { fontSize: 13, color: "rgba(244,236,226,0.85)", lineHeight: 19, marginBottom: 18 },
  institutoMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 18 },
  institutoMetric: { flex: 1, minWidth: "45%" },
  institutoMetricNum: { fontSize: 22, color: "#b89968", fontWeight: "600", letterSpacing: -0.5 },
  institutoMetricLabel: { fontSize: 10, letterSpacing: 1, color: "rgba(244,236,226,0.6)", fontWeight: "700", textTransform: "uppercase", marginTop: 2 },

  depoimentosTitle: { fontSize: 10, letterSpacing: 2, color: "#d4bf95", fontWeight: "700", marginTop: 6, marginBottom: 10 },
  depoimento: { flexDirection: "row", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(244,236,226,0.1)" },
  depoimentoAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#5a4f47", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  depoimentoPhoto: { width: 44, height: 44 },
  depoimentoAvatarText: { color: "#d4bf95", fontWeight: "700", fontSize: 16 },
  depoimentoName: { fontSize: 13, color: "#f4ece2", fontWeight: "600" },
  depoimentoQuote: { fontSize: 12, color: "rgba(244,236,226,0.8)", fontStyle: "italic", marginTop: 2, lineHeight: 16 },
  depoimentoStatus: { fontSize: 10, color: "#b89968", marginTop: 4, fontWeight: "600" },

  institutoBtn: { backgroundColor: "rgba(212,191,149,0.15)", borderWidth: 1, borderColor: "#d4bf95", paddingVertical: 12, borderRadius: 100, alignItems: "center", marginTop: 16 },
  institutoBtnText: { color: "#d4bf95", fontWeight: "700", letterSpacing: 1.5, fontSize: 12 },
});
