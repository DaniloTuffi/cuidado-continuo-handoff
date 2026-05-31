// apps/mobile/app/(client)/diario/[slug].tsx
//
// Tela de coluna aberta — lê o markdown, mostra autor, permite curtir/comentar.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { useTheme } from "../../../lib/theme";

interface Column {
  id: string;
  slug: string;
  title: string;
  deck: string | null;
  body_markdown: string;
  category: string;
  cover_image_url: string | null;
  reading_minutes: number | null;
  edition_number: number | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  published_at: string;
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    role_label: string | null;
    bio: string | null;
  };
}

interface Comment {
  id: string;
  body: string;
  like_count: number;
  created_at: string;
  author: { id: string; full_name: string; avatar_url: string | null; tier_label: string | null };
}

export default function ColumnReadScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { colors } = useTheme();

  const [loading, setLoading] = useState(true);
  const [column, setColumn] = useState<Column | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!slug) return;
    try {
      const { data: col } = await supabase
        .from("diario_columns")
        .select("*, author:profiles!author_profile_id(id, full_name, avatar_url, role_label, bio)")
        .eq("slug", slug)
        .maybeSingle();
      if (!col) {
        Alert.alert("Coluna não encontrada");
        router.back();
        return;
      }
      setColumn(col as Column);

      // increment view (idempotente seria via function, mvp: simples update)
      await supabase
        .from("diario_columns")
        .update({ view_count: (col as Column).view_count + 1 })
        .eq("id", (col as Column).id);

      const { data: liked } = await supabase
        .from("diario_likes")
        .select("id")
        .eq("profile_id", profile?.id)
        .eq("target_type", "column")
        .eq("target_id", (col as Column).id)
        .maybeSingle();
      setLiked(!!liked);

      const { data: coms } = await supabase
        .from("diario_comments")
        .select("*, author:profiles!author_profile_id(id, full_name, avatar_url, tier_label)")
        .eq("column_id", (col as Column).id)
        .eq("is_hidden", false)
        .order("like_count", { ascending: false })
        .limit(30);
      setComments((coms ?? []) as Comment[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [slug, profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleLike = async () => {
    if (!column || !profile) return;
    if (liked) {
      await supabase
        .from("diario_likes")
        .delete()
        .eq("profile_id", profile.id)
        .eq("target_type", "column")
        .eq("target_id", column.id);
      setLiked(false);
      setColumn({ ...column, like_count: Math.max(0, column.like_count - 1) });
    } else {
      await supabase
        .from("diario_likes")
        .insert({ profile_id: profile.id, target_type: "column", target_id: column.id });
      setLiked(true);
      setColumn({ ...column, like_count: column.like_count + 1 });
    }
  };

  const postComment = async () => {
    if (!column || !profile || !draft.trim()) return;
    setPosting(true);
    try {
      const { data, error } = await supabase
        .from("diario_comments")
        .insert({ column_id: column.id, author_profile_id: profile.id, body: draft.trim() })
        .select("*, author:profiles!author_profile_id(id, full_name, avatar_url, tier_label)")
        .single();
      if (error) throw error;
      setComments([data as Comment, ...comments]);
      setColumn({ ...column, comment_count: column.comment_count + 1 });
      setDraft("");
    } catch (e: any) {
      Alert.alert("Erro", e.message ?? "Não consegui publicar o comentário.");
    } finally {
      setPosting(false);
    }
  };

  if (loading || !column) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Diário" }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Header */}
        <View style={styles.head}>
          <Text style={[styles.category, { color: "#8a6f3d" }]}>
            {column.category.toUpperCase()} · COLUNA EM DESTAQUE
          </Text>
          <Text style={[styles.title, { color: colors.text }]}>{column.title}</Text>
          {column.deck && (
            <Text style={[styles.deck, { color: colors.textMuted }]}>{column.deck}</Text>
          )}
          <View style={styles.byline}>
            <View style={styles.bylineAvatar}>
              <Text style={styles.bylineAvatarText}>
                {column.author.full_name[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bylineName, { color: colors.text }]}>{column.author.full_name}</Text>
              <Text style={[styles.bylineRole, { color: colors.textMuted }]}>{column.author.role_label}</Text>
            </View>
          </View>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {fmtDate(column.published_at)} · {column.reading_minutes ?? 5} min · Edição {column.edition_number}
          </Text>
        </View>

        {/* Cover */}
        {column.cover_image_url ? (
          <Image source={{ uri: column.cover_image_url }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, { backgroundColor: "#5a4f47" }]} />
        )}

        {/* Body */}
        <View style={styles.body}>
          {column.body_markdown.split(/\n\s*\n/).map((para, i) => (
            <Text key={i} style={[styles.para, { color: colors.text }]}>
              {para}
            </Text>
          ))}
        </View>

        {/* Reactions */}
        <View style={[styles.reactions, { borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.reactBtn, liked && { backgroundColor: "#8a3a4f" }]} onPress={toggleLike}>
            <Text style={[styles.reactText, { color: liked ? "#fff" : colors.text }]}>♡ {column.like_count}</Text>
          </TouchableOpacity>
          <Text style={[styles.reactStat, { color: colors.textMuted }]}>💬 {column.comment_count}</Text>
          <Text style={[styles.reactStat, { color: colors.textMuted }]}>👁 {column.view_count}</Text>
        </View>

        {/* Autora */}
        <View style={[styles.authorBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.authorBig}>
            <Text style={styles.authorBigText}>{column.author.full_name[0]?.toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.authorLabel, { color: "#8a6f3d" }]}>SOBRE A COLUNISTA</Text>
            <Text style={[styles.authorName, { color: colors.text }]}>{column.author.full_name}</Text>
            {column.author.bio && (
              <Text style={[styles.authorBio, { color: colors.textMuted }]} numberOfLines={3}>
                {column.author.bio}
              </Text>
            )}
            <TouchableOpacity
              style={styles.authorBtn}
              onPress={() => router.push(`/(client)/diario/colunista/${column.author.id}`)}
            >
              <Text style={styles.authorBtnText}>VER PERFIL →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Comentários */}
        <View style={styles.commentsHead}>
          <Text style={[styles.commentsTitle, { color: colors.text }]}>{column.comment_count} comentários</Text>
        </View>

        <View style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.composerInput, { color: colors.text, backgroundColor: colors.surfaceMuted }]}
            placeholder="Escreva o que você sentiu lendo…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.composerBtn, !draft.trim() && { opacity: 0.5 }]}
            onPress={postComment}
            disabled={!draft.trim() || posting}
          >
            <Text style={styles.composerBtnText}>{posting ? "..." : "Publicar"}</Text>
          </TouchableOpacity>
        </View>

        {comments.map((c) => (
          <View key={c.id} style={[styles.comment, { borderColor: colors.border }]}>
            <View style={styles.commentAvatar}>
              <Text style={styles.commentAvatarText}>{c.author.full_name[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.commentHead}>
                <Text style={[styles.commentName, { color: colors.text }]}>{c.author.full_name}</Text>
                {!!c.author.tier_label && (
                  <Text style={[styles.commentTier, { color: "#8a6f3d" }]}>{c.author.tier_label.toUpperCase()}</Text>
                )}
                <Text style={[styles.commentTime, { color: colors.textMuted }]}>{fmtRelative(c.created_at)}</Text>
              </View>
              <Text style={[styles.commentBody, { color: colors.textMuted }]}>{c.body}</Text>
              <Text style={[styles.commentLikes, { color: colors.textMuted }]}>♡ {c.like_count}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function fmtDate(iso: string): string {
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const d = new Date(iso);
  return `${d.getDate()} de ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.floor(days / 7)} semanas`;
  return `há ${Math.floor(days / 30)} meses`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  head: { padding: 24 },
  category: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "600", letterSpacing: -1, lineHeight: 36, marginBottom: 12 },
  deck: { fontSize: 16, fontStyle: "italic", lineHeight: 22, marginBottom: 16 },
  byline: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  bylineAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#b89968", justifyContent: "center", alignItems: "center" },
  bylineAvatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  bylineName: { fontSize: 14, fontWeight: "600" },
  bylineRole: { fontSize: 11 },
  meta: { fontSize: 11, letterSpacing: 1, fontWeight: "600" },
  cover: { width: "100%", aspectRatio: 16 / 9 },
  body: { padding: 24 },
  para: { fontSize: 16, lineHeight: 25, marginBottom: 16 },
  reactions: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reactBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: "#f5f5f5" },
  reactText: { fontSize: 13, fontWeight: "600" },
  reactStat: { fontSize: 12 },
  authorBox: {
    flexDirection: "row",
    margin: 24,
    padding: 20,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
    alignItems: "center",
  },
  authorBig: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "#5a4f47",
    justifyContent: "center", alignItems: "center",
  },
  authorBigText: { color: "#d4bf95", fontSize: 32, fontWeight: "600", fontStyle: "italic" },
  authorLabel: { fontSize: 9, letterSpacing: 1.5, fontWeight: "700", marginBottom: 3 },
  authorName: { fontSize: 18, fontWeight: "600", marginBottom: 4 },
  authorBio: { fontSize: 12, lineHeight: 16, marginBottom: 8 },
  authorBtn: { alignSelf: "flex-start" },
  authorBtnText: { color: "#1f1a17", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  commentsHead: { paddingHorizontal: 24, paddingVertical: 12 },
  commentsTitle: { fontSize: 18, fontWeight: "600" },
  composer: { margin: 16, padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: 10, alignItems: "flex-end" },
  composerInput: { flex: 1, borderRadius: 10, padding: 10, fontSize: 13, minHeight: 44 },
  composerBtn: { backgroundColor: "#1f1a17", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 100 },
  composerBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  comment: { flexDirection: "row", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#b89968", justifyContent: "center", alignItems: "center" },
  commentAvatarText: { color: "#fff", fontWeight: "700" },
  commentHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" },
  commentName: { fontSize: 13, fontWeight: "600" },
  commentTier: { fontSize: 9, letterSpacing: 1, fontWeight: "700" },
  commentTime: { fontSize: 10 },
  commentBody: { fontSize: 13, lineHeight: 18 },
  commentLikes: { fontSize: 11, marginTop: 6 },
});
