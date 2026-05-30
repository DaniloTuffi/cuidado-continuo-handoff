// apps/mobile/app/(employee)/pipeline.tsx
//
// Pipeline kanban — todas as clientes ativas da profissional em 6 colunas
// por etapa da jornada: 1ª Visita · Janela Mágica · Em Pacote · Meio · Penúltima · Constelação
//
// Em mobile o kanban vira tabs horizontais swipáveis pra melhor UX.
// Em tablet pode renderizar como grid de colunas (responsive).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";
import { ScoreChip } from "../../components/score-chip";

type PipelineColumn =
  | "primeira_visita"
  | "janela_magica"
  | "em_pacote"
  | "meio_pacote"
  | "penultima_sessao"
  | "constelacao";

interface PipelineClient {
  client_id: string;
  client_name: string;
  client_tier: string | null;
  procedure_key: string | null;
  procedure_name: string | null;
  days_since: number | null;
  package_session_current: number | null;
  package_total_sessions: number | null;
  memory_snippet: string | null;
  next_action_text: string | null;
  context_tag: string | null;
  priority: "high" | "med" | "low";
  column: PipelineColumn;
}

const COLUMNS: Array<{ key: PipelineColumn; emoji: string; title: string; subtitle: string }> = [
  { key: "primeira_visita", emoji: "🌱", title: "1ª Visita", subtitle: "D+1 a D+7 · Anamnese · boas-vindas" },
  { key: "janela_magica", emoji: "⚡", title: "Janela Mágica", subtitle: "D+8 a D+30 · 12,6× chance Premium" },
  { key: "em_pacote", emoji: "📦", title: "Em Pacote", subtitle: "Sessões 1-5 · Ponte 1 (Mapa)" },
  { key: "meio_pacote", emoji: "🔄", title: "Meio do Pacote", subtitle: "Sessão 6 · Ponte 2" },
  { key: "penultima_sessao", emoji: "🔐", title: "Penúltima Sessão", subtitle: "Ponte 3 · decisão" },
  { key: "constelacao", emoji: "✨", title: "Constelação", subtitle: "Premium consolidada" },
];

export default function PipelineScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [activeColumn, setActiveColumn] = useState<PipelineColumn>("janela_magica");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clients, setClients] = useState<PipelineClient[]>([]);

  const fetchPipeline = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data, error } = await supabase.rpc("pipeline_clients_for_professional", {
        p_profile_id: profile.id,
      });
      if (error) console.warn("pipeline_clients error:", error.message);
      setClients((data ?? []) as PipelineClient[]);
    } catch (e) {
      console.error("Erro ao carregar pipeline:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const grouped = useMemo(() => {
    const map: Record<PipelineColumn, PipelineClient[]> = {
      primeira_visita: [],
      janela_magica: [],
      em_pacote: [],
      meio_pacote: [],
      penultima_sessao: [],
      constelacao: [],
    };
    for (const c of clients) {
      map[c.column]?.push(c);
    }
    return map;
  }, [clients]);

  const filteredClients = grouped[activeColumn] ?? [];

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Pipeline",
          headerRight: () => <ScoreChip />,
        }}
      />

      {/* Tabs horizontais das colunas */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {COLUMNS.map((col) => {
            const count = grouped[col.key]?.length ?? 0;
            const active = col.key === activeColumn;
            return (
              <TouchableOpacity
                key={col.key}
                style={[
                  styles.tab,
                  active && { backgroundColor: "#8a3a4f" },
                ]}
                onPress={() => setActiveColumn(col.key)}
              >
                <Text style={[styles.tabEmoji, active && { color: "#fff" }]}>{col.emoji}</Text>
                <Text style={[styles.tabLabel, { color: active ? "#fff" : colors.text }]}>
                  {col.title}
                </Text>
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
          {COLUMNS.find((c) => c.key === activeColumn)?.subtitle}
        </Text>
        <Text style={[styles.count, { color: colors.text }]}>
          {filteredClients.length} {filteredClients.length === 1 ? "cliente" : "clientes"}
        </Text>
      </View>

      <FlatList
        data={filteredClients}
        keyExtractor={(c) => c.client_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchPipeline();
            }}
          />
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            Nenhuma cliente nessa etapa agora.
          </Text>
        }
        renderItem={({ item }) => <ClientCard item={item} colors={colors} onPress={(id) => router.push(`/(employee)/client-file?id=${id}`)} />}
      />
    </SafeAreaView>
  );
}

function ClientCard({
  item,
  colors,
  onPress,
}: {
  item: PipelineClient;
  colors: any;
  onPress: (id: string) => void;
}) {
  const accent =
    item.priority === "high" ? "#c25a4a" : item.priority === "med" ? "#b89968" : "#6b8e6f";
  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: accent },
      ]}
      onPress={() => onPress(item.client_id)}
    >
      <View style={styles.cardHead}>
        <Avatar name={item.client_name} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.cardName, { color: colors.text }]}>{item.client_name}</Text>
          <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
            {item.procedure_name ?? "—"}{" "}
            {item.days_since != null && `· D+${item.days_since}`}
          </Text>
        </View>
        {item.context_tag && (
          <View
            style={[
              styles.tag,
              {
                backgroundColor:
                  item.priority === "high"
                    ? "#fef0ed"
                    : item.priority === "med"
                      ? "#fff4e0"
                      : "#ecf2ed",
              },
            ]}
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
        <Text style={[styles.cardAction, { color: colors.text }]}>
          → {item.next_action_text}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    marginHorizontal: 3,
    gap: 6,
  },
  tabEmoji: { fontSize: 14 },
  tabLabel: { fontSize: 12, fontWeight: "600" },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 100,
    backgroundColor: "#e8e1d6",
  },
  tabBadgeText: { fontSize: 10, fontWeight: "700" },
  subtitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  subtitle: { fontSize: 12, fontStyle: "italic" },
  count: { fontSize: 12, fontWeight: "700" },
  card: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 3,
  },
  cardHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#b89968",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cardName: { fontSize: 13, fontWeight: "600" },
  cardMeta: { fontSize: 10, marginTop: 2 },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  cardMemo: {
    fontSize: 11,
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    lineHeight: 16,
  },
  cardAction: { fontSize: 11, fontWeight: "600", lineHeight: 16 },
  empty: { textAlign: "center", padding: 30, fontSize: 13 },
});
