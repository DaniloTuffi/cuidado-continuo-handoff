// apps/mobile/app/(client)/diario/index.tsx
//
// Diário Estúdio Mais — hub editorial.
// Mostra coluna em destaque + colunas recentes + galeria de colunistas + eventos.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

interface DiarioColumn {
  id: string;
  slug: string;
  title: string;
  deck: string | null;
  category: string;
  cover_image_url: string | null;
  reading_minutes: number | null;
  edition_number: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  is_featured: boolean;
  published_at: string;
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role_label: string | null;
  };
}

interface Columnist {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role_label: string | null;
  column_count: number;
}

interface DiarioEvent {
  id: string;
  slug: string;
  title: string;
  deck: string | null;
  starts_at: string;
  location: string | null;
  capacity: number;
  rsvp_count: number;
}

const CATEGORIES = [
  { key: "all", label: "Todas" },
  { key: "lideranca", label: "Liderança" },
  { key: "carreira", label: "Carreira" },
  { key: "maternidade", label: "Maternidade" },
  { key: "saude_feminina", label: "Saúde Feminina" },
  { key: "direito", label: "Direito" },
  { key: "arquitetura", label: "Arquitetura" },
  { key: "estilo", label: "Estilo" },
  { key: "joalheria", label: "Joalheria" },
  { key: "mindset", label: "Mindset" },
  { key: "ciencia", label: "Ciência" },
  { key: "mae_60_plus", label: "Mãe 60+" },
];

