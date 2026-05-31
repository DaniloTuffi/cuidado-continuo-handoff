// apps/mobile/app/(employee)/pipeline.tsx
// Pipeline kanban — 6 colunas swipáveis. Usa RPC pipeline_clients_for_professional (schema real).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  FlatList, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme";
import { ScoreChip } from "../../components/score-chip";
import { getPipeline } from "../../lib/cuidado-continuo-queries";

type Col = "primeira_visita" | "janela_magica" | "em_pacote" | "meio_pacote" | "penultima_sessao" | "constelacao";

const COLUMNS: { key: Col; emoji: string; title: string; subtitle: string }[] = [
  { key: "primeira_visita", emoji: "🌱", title: "1ª Visita", subtitle: "D+1 a D+7" },
  { key: "janela_magica", emoji: "⚡", title: "Janela Mágica", subtitle: "D+8 a D+30 · 12,6× Premium" },
  { key: "em_pacote", emoji: "📦", title: "Em Pacote", subtitle: "Sessões 1-5" },
  { key: "meio_pacote", emoji: "🔄", title: "Meio do Pacote", subtitle: "Sessão 6 · Ponte 2" },
  { key: "penultima_sessao", emoji: "🔐", title: "Penúltima", subtitle: "Ponte 3 · decisão" },
  { key: "constelacao", emoji: "✨", title: "Constelação", subtitle: "Premium consolidada" },
];

export default function PipelineScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [activeCol, setActiveCol] = useState<Col>("janela_magica");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<any[]>([]);

  const fetch = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await getPipeline(profile.id);
      setClients(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => { fetch(); }, [fetch]);

  const grouped = useMemo(() => {
    const map: Record<Col, any[]> = {
      primeira_visita: [], janela_magica: [], em_pacote: [],
      meio_pacote: [], penultima_sessao: [], constelacao: [],
    };
    for (const c of clients) {
      if (c.pipeline_column in map) map[c.pipeline_column as Col].push(c);
    }
    return map;
  }, [clients]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const filtered = grouped[activeCol] ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: "Pipeline", headerRight: () => <ScoreChip /> }}
      />

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {COLUMNS.map((col) => {
            const count = grouped[col.key]?.length ?? 0;
            const active = col.key === activeCol;
            return (
              <TouchableOpacity
                key={col.key}
                style={[styles.tab, active && { backgroundColor: "#8a3a4f" }]}
                onPress={() => setActiveCol(col.key)}
              >
                <Text style={[styles.tabEmoji, active && { color: "#fff" }]}>{col.emoji}</Text>
                <Text style={[styles.tabLabel, { color: active ? "#fff" : colors.text }]}>{col.title}</Text>
                <View style={[styles.tabBadge, active && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                  <Text style={[styles.tabBadgeText, active && { color: "#fff" }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.subtitleRow}>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {COLUMNS.find((c) => c.key === activeCol)?.subtitle}
        </Text>
        <Text style={[styles.count, { color: colors.text }]}>
          {filtered.length} {filtered.length === 1 ? "cliente" : "clientes"}
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.client_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); }} />}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            Nenhuma cliente nessa etapa agora.
          </Text>
        }
        renderItem={({ item }) => (
          <ClientCard item={item} colors={colors} onPress={(id) => router.push(`/(employee)/client-360?id=${id}`)} />
        )}
      />
    </SafeAreaView>
  );
}

function ClientCard({ item, colors, onPress }: any) {
  const accent = item.priority === "high" ? "#c25a4a" : item.priority === "med" ? "#b89968" : "#6b8e6f";
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: accent }]}
      onPress={() => onPress(item.client_id)}
    >
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.client_name?.[0]?.toUpperCase() ?? "?"}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.cardName, { color: colors.text }]}>{item.client_name}</Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            {item.procedure_name ?? "—"} {item.days_since != null && `· D+${item.days_since}`}
          </Text>
        </View>
        {item.context_tag && (
          <View
            style={[styles.tag, {
              backgroundColor: item.priority === "high" ? "#fef0ed" : item.priority === "med" ? "#fff4e0" : "#ecf2ed",
            }]}
          >
            <Text style={[styles.tagText, { color: accent }]}>{item.context_tag}</Text>
          </View>
        )}
      </View>

      {!!item.memory_snippet && (
        <Text style={[styles.cardMemo, { backgroundColor: colors.surfaceMuted, color: colors.textMuted }]}>
          🧠 {item.memory_snippet}
        </Text>
      )}
      {!!item.next_action_text && (
        <Text style={[styles.cardAction, { color: colors.text }]}>→ {item.next_action_text}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  tab: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, marginHorizontal: 3, gap: 6 },
  tabEmoji: { fontSize: 14 },
  tabLabel: { fontSize: 12, fontWeight: "600" },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 100, backgroundColor: "#e8e1d6" },
  tabBadgeText: { fontSize: 10, fontWeight: "700" },
  subtitleRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  subtitle: { fontSize: 12, fontStyle: "italic" },
  count: { fontSize: 12, fontWeight: "700" },
  card: { borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3 },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#b89968", justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cardName: { fontSize: 13, fontWeight: "600" },
  cardMeta: { fontSize: 10, marginTop: 2 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  cardMemo: { fontSize: 11, padding: 8, borderRadius: 8, marginBottom: 6, lineHeight: 16 },
  cardAction: { fontSize: 11, fontWeight: "600", lineHeight: 16 },
  empty: { textAlign: "center", padding: 30, fontSize: 13 },
});
