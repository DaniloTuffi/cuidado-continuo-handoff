// apps/mobile/app/(client)/ai-care-chat.tsx
// Chat IA 24/7 do Cuidado Contínuo.
// Cliente envia mensagem → invoke edge function → resposta IA ou escalation pra profissional.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/theme";

interface Message {
  id: string;
  role: "user" | "assistant" | "employee" | "system";
  body: string;
  created_at: string;
}

export default function AiCareChat() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const [convId, setConvId] = useState<string | null>(null);
  const [escalation, setEscalation] = useState<string>("ai_only");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const init = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const { data: cd } = await supabase
        .from("client_details")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!cd) return;

      // Conversa ativa ou criar nova
      let { data: conv } = await supabase
        .from("care_ai_conversations")
        .select("id, escalation_status")
        .eq("client_id", cd.id)
        .is("closed_at", null)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!conv) {
        const { data: protocol } = await supabase
          .from("client_protocol_progress")
          .select("id, protocol_definition_id, protocol_definitions(procedure_key)")
          .eq("client_id", cd.id)
          .eq("status", "active")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: newConv } = await supabase
          .from("care_ai_conversations")
          .insert({
            client_id: cd.id,
            related_protocol_id: protocol?.id ?? null,
            related_procedure_key: (protocol as any)?.protocol_definitions?.procedure_key ?? null,
          })
          .select("id, escalation_status")
          .single();
        conv = newConv;
      }

      if (conv) {
        setConvId(conv.id);
        setEscalation(conv.escalation_status);

        const { data: msgs } = await supabase
          .from("care_ai_messages")
          .select("id, role, body, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at");
        setMessages((msgs ?? []) as Message[]);
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { init(); }, [init]);

  const send = async () => {
    if (!convId || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);

    // Otimista
    const tempUserMsg: Message = {
      id: "tmp-" + Date.now(),
      role: "user",
      body: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const { data, error } = await supabase.functions.invoke("ai-care-respond", {
        body: { conversation_id: convId, message: text },
      });
      if (error) throw error;

      const reply: string = data?.reply ?? "Desculpa, não consegui responder agora.";
      const escNeeded: boolean = !!data?.escalation_required;

      setMessages((prev) => [
        ...prev,
        {
          id: "asst-" + Date.now(),
          role: "assistant",
          body: reply,
          created_at: new Date().toISOString(),
        },
      ]);
      if (escNeeded) setEscalation("requested");

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.error("[chat]", e);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: "Sua Cuidadora" }} />

      {escalation === "requested" && (
        <View style={styles.escBanner}>
          <Text style={styles.escText}>
            🤝 Uma profissional vai te responder em até 2h. Pode continuar escrevendo enquanto isso.
          </Text>
        </View>
      )}

      {messages.length === 0 && (
        <View style={styles.welcome}>
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>
            Oi, {profile?.full_name?.split(" ")[0] ?? "querida"}. 💆‍♀️
          </Text>
          <Text style={[styles.welcomeText, { color: colors.textMuted }]}>
            Sou sua cuidadora digital. Pode me perguntar sobre:
          </Text>
          <Text style={[styles.welcomeBullet, { color: colors.textMuted }]}>· Como cuidar da pele depois do procedimento</Text>
          <Text style={[styles.welcomeBullet, { color: colors.textMuted }]}>· O que é normal sentir nos próximos dias</Text>
          <Text style={[styles.welcomeBullet, { color: colors.textMuted }]}>· Lembrete dos cuidados de hoje</Text>
          <Text style={[styles.welcomeBullet, { color: colors.textMuted }]}>· Quando preciso voltar pra clínica</Text>
          <Text style={[styles.welcomeText, { color: colors.textMuted, marginTop: 12 }]}>
            Se for algo clínico mais sério, peço pra sua profissional te responder pessoalmente.
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.msg,
              m.role === "user" ? styles.msgUser : styles.msgAssistant,
              {
                backgroundColor:
                  m.role === "user" ? "#1f1a17" : colors.surface,
              },
            ]}
          >
            {m.role === "employee" && (
              <Text style={styles.msgRoleLabel}>👩 Profissional</Text>
            )}
            <Text style={[styles.msgText, { color: m.role === "user" ? "#f4ece2" : colors.text }]}>
              {m.body}
            </Text>
          </View>
        ))}
        {sending && (
          <View style={[styles.msg, styles.msgAssistant, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceMuted }]}
            placeholder="Escreve sua dúvida…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !draft.trim() && { opacity: 0.4 }]}
            disabled={!draft.trim() || sending}
            onPress={send}
          >
            <Text style={styles.sendText}>↑</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  escBanner: { padding: 12, backgroundColor: "#fff4e0", borderBottomWidth: 1, borderBottomColor: "#f4d999" },
  escText: { color: "#8a6f3d", fontSize: 13, lineHeight: 18 },
  welcome: { padding: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: "600", marginBottom: 8 },
  welcomeText: { fontSize: 14, lineHeight: 20 },
  welcomeBullet: { fontSize: 13, lineHeight: 22, marginLeft: 4 },
  msg: { padding: 12, borderRadius: 14, marginBottom: 8, maxWidth: "85%" },
  msgUser: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  msgAssistant: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  msgRoleLabel: { fontSize: 10, letterSpacing: 1, fontWeight: "700", color: "#8a3a4f", marginBottom: 4 },
  msgText: { fontSize: 14, lineHeight: 19 },
  composer: { flexDirection: "row", padding: 10, gap: 8, alignItems: "flex-end", borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 18, padding: 12, fontSize: 14, maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#b89968", justifyContent: "center", alignItems: "center" },
  sendText: { color: "#1f1a17", fontWeight: "700", fontSize: 18 },
});
