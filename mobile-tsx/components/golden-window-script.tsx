// apps/mobile/components/golden-window-script.tsx
//
// Componente modal/sheet com o script dedicado da Janela de Ouro (D+8).
// É chamado da seção "Janela de Ouro hoje" do briefing.
// Mostra: contexto da cliente + roteiro de conversa estruturado + CTAs.

import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Client {
  client_id: string;
  client_name: string;
  procedure_name: string;
  procedure_key: string;
  days_since: number;
  ltv_centavos: number;
  memory_snippet: string | null;
  suggested_opener: string;
  has_upcoming_appt: boolean;
}

interface Props {
  visible: boolean;
  client: Client | null;
  onClose: () => void;
  onSendAudio: (clientId: string) => void;
  onSendMessage: (clientId: string, message: string) => void;
  onScheduleReturn: (clientId: string) => void;
  onOfferCourtesy: (clientId: string) => void;
}

const PHASE_SCRIPT = {
  abertura: [
    "Bom dia, {name}. Aqui é a [profissional], do Estúdio.",
    "Hoje fez 8 dias desde a {procedure} — e esse é justo o momento que eu mais gosto de ouvir você.",
    "Pode ser por áudio rapidinho?",
  ],
  exploracao: [
    "Como você tá enxergando o resultado agora que o efeito assentou?",
    "Tem alguma coisa que tá te incomodando, mesmo coisa pequena?",
    "E como tá sua rotina? Algum compromisso importante chegando?",
  ],
  vinculo: [
    "Lembra que você comentou comigo sobre [{memory}]?",
    "Eu fiquei pensando depois daquela conversa — você tá bem com isso?",
  ],
  fechamento: [
    "Quero te marcar pra eu mesma ver de novo daqui umas 3 semanas — é gratuito, é um check.",
    "Pode ser dia X ou Y? Te garanto na minha agenda.",
  ],
  cortesia_opcional: [
    "Tem uma cortesia que reservei especialmente pra você (massagem 30min / brinde do mês) —",
    "encaixa no mesmo dia ou em outro horário, como você preferir.",
  ],
};

const PRINCIPLES = [
  "NÃO marca o retorno como venda. É check técnico, gratuito.",
  "A frase âncora vem da memória dela — usar SEMPRE.",
  "Se ela diz 'tá tudo bem', pergunta DE NOVO de outro jeito. 80% das primeiras respostas são polidas.",
  "Cortesia entra SÓ se ela for Premium ou se a conversa abrir espaço — não força.",
  "Áudio > mensagem. Vínculo é voz, não texto.",
];

