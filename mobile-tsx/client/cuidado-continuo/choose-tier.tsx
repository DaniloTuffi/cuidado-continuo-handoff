// apps/mobile/app/(client)/cuidado-continuo/choose-tier.tsx
// Cliente escolhe tier do Cuidado Contínuo (Cuidado R$ 200/mês ou 360° R$ 500/mês).
// Cria assinatura Asaas via edge function process-tier-subscription.

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

interface Tier {
  id: string;
  slug: string;
  name: string;
  description: string;
  monthly_price_centavos: number;
  annual_price_centavos: number | null;
  features_jsonb: string[];
}

function brl(c: number) {
  return (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

export default function ChooseTier() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase
        .from("cuidado_continuo_tiers")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      setTiers((t ?? []) as Tier[]);

      if (profile?.id) {
        const { data: cd } = await supabase.from("client_details").select("id").eq("profile_id", profile.id).maybeSingle();
        if (cd) {
          const { data: sub } = await supabase
            .from("client_cc_subscriptions")
            .select("tier_slug, status")
            .eq("client_id", cd.id)
            .eq("status", "active")
            .maybeSingle();
          if (sub) setActive(sub.tier_slug);
        }
      }
      setLoading(false);
    })();
  }, [profile?.id]);

  const subscribe = async (tier: Tier) => {
    if (tier.slug === "essencial") {
      Alert.alert("Já ativo", "O tier Essencial fica ativo automático com qualquer compra ≥ R$ 95.");
      return;
    }
    if (active === tier.slug) return;

    setSubscribing(tier.slug);
    try {
      const { data, error } = await supabase.functions.invoke("process-tier-subscription", {
        body: { tier_slug: tier.slug, billing_cycle: billing },
      });
      if (error) throw error;
      Alert.alert(
        "🌟 Bem-vinda ao " + tier.name,
        "Sua primeira consulta vai ser agendada nos próximos dias. A Paula te confirma pelo app.",
        [{ text: "OK", onPress: () => router.push("/(client)/cuidado-continuo/active") }]
      );
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não consegui processar agora.");
    } finally {
      setSubscribing(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background, justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Cuidado Contínuo" }} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        <Text style={[styles.title, { color: colors.text }]}>Escolha como quer ser cuidada</Text>
        <Text style={[styles.deck, { color: colors.textMuted }]}>
          Procedimento é o evento. A relação é o produto. Cuidado Contínuo é o que sustenta a relação entre as suas visitas.
        </Text>

        <View style={styles.billingToggle}>
          {(["monthly", "annual"] as const).map((b) => (
            <TouchableOpacity
              key={b}
              style={[styles.billOpt, billing === b && { backgroundColor: "#1f1a17" }]}
              onPress={() => setBilling(b)}
            >
              <Text style={{ color: billing === b ? "#fff" : colors.text, fontWeight: "700", fontSize: 12 }}>
                {b === "monthly" ? "Mensal" : "Anual · economiza 10%"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tiers.map((tier) => {
          const price = billing === "annual" && tier.annual_price_centavos
            ? tier.annual_price_centavos
            : tier.monthly_price_centavos;
          const priceLabel = tier.slug === "essencial"
            ? "Grátis"
            : `${brl(billing === "annual" ? (price / 12) : price)}/mês`;
          const isActive = active === tier.slug;

          return (
            <View
              key={tier.id}
              style={[
                styles.tierCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                tier.slug === "programa_360" && { borderColor: "#b89968", borderWidth: 2 },
                isActive && { borderColor: "#6b8e6f", borderWidth: 2 },
              ]}
            >
              {tier.slug === "programa_360" && <View style={styles.popular}><Text style={styles.popularText}>MAIS COMPLETO</Text></View>}
              {isActive && <View style={styles.active}><Text style={styles.activeText}>✓ ATIVO</Text></View>}

              <Text style={[styles.tierName, { color: colors.text }]}>{tier.name}</Text>
              <Text style={[styles.tierPrice, { color: "#8a6f3d" }]}>{priceLabel}</Text>
              <Text style={[styles.tierDesc, { color: colors.textMuted }]}>{tier.description}</Text>

              {tier.features_jsonb.map((f, i) => (
                <View key={i} style={styles.feature}>
                  <Text style={styles.check}>✓</Text>
                  <Text style={[styles.featureText, { color: colors.text }]}>{f}</Text>
                </View>
              ))}

              <TouchableOpacity
                style={[
                  styles.tierBtn,
                  isActive && { backgroundColor: "#6b8e6f" },
                  tier.slug === "essencial" && { backgroundColor: colors.textMuted },
                ]}
                onPress={() => subscribe(tier)}
                disabled={!!subscribing || isActive}
              >
                {subscribing === tier.slug ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.tierBtnText}>
                    {isActive ? "✓ ASSINATURA ATIVA" : tier.slug === "essencial" ? "ATIVA AUTOMÁTICO" : "QUERO ESSE PLANO"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <Text style={[styles.fineprint, { color: colors.textMuted }]}>
          Sem multa de cancelamento. Pode pausar 1 mês por ano sem custo. Suas consultas ficam no histórico.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: "600", letterSpacing: -0.5, marginBottom: 8 },
  deck: { fontSize: 14, fontStyle: "italic", lineHeight: 20, marginBottom: 20 },
  billingToggle: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.05)", padding: 4, borderRadius: 100, marginBottom: 20 },
  billOpt: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 100 },
  tierCard: { padding: 22, borderRadius: 18, borderWidth: 1, marginBottom: 14, position: "relative" },
  popular: { position: "absolute", top: -10, right: 16, backgroundColor: "#b89968", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  popularText: { color: "#1f1a17", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  active: { position: "absolute", top: -10, right: 16, backgroundColor: "#6b8e6f", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  activeText: { color: "#fff", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  tierName: { fontSize: 22, fontWeight: "600", marginBottom: 4 },
  tierPrice: { fontSize: 28, fontWeight: "600", letterSpacing: -1, marginBottom: 10 },
  tierDesc: { fontSize: 12, lineHeight: 16, marginBottom: 14 },
  feature: { flexDirection: "row", marginBottom: 6, gap: 6 },
  check: { color: "#6b8e6f", fontWeight: "700" },
  featureText: { fontSize: 13, flex: 1, lineHeight: 18 },
  tierBtn: { backgroundColor: "#1f1a17", paddingVertical: 13, borderRadius: 100, alignItems: "center", marginTop: 14 },
  tierBtnText: { color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 1.5 },
  fineprint: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 14 },
});
