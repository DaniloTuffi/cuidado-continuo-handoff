// apps/mobile/app/(client)/clube-madrinhas/painel.tsx
//
// WebView do Painel das Madrinhas Flask existente.
// Cliente autenticada + JWT pass-through → Flask exibe o painel completo
// com descontos exclusivos, estoques limitados, pré-lançamentos.
//
// Doc 37 detalha a integração JWT.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { WebView } from "react-native-webview";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";

const FLASK_PAINEL_BASE = "https://painel.estudiomaisestetica.com.br";

export default function PainelWebView() {
  const router = useRouter();
  const { profile } = useAuth();
  const [jwt, setJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);

  const generateAccessToken = useCallback(async () => {
    if (!profile?.id) return;
    try {
      // Edge function emite JWT assinado pro Flask
      const { data, error } = await supabase.functions.invoke("issue-painel-jwt", {
        body: { profile_id: profile.id, scope: "madrinha" },
      });
      if (error) throw error;
      setJwt(data?.jwt);

      // Carrega stocks pra mostrar acima da webview
      const today = new Date();
      const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

      const { data: cd } = await supabase
        .from("client_details")
        .select("preferred_unit_id")
        .eq("profile_id", profile.id)
        .maybeSingle();

      if (cd?.preferred_unit_id) {
        const { data: stocks } = await supabase
          .from("clube_stock_visibility")
          .select("monthly_capacity, monthly_used, visibility_label, services(name)")
          .eq("unit_id", cd.preferred_unit_id)
          .eq("year_month", ym)
          .eq("is_active", true)
          .order("display_order")
          .limit(3);
        setStockAlerts(stocks ?? []);
      }
    } catch (e: any) {
      Alert.alert("Erro de acesso", e.message);
      router.back();
    } finally {
      setLoading(false);
    }
  }, [profile?.id, router]);

  useEffect(() => { generateAccessToken(); }, [generateAccessToken]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: "#1f1a17" }]}>
        <Stack.Screen options={{ title: "Carregando…", headerStyle: { backgroundColor: "#1f1a17" }, headerTintColor: "#f4ece2" }} />
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#b89968" />
          <Text style={styles.loadingText}>Abrindo seu Painel das Madrinhas…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: "#1f1a17" }]}>
      <Stack.Screen
        options={{
          title: "Painel das Madrinhas",
          headerStyle: { backgroundColor: "#1f1a17" },
          headerTintColor: "#f4ece2",
        }}
      />

      {/* Stock alerts (FOMO controlado) */}
      {stockAlerts.length > 0 && (
        <View style={styles.stockBar}>
          <Text style={styles.stockEyebrow}>🔥 ESTOQUES DESTE MÊS NA SUA UNIDADE</Text>
          {stockAlerts.map((s, i) => {
            const remaining = s.monthly_capacity - s.monthly_used;
            return (
              <View key={i} style={styles.stockRow}>
                <Text style={styles.stockServiceName}>
                  {(s as any).services?.name ?? s.visibility_label}
                </Text>
                <Text style={[styles.stockCount, remaining <= 3 && { color: "#c25a4a" }]}>
                  Restam {remaining} de {s.monthly_capacity}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* WebView do Painel Flask */}
      <WebView
        source={{
          uri: `${FLASK_PAINEL_BASE}/madrinha/auto-login?jwt=${jwt}`,
          headers: {
            "Authorization": `Bearer ${jwt}`,
            "X-Source": "mobile-app",
          },
        }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#b89968" />
          </View>
        )}
        onMessage={(event) => {
          // Painel Flask manda postMessage quando ação importante acontece
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "purchase_completed") {
              router.replace("/(client)/casa-do-cuidado" as any);
            }
          } catch {}
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", padding: 30 },
  loadingText: { color: "rgba(244,236,226,0.7)", marginTop: 14, fontSize: 13, fontStyle: "italic" },
  stockBar: { backgroundColor: "rgba(212,191,149,0.08)", padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(212,191,149,0.2)" },
  stockEyebrow: { fontSize: 10, letterSpacing: 1.5, color: "#d4bf95", fontWeight: "700", marginBottom: 8 },
  stockRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  stockServiceName: { color: "#f4ece2", fontSize: 12, fontWeight: "600" },
  stockCount: { color: "#b89968", fontSize: 12, fontWeight: "700" },
  webview: { flex: 1 },
});