export default function DiarioIndexScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [featured, setFeatured] = useState<DiarioColumn | null>(null);
  const [columns, setColumns] = useState<DiarioColumn[]>([]);
  const [columnists, setColumnists] = useState<Columnist[]>([]);
  const [events, setEvents] = useState<DiarioEvent[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const fetchAll = useCallback(async () => {
    try {
      // Featured
      const { data: feat } = await supabase
        .from("diario_columns")
        .select("*, author:profiles!author_profile_id(id, full_name, avatar_url, role_label)")
        .eq("is_draft", false)
        .eq("is_featured", true)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setFeatured(feat as DiarioColumn | null);

      // Recentes
      const { data: cols } = await supabase
        .from("diario_columns")
        .select("*, author:profiles!author_profile_id(id, full_name, avatar_url, role_label)")
        .eq("is_draft", false)
        .order("published_at", { ascending: false })
        .limit(20);
      setColumns((cols ?? []) as DiarioColumn[]);

      // Colunistas (agregação simples)
      const { data: authors } = await supabase.rpc("diario_top_columnists", { p_limit: 10 });
      setColumnists((authors ?? []) as Columnist[]);

      // Eventos futuros
      const { data: evs } = await supabase
        .from("diario_events")
        .select("*")
        .eq("is_published", true)
        .gte("starts_at", new Date().toISOString())
        .order("starts_at")
        .limit(4);
      setEvents((evs ?? []) as DiarioEvent[]);
    } catch (e) {
      console.error("Diário fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredColumns = useMemo(() => {
    if (categoryFilter === "all") return columns;
    return columns.filter((c) => c.category === categoryFilter);
  }, [columns, categoryFilter]);

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
          title: "Diário",
          headerLargeTitle: false,
        }}
      />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />
        }
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Masthead */}
        <View style={[styles.masthead, { backgroundColor: "#1f1a17" }]}>
          <Text style={styles.mastheadEyebrow}>ESTÚDIO MAIS</Text>
          <Text style={styles.mastheadTitle}>Diário</Text>
          <Text style={styles.mastheadEdition}>
            Edição {featured?.edition_number ?? "—"} · {monthYear()}
          </Text>
        </View>

        {/* Featured */}
        {featured && (
          <TouchableOpacity
            style={styles.featured}
            onPress={() => router.push(`/(client)/diario/${featured.slug}`)}
          >
            <View style={[styles.featuredImage, { backgroundColor: "#5a4f47" }]}>
              {featured.cover_image_url && (
                <Image source={{ uri: featured.cover_image_url }} style={styles.featuredImageImg} />
              )}
            </View>
            <Text style={[styles.featuredCategory, { color: "#8a6f3d" }]}>
              EM DESTAQUE · {labelOf(featured.category).toUpperCase()}
            </Text>
            <Text style={[styles.featuredTitle, { color: colors.text }]}>{featured.title}</Text>
            {featured.deck && (
              <Text style={[styles.featuredDeck, { color: colors.textMuted }]}>{featured.deck}</Text>
            )}
            <View style={styles.byline}>
              <View style={styles.bylineAvatar}>
                <Text style={styles.bylineAvatarText}>
                  {featured.author?.full_name?.[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.bylineName, { color: colors.text }]}>
                  {featured.author?.full_name}
                </Text>
                <Text style={[styles.bylineRole, { color: colors.textMuted }]}>
                  {featured.author?.role_label ?? ""}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Categorias */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[
                styles.catChip,
                { backgroundColor: colors.surface, borderColor: colors.border },
                categoryFilter === c.key && { backgroundColor: "#1f1a17", borderColor: "#1f1a17" },
              ]}
              onPress={() => setCategoryFilter(c.key)}
            >
              <Text style={[styles.catChipText, { color: categoryFilter === c.key ? "#fff" : colors.text }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recentes */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Colunas recentes</Text>
        </View>

        {filteredColumns.map((col) => (
          <TouchableOpacity
            key={col.id}
            style={[styles.colCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(`/(client)/diario/${col.slug}`)}
          >
            <View style={[styles.colImage, { backgroundColor: hashColor(col.id) }]}>
              {col.cover_image_url && <Image source={{ uri: col.cover_image_url }} style={styles.colImageImg} />}
            </View>
            <View style={{ flex: 1, padding: 12 }}>
              <Text style={[styles.colCategory, { color: "#8a6f3d" }]}>
                {labelOf(col.category).toUpperCase()}
              </Text>
              <Text style={[styles.colTitle, { color: colors.text }]} numberOfLines={2}>
                {col.title}
              </Text>
              {col.deck && (
                <Text style={[styles.colDeck, { color: colors.textMuted }]} numberOfLines={2}>
                  {col.deck}
                </Text>
              )}
              <View style={styles.colMeta}>
                <Text style={[styles.colAuthor, { color: colors.textMuted }]}>
                  {col.author?.full_name}
                </Text>
                <Text style={[styles.colStats, { color: colors.textMuted }]}>
                  ♡ {col.like_count} · 💬 {col.comment_count}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* Colunistas */}
        {columnists.length > 0 && (
          <>
            <View style={[styles.darkSection, { backgroundColor: "#1f1a17" }]}>
              <Text style={styles.darkSectionTitle}>Conheça as colunistas</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12 }}>
                {columnists.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.colunistaItem}
                    onPress={() => router.push(`/(client)/diario/colunista/${c.id}`)}
                  >
                    <View style={styles.colunistaAvatar}>
                      <Text style={styles.colunistaAvatarText}>
                        {c.full_name[0]?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                    <Text style={styles.colunistaName} numberOfLines={1}>
                      {c.full_name}
                    </Text>
                    <Text style={styles.colunistaRole} numberOfLines={1}>
                      {c.role_label ?? ""}
                    </Text>
                    <Text style={styles.colunistaCount}>{c.column_count} colunas</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </>
        )}

        {/* Encontros */}
        {events.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Encontros Constelação</Text>
            </View>
            {events.map((ev) => (
              <TouchableOpacity
                key={ev.id}
                style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => router.push(`/(client)/diario/evento/${ev.id}`)}
              >
                <View style={styles.eventDate}>
                  <Text style={styles.eventDay}>{day(ev.starts_at)}</Text>
                  <Text style={styles.eventMonth}>{monthShort(ev.starts_at).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{ev.title}</Text>
                  {ev.deck && (
                    <Text style={[styles.eventDeck, { color: colors.textMuted }]} numberOfLines={2}>
                      {ev.deck}
                    </Text>
                  )}
                  <Text style={[styles.eventMeta, { color: colors.textMuted }]}>
                    {ev.location ?? ""} · {ev.rsvp_count}/{ev.capacity} confirmadas
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function labelOf(cat: string): string {
  return CATEGORIES.find((c) => c.key === cat)?.label ?? cat;
}

function monthYear(): string {
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const d = new Date();
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function day(iso: string): string {
  return new Date(iso).getDate().toString().padStart(2, "0");
}

function monthShort(iso: string): string {
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return months[new Date(iso).getMonth()];
}

function hashColor(id: string): string {
  const palette = ["#8a3a4f", "#5a4f47", "#b89968", "#c97d8e", "#d4bf95", "#6b8e6f"];
  return palette[id.charCodeAt(0) % palette.length];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  masthead: { paddingVertical: 24, paddingHorizontal: 24, alignItems: "center" },
  mastheadEyebrow: {
    fontSize: 10, letterSpacing: 3, color: "#d4bf95", fontWeight: "700", marginBottom: 4,
  },
  mastheadTitle: { fontSize: 36, fontWeight: "600", color: "#fff", letterSpacing: -1, fontStyle: "italic" },
  mastheadEdition: {
    fontSize: 10, letterSpacing: 2, color: "rgba(244,236,226,0.6)", marginTop: 4, fontWeight: "600",
  },
  featured: { padding: 16 },
  featuredImage: { aspectRatio: 16 / 9, borderRadius: 8, marginBottom: 12, overflow: "hidden" },
  featuredImageImg: { width: "100%", height: "100%" },
  featuredCategory: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 8 },
  featuredTitle: { fontSize: 26, fontWeight: "600", letterSpacing: -0.5, lineHeight: 30, marginBottom: 8 },
  featuredDeck: { fontSize: 14, fontStyle: "italic", lineHeight: 20, marginBottom: 12 },
  byline: { flexDirection: "row", alignItems: "center", gap: 10 },
  bylineAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#b89968",
    justifyContent: "center", alignItems: "center",
  },
  bylineAvatarText: { color: "#fff", fontWeight: "700" },
  bylineName: { fontSize: 13, fontWeight: "600" },
  bylineRole: { fontSize: 11 },

  catRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, borderWidth: 1, marginRight: 6,
  },
  catChipText: { fontSize: 12, fontWeight: "600" },

  sectionHead: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle: { fontSize: 22, fontWeight: "600", letterSpacing: -0.3 },

  colCard: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  colImage: { width: 100, aspectRatio: 1 },
  colImageImg: { width: "100%", height: "100%" },
  colCategory: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginBottom: 4 },
  colTitle: { fontSize: 14, fontWeight: "600", lineHeight: 18 },
  colDeck: { fontSize: 11, marginTop: 4, lineHeight: 14 },
  colMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  colAuthor: { fontSize: 10, fontWeight: "600" },
  colStats: { fontSize: 10 },

  darkSection: { padding: 20, marginTop: 16 },
  darkSectionTitle: { fontSize: 22, fontWeight: "600", color: "#f4ece2", letterSpacing: -0.5 },
  colunistaItem: { alignItems: "center", marginRight: 16, width: 80 },
  colunistaAvatar: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: "#b89968",
    backgroundColor: "rgba(184,153,104,0.15)",
    justifyContent: "center", alignItems: "center", marginBottom: 8,
  },
  colunistaAvatarText: { color: "#d4bf95", fontSize: 24, fontWeight: "600", fontStyle: "italic" },
  colunistaName: { fontSize: 11, fontWeight: "600", color: "#f4ece2", textAlign: "center" },
  colunistaRole: { fontSize: 9, color: "#d4bf95", letterSpacing: 1, fontWeight: "700", marginTop: 2, textTransform: "uppercase", textAlign: "center" },
  colunistaCount: { fontSize: 9, color: "rgba(244,236,226,0.5)", marginTop: 4 },

  eventCard: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 14,
    alignItems: "center",
  },
  eventDate: { width: 56, alignItems: "center" },
  eventDay: { fontSize: 28, fontWeight: "600", color: "#8a3a4f" },
  eventMonth: { fontSize: 9, letterSpacing: 1.5, color: "#5a4f47", fontWeight: "700", marginTop: 2 },
  eventTitle: { fontSize: 15, fontWeight: "600", marginBottom: 4 },
  eventDeck: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  eventMeta: { fontSize: 10 },
});