export function GoldenWindowScript({
  visible,
  client,
  onClose,
  onSendAudio,
  onSendMessage,
  onScheduleReturn,
  onOfferCourtesy,
}: Props) {
  const [openPhase, setOpenPhase] = useState<keyof typeof PHASE_SCRIPT | null>("abertura");

  if (!client) return null;

  const firstName = client.client_name.split(" ")[0];
  const procedure = client.procedure_name.toLowerCase();

  function renderLine(line: string): string {
    return line
      .replace("{name}", firstName)
      .replace("{procedure}", procedure)
      .replace("{memory}", client?.memory_snippet?.slice(0, 60) ?? "—");
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>JANELA DE OURO · D+{client.days_since}</Text>
            <Text style={styles.title}>{client.client_name}</Text>
            <Text style={styles.subtitle}>{client.procedure_name}</Text>
          </View>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 100 }}>
          {/* Princípios — sempre visíveis */}
          <View style={styles.principlesBox}>
            <Text style={styles.principlesTitle}>🎯 ANTES DE LIGAR · 5 PRINCÍPIOS</Text>
            {PRINCIPLES.map((p, i) => (
              <Text key={i} style={styles.principleItem}>
                {i + 1}. {p}
              </Text>
            ))}
          </View>

          {/* Memória ativa da cliente */}
          {!!client.memory_snippet && (
            <View style={styles.memoryBox}>
              <Text style={styles.memoryLabel}>🧠 MEMÓRIA ATIVA · ANCORA NISSO</Text>
              <Text style={styles.memoryText}>"{client.memory_snippet}"</Text>
            </View>
          )}

          {/* Fases do script — accordion */}
          {(Object.keys(PHASE_SCRIPT) as Array<keyof typeof PHASE_SCRIPT>).map((phase) => (
            <View key={phase} style={styles.phaseBlock}>
              <TouchableOpacity
                style={styles.phaseHeader}
                onPress={() => setOpenPhase(openPhase === phase ? null : phase)}
              >
                <Text style={styles.phaseName}>
                  {phase === "abertura" ? "1 · ABERTURA"
                    : phase === "exploracao" ? "2 · EXPLORAR O QUE ELA SENTE"
                    : phase === "vinculo" ? "3 · ANCORAR NO PESSOAL"
                    : phase === "fechamento" ? "4 · FECHAR O RETORNO"
                    : "5 · CORTESIA (SE COUBER)"}
                </Text>
                <Text style={styles.phaseToggle}>{openPhase === phase ? "−" : "+"}</Text>
              </TouchableOpacity>
              {openPhase === phase && (
                <View style={styles.phaseLines}>
                  {PHASE_SCRIPT[phase].map((line, i) => (
                    <Text key={i} style={styles.scriptLine}>"{renderLine(line)}"</Text>
                  ))}
                </View>
              )}
            </View>
          ))}

          {/* Status do retorno */}
          {client.has_upcoming_appt ? (
            <View style={styles.statusBoxOk}>
              <Text style={styles.statusText}>✓ Retorno já agendado · foco em fortalecer vínculo</Text>
            </View>
          ) : (
            <View style={styles.statusBoxAlert}>
              <Text style={styles.statusTextAlert}>
                ⚠ Sem retorno agendado · meta principal de hoje é deixar marcado
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Footer com 4 CTAs */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#8a3a4f" }]}
            onPress={() => onSendAudio(client.client_id)}
          >
            <Text style={styles.ctaText}>🎙️ Áudio</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#5a4f47" }]}
            onPress={() => onSendMessage(client.client_id, renderLine(PHASE_SCRIPT.abertura.join(" ")))}
          >
            <Text style={styles.ctaText}>💬 Texto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#b89968" }]}
            onPress={() => onScheduleReturn(client.client_id)}
          >
            <Text style={[styles.ctaText, { color: "#1f1a17" }]}>📅 Retorno</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: "#6b8e6f" }]}
            onPress={() => onOfferCourtesy(client.client_id)}
          >
            <Text style={styles.ctaText}>🎁 Cortesia</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1f1a17" },
  header: { flexDirection: "row", padding: 18, gap: 12, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)" },
  closeBtn: { width: 36, height: 36, justifyContent: "center", alignItems: "center", borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)" },
  closeText: { color: "#f4ece2", fontSize: 18, fontWeight: "300" },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: "#b89968", fontWeight: "700", marginBottom: 2 },
  title: { fontSize: 20, fontWeight: "600", color: "#f4ece2" },
  subtitle: { fontSize: 12, color: "rgba(244,236,226,0.6)", marginTop: 2 },

  body: { flex: 1, padding: 18 },

  principlesBox: { backgroundColor: "rgba(184,153,104,0.12)", padding: 14, borderRadius: 14, marginBottom: 14 },
  principlesTitle: { fontSize: 10, letterSpacing: 1.5, color: "#d4bf95", fontWeight: "700", marginBottom: 10 },
  principleItem: { color: "#f4ece2", fontSize: 12, lineHeight: 18, marginBottom: 4 },

  memoryBox: { backgroundColor: "rgba(138,58,79,0.18)", padding: 14, borderRadius: 14, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: "#c97d8e" },
  memoryLabel: { fontSize: 10, letterSpacing: 1.5, color: "#c97d8e", fontWeight: "700", marginBottom: 6 },
  memoryText: { color: "#f4ece2", fontSize: 14, fontStyle: "italic", lineHeight: 20 },

  phaseBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.08)" },
  phaseHeader: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14 },
  phaseName: { fontSize: 11, letterSpacing: 1.5, color: "#d4bf95", fontWeight: "700" },
  phaseToggle: { fontSize: 18, color: "#d4bf95", fontWeight: "300", width: 20, textAlign: "center" },
  phaseLines: { paddingBottom: 14, gap: 8 },
  scriptLine: { color: "#f4ece2", fontSize: 13, lineHeight: 19, paddingLeft: 4, fontStyle: "italic" },

  statusBoxOk: { backgroundColor: "rgba(107,142,111,0.18)", padding: 14, borderRadius: 12, marginTop: 14 },
  statusBoxAlert: { backgroundColor: "rgba(194,90,74,0.18)", padding: 14, borderRadius: 12, marginTop: 14 },
  statusText: { color: "#a8c5ab", fontSize: 12, fontWeight: "600", textAlign: "center" },
  statusTextAlert: { color: "#e09e8e", fontSize: 12, fontWeight: "600", textAlign: "center" },

  footer: { flexDirection: "row", gap: 8, padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,255,255,0.1)" },
  cta: { flex: 1, paddingVertical: 12, borderRadius: 100, alignItems: "center" },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 12, letterSpacing: 0.5 },
});
