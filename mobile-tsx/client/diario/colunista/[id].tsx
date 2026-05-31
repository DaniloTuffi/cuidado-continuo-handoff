// apps/mobile/app/(client)/diario/colunista/[id].tsx
// Perfil individual de colunista — bio, todas as colunas, eventos que conduz.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../../lib/auth-context";
import { supabase } from "../../../../lib/supabase";
import { useTheme } from "../../../../lib/theme";

interface Author {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role_label: string | null;
  bio: string | null;
  tier_label: string | null;
}

interface Column {
  id: string;
  slug: string;
  title: string;
  deck: string | null;
  category: string;
  cover_image_url: string | null;
  like_count: number;
  comment_count: number;
  published_at: string;
}

export default function ColumnistProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState<Author | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [following, setFollowing] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id) return;
    try {
      const { data: a } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role_label, bio, tier_label")
        .eq("id", id)
        .maybeSingle();
      setAuthor(a as Author | null);

      const { data: cols } = await supabase
        .from("diario_columns")
        .select("id, slug, title, deck, category, cover_image_url, like_count, comment_count, published_at")
        .eq("author_profile_id", id)
        .eq("is_draft", false)
        .order("published_at", { ascending: false });
      setColumns((cols ?? []) as Column[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading || !author) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Colunista" }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: "#1f1a17" }]}>
          <View style={styles.heroAvatar}>
            {author.avatar_url ? (
              <Image source={{ uri: author.avatar_url }} style={styles.heroAvatarImg} />
            ) : (
              <Text style={styles.heroAvatarText}>{author.full_name[0]?.toUpperCase()}</Text>
            )}
          </View>
          {!!author.tier_label && (
            <Text style={styles.heroTier}>✨ {author.tier_label.toUpperCase()}</Text>
          )}
          <Text style={styles.heroName}>{author.full_name}</Text>
          {!!author.role_label && <Text style={styles.heroRole}>{author.role_label}</Text>}
          {!!author.bio && <Text style={styles.heroBio}>{author.bio}</Text>}

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[styles.heroBtn, following && { backgroundColor: "#6b8e6f" }]}
              onPress={() => setFollowing(!following)}
            >
              <Text style={styles.heroBtnText}>{following ? "✓ SEGUINDO" : "+ SEGUIR"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.heroBtn, styles.heroBtnSecondary]}>
              <Text style={styles.heroBtnTextSecondary}>💬 CONVERSAR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <Stat num={columns.length.toString()} label="Colunas" colors={colors} />
          <Stat
            num={columns.reduce((s, c) => s + c.like_count, 0).toString()}
            label="Curtidas"
            colors={colors}
          />
          <Stat
            num={columns.reduce((s, c) => s + c.comment_count, 0).toString()}
            label="Comentários"
            colors={colors}
          />
        </View>

        {/* Colunas */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {columns.length} colunas publicadas
          </Text>
        </View>

        {columns.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.colCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push(`/(client)/diario/${c.slug}`)}
          >
            <View style={[styles.colImage, { backgroundColor: hashColor(c.id) }]}>
              {c.cover_image_url && <Image source={{ uri: c.cover_image_url }} style={{ width: "100%", height: "100%" }} />}
            </View>
            <View style={{ flex: 1, padding: 12 }}>
              <Text style={[styles.colCategory, { color: "#8a6f3d" }]}>
                {c.category.toUpperCase()}
              </Text>
              <Text style={[styles.colTitle, { color: colors.text }]} numberOfLines={2}>
                {c.title}
              </Text>
              {c.deck && (
                <Text style={[styles.colDeck, { color: colors.textMuted }]} numberOfLines={1}>
                  {c.deck}
                </Text>
              )}
              <Text style={[styles.colStats, { color: colors.textMuted }]}>
                ♡ {c.like_count} · 💬 {c.comment_count}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ num, label, colors }: { num: string; label: string; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <Text style={[styles.statNum, { color: colors.text }]}>{num}</Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function hashColor(id: string): string {
  const palette = ["#8a3a4f", "#5a4f47", "#b89968", "#c97d8e", "#d4bf95", "#6b8e6f"];
  return palette[id.charCodeAt(0) % palette.length];
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: { padding: 28, alignItems: "center" },
  heroAvatar: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: "rgba(184,153,104,0.2)",
    borderWidth: 2, borderColor: "#b89968",
    justifyContent: "center", alignItems: "center", overflow: "hidden",
  },
  heroAvatarImg: { width: "100%", height: "100%" },
  heroAvatarText: { color: "#d4bf95", fontSize: 44, fontWeight: "600", fontStyle: "italic" },
  heroTier: {
    fontSize: 10, letterSpacing: 2.5, color: "#d4bf95", fontWeight: "700", marginTop: 14,
  },
  heroName: { fontSize: 28, fontWeight: "600", color: "#fff", letterSpacing: -0.5, marginTop: 6 },
  heroRole: { fontSize: 13, color: "rgba(244,236,226,0.85)", marginTop: 4 },
  heroBio: { fontSize: 13, color: "rgba(244,236,226,0.85)", fontStyle: "italic", textAlign: "center", marginTop: 12, lineHeight: 19 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  heroBtn: {
    backgroundColor: "#b89968",
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100,
  },
  heroBtnSecondary: { backgroundColor: "rgba(244,236,226,0.15)" },
  heroBtnText: { color: "#1f1a17", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  heroBtnTextSecondary: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 1 },

  stats: { flexDirection: "row", padding: 16, gap: 10 },
  statCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  statNum: { fontSize: 24, fontWeight: "600", letterSpacing: -0.5 },
  statLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 4 },

  sectionHead: { paddingHorizontal: 16, paddingVertical: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "600" },

  colCard: {
    flexDirection: "row",
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  colImage: { width: 90, aspectRatio: 1 },
  colCategory: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginBottom: 4 },
  colTitle: { fontSize: 14, fontWeight: "600", lineHeight: 18 },
  colDeck: { fontSize: 11, marginTop: 4 },
  colStats: { fontSize: 10, marginTop: 6 },
});
