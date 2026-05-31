// apps/mobile/app/(client)/clube-madrinhas/instituto.tsx
//
// História completa do Instituto Estúdio Mais.
// Depoimentos longos das alunas + métricas + próxima turma.

import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { supabase } from "../../../lib/supabase";

interface Depoimento {
  id: string;
  full_name: string;
  age: number | null;
  city: string | null;
  professional_area: string | null;
  graduation_year: number | null;
  current_status: string | null;
  short_quote: string;
  full_story: string;
  video_url: string | null;
  photo_url: string | null;
}

export default function InstitutoScreen() {
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [d, m] = await Promise.all([
        supabase.from("instituto_depoimentos")
          .select("*")
          .eq("is_published", true)
          .order("display_order"),
        supabase.from("instituto_metrics").select("*"),
      ]);
      setDepoimentos((d.data ?? []) as Depoimento[]);
      setMetrics(m.data ?? []);
    })();
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#1f1a17" }]}>
      <Stack.Screen
        options={{
          title: "Instituto",
          headerStyle: { backgroundColor: "#1f1a17" },
          headerTintColor: "#f4ece2",
        }}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>INSTITUTO ESTÚDIO MAIS</Text>
          <Text style={styles.heroTitle}>O cuidado que vira ofício.</Text>
          <Text style={styles.heroSubtitle}>
            Há 4 anos, formamos mulheres em situação de vulnerabilidade nas áreas onde o Estúdio Mais atua: estética, biomedicina, nutrição. Gratuitamente. Sem retorno financeiro pra rede.
          </Text>

          {/* Métricas só aparecem quando admin popular valores reais */}
          {metrics.filter((m) => Number(m.current_value) > 0).length > 0 && (
            <View style={styles.metricsGrid}>
              {metrics
                .filter((m) => Number(m.current_value) > 0)
                .map((m) => (
                  <View key={m.metric_key} style={styles.metricBox}>
                    <Text style={styles.metricNum}>
                      {m.display_format === "currency"
                        ? `R$ ${(m.current_value / 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
                        : Math.round(m.current_value).toLocaleString("pt-BR")}
                    </Text>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                  </View>
                ))}
            </View>
          )}
        </View>

        {/* Como funciona */}
        <View style={styles.section}>
          <Text style={styles.sectionH}>COMO FUNCIONA</Text>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>01</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.howTitle}>Madrinhas co-financiam vagas</Text>
              <Text style={styles.howText}>
                Parte da receita do Clube vai pro fundo do Instituto. Não é doação à parte — é embutido.
              </Text>
            </View>
          </View>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>02</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.howTitle}>Seleção de candidatas</Text>
              <Text style={styles.howText}>
                Duas vezes ao ano. Mulheres acima de 18 anos, comprovadamente em vulnerabilidade, com vocação clara pela área.
              </Text>
            </View>
          </View>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>03</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.howTitle}>Formação de 12 meses</Text>
              <Text style={styles.howText}>
                Curso técnico + treinamento prático nas unidades do Estúdio Mais. Carga horária integral, com bolsa-auxílio.
              </Text>
            </View>
          </View>
          <View style={styles.howRow}>
            <Text style={styles.howNum}>04</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.howTitle}>Empregabilidade</Text>
              <Text style={styles.howText}>
                As que se destacam podem entrar no quadro do Estúdio Mais. As demais saem com CRBM/Conselho ativo e diploma — empregabilidade plena no mercado.
              </Text>
            </View>
          </View>
        </View>

        {/* Depoimentos completos — só renderiza se admin publicou pelo menos 1 */}
        {depoimentos.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionH}>DEPOIMENTOS</Text>
          {depoimentos.map((d) => (
            <View key={d.id} style={styles.depoCard}>
              <View style={styles.depoHead}>
                <View style={styles.depoAvatar}>
                  {d.photo_url ? (
                    <Image source={{ uri: d.photo_url }} style={styles.depoAvatarImg} />
                  ) : (
                    <Text style={styles.depoAvatarText}>{d.full_name[0]?.toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.depoName}>{d.full_name}</Text>
                  <Text style={styles.depoMeta}>
                    {[d.age && `${d.age} anos`, d.city, d.professional_area].filter(Boolean).join(" · ")}
                  </Text>
                  {!!d.graduation_year && <Text style={styles.depoYear}>Formada em {d.graduation_year}</Text>}
                </View>
              </View>

              <Text style={styles.depoQuote}>"{d.short_quote}"</Text>
              <Text style={styles.depoStory}>{d.full_story}</Text>

              {!!d.current_status && (
                <View style={styles.depoStatus}>
                  <Text style={styles.depoStatusLabel}>HOJE</Text>
                  <Text style={styles.depoStatusText}>{d.current_status}</Text>
                </View>
              )}

              {!!d.video_url && (
                <TouchableOpacity
                  style={styles.depoBtn}
                  onPress={() => Linking.openURL(d.video_url!)}
                >
                  <Text style={styles.depoBtnText}>▶ ASSISTIR DEPOIMENTO</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
        )}

        {/* Footer próxima turma — só renderiza se admin populou os 2 metrics */}
        {(() => {
          const turmaSize = metrics.find((m) => m.metric_key === "current_turma_size")?.current_value ?? 0;
          const nextTs = metrics.find((m) => m.metric_key === "next_turma_starts_at_ts")?.current_value ?? 0;
          if (!turmaSize || !nextTs) return null;
          const nextDate = new Date(Number(nextTs) * 1000);
          const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
          const formatted = `${months[nextDate.getMonth()]} de ${nextDate.getFullYear()}`;
          return (
            <View style={styles.footer}>
              <Text style={styles.footerEyebrow}>PRÓXIMA TURMA</Text>
              <Text style={styles.footerTitle}>{Math.round(Number(turmaSize))} vagas · {formatted}</Text>
              <Text style={styles.footerText}>
                Cada Madrinha do Clube co-financia em média 0,3 vaga por ano. Quando você passa pelo procedimento, alguém entra na formação.
              </Text>
            </View>
          );
        })()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { padding: 28 },
  heroEyebrow: { fontSize: 10, letterSpacing: 3, color: "#d4bf95", fontWeight: "700", marginBottom: 14 },
  heroTitle: { fontSize: 36, fontWeight: "600", color: "#f4ece2", letterSpacing: -1, lineHeight: 38, marginBottom: 14 },
  heroSubtitle: { fontSize: 14, color: "rgba(244,236,226,0.85)", fontStyle: "italic", lineHeight: 22, marginBottom: 22 },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricBox: { flex: 1, minWidth: "45%", backgroundColor: "rgba(212,191,149,0.08)", padding: 14, borderRadius: 12 },
  metricNum: { fontSize: 22, color: "#b89968", fontWeight: "600", letterSpacing: -0.5 },
  metricLabel: { fontSize: 10, letterSpacing: 1, color: "rgba(244,236,226,0.6)", fontWeight: "700", textTransform: "uppercase", marginTop: 4 },

  section: { paddingHorizontal: 22, paddingVertical: 20 },
  sectionH: { fontSize: 11, letterSpacing: 2, color: "#c97d8e", fontWeight: "700", marginBottom: 16 },

  howRow: { flexDirection: "row", gap: 16, marginBottom: 18 },
  howNum: { fontSize: 28, color: "#b89968", fontWeight: "600", width: 44, letterSpacing: -1 },
  howTitle: { fontSize: 15, color: "#f4ece2", fontWeight: "600", marginBottom: 4 },
  howText: { fontSize: 12, color: "rgba(244,236,226,0.8)", lineHeight: 17 },

  depoCard: { backgroundColor: "rgba(244,236,226,0.06)", padding: 18, borderRadius: 14, marginBottom: 14 },
  depoHead: { flexDirection: "row", gap: 12, marginBottom: 14 },
  depoAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#5a4f47", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  depoAvatarImg: { width: 52, height: 52 },
  depoAvatarText: { color: "#d4bf95", fontWeight: "600", fontSize: 20 },
  depoName: { fontSize: 15, color: "#f4ece2", fontWeight: "600" },
  depoMeta: { fontSize: 11, color: "rgba(244,236,226,0.6)", marginTop: 2 },
  depoYear: { fontSize: 10, color: "#b89968", marginTop: 2, fontWeight: "600" },

  depoQuote: { fontSize: 18, color: "#f4ece2", fontStyle: "italic", fontWeight: "600", lineHeight: 24, marginBottom: 12, letterSpacing: -0.3 },
  depoStory: { fontSize: 13, color: "rgba(244,236,226,0.8)", lineHeight: 19, marginBottom: 14 },

  depoStatus: { borderLeftWidth: 2, borderLeftColor: "#b89968", paddingLeft: 12, marginBottom: 12 },
  depoStatusLabel: { fontSize: 9, letterSpacing: 2, color: "#b89968", fontWeight: "700", marginBottom: 2 },
  depoStatusText: { fontSize: 13, color: "#f4ece2" },

  depoBtn: { borderWidth: 1, borderColor: "rgba(212,191,149,0.4)", paddingVertical: 10, borderRadius: 100, alignItems: "center" },
  depoBtnText: { color: "#d4bf95", fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },

  footer: { backgroundColor: "rgba(184,153,104,0.15)", margin: 22, padding: 22, borderRadius: 16 },
  footerEyebrow: { fontSize: 10, letterSpacing: 2, color: "#d4bf95", fontWeight: "700", marginBottom: 6 },
  footerTitle: { fontSize: 22, color: "#f4ece2", fontWeight: "600", marginBottom: 10, letterSpacing: -0.3 },
  footerText: { fontSize: 13, color: "rgba(244,236,226,0.85)", lineHeight: 19 },
});
