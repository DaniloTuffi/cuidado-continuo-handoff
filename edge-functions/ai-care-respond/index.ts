// supabase/functions/ai-care-respond/index.ts
//
// Edge Function (Deno) que responde à mensagem do cliente no chat de cuidado.
// Usa Anthropic Claude com prompt caching. Detecta sinais de handoff humano.
//
// Invoked from mobile: supabase.functions.invoke('ai-care-respond', { body: { conversation_id, message } })

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const SYSTEM_PROMPT = `Você é a IA assistente do Cuidado Contínuo do Estúdio Mais — uma clínica premium de estética feminina.

REGRAS ABSOLUTAS:
1. Você NÃO substitui profissional clínica. Responde dúvidas operacionais (homecare, normalidade, cuidados pós-procedimento) e ESCALA pra humana em qualquer dúvida que cheire a urgência clínica.
2. NUNCA prescreve medicação, NUNCA dá diagnóstico, NUNCA recomenda intervenção que cliente já não tenha autorização.
3. Toda mensagem é assinada por uma pessoa real eventualmente — você prepara o terreno, não substitui o vínculo.
4. SE detectar qualquer um dos sinais abaixo, retorne JSON com escalation_required = true:
   - Dor intensa, persistente ou anormal
   - Sangramento, infecção visível, alergia
   - Febre, mal-estar geral, taquicardia
   - Reação alérgica
   - Sentimento de desespero, ansiedade severa, raiva contra a clínica
   - Dúvida sobre medicação prescrita
   - Algo que envolve filho, gravidez ou outra cliente
5. Sempre responda em português brasileiro, tom acolhedor, sem emoji exagerado (no máximo 1 por resposta), sem CTA comercial, sem desconto, sem urgência falsa.

CONTEXTO DA CLIENTE:
- Procedimento mais recente: {procedure_name}
- Dias desde o procedimento: D+{days_since}
- Tier do Cuidado Contínuo: {tier_name}

CUIDADOS ESPECÍFICOS DO PROCEDIMENTO:
{procedure_care_text}

HISTÓRICO RECENTE DA CONVERSA:
{conversation_history}

Responda como UMA mensagem só. Se for escalation, ainda dê uma frase de acolhimento E explique que vai passar pra profissional humana.`;

interface RequestBody {
  conversation_id: string;
  message: string;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  try {
    const { conversation_id, message } = (await req.json()) as RequestBody;
    if (!conversation_id || !message) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Carrega conversa + cliente + procedimento
    const { data: conv } = await supabase
      .from("care_ai_conversations")
      .select(`
        id, client_id, related_procedure_key, related_protocol_id,
        client_details!client_id (
          profiles!profile_id (full_name),
          loyalty_tiers!loyalty_tier_id (name)
        )
      `)
      .eq("id", conversation_id)
      .single();

    if (!conv) return new Response(JSON.stringify({ error: "conv not found" }), { status: 404 });

    const { data: protocolRow } = await supabase
      .from("client_protocol_progress")
      .select("started_at, protocol_definitions!protocol_definition_id(procedure_name, daily_actions)")
      .eq("id", conv.related_protocol_id)
      .maybeSingle();

    const procedureName = (protocolRow as any)?.protocol_definitions?.procedure_name ?? "—";
    const daysSince = protocolRow
      ? Math.floor((Date.now() - new Date(protocolRow.started_at).getTime()) / 86400000)
      : 0;
    const tierName = (conv as any).client_details?.loyalty_tiers?.name ?? "Início";

    // 2) Cuidados específicos do procedimento (resumo das daily_actions)
    const dailyActions = (protocolRow as any)?.protocol_definitions?.daily_actions ?? [];
    const careText = dailyActions
      .filter((a: any) => {
        const r = a.day_range ?? [];
        return daysSince >= r[0] && daysSince <= r[1];
      })
      .map((a: any) => `- ${a.action}`)
      .join("\n");

    // 3) Histórico (últimas 8 mensagens)
    const { data: history } = await supabase
      .from("care_ai_messages")
      .select("role, body")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(8);
    const historyText = (history ?? [])
      .reverse()
      .map((m: any) => `${m.role}: ${m.body}`)
      .join("\n");

    // 4) Salvar mensagem do usuário
    await supabase.from("care_ai_messages").insert({
      conversation_id,
      role: "user",
      body: message,
    });

    // 5) Chamar Claude
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const system = SYSTEM_PROMPT
      .replace("{procedure_name}", procedureName)
      .replace("{days_since}", String(daysSince))
      .replace("{tier_name}", tierName)
      .replace("{procedure_care_text}", careText || "(sem cuidados específicos hoje)")
      .replace("{conversation_history}", historyText || "(nova conversa)");

    const resp = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 600,
      system: [
        { type: "text", text: system, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: message }],
    });

    const reply = resp.content
      .filter((c) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    // 6) Detectar escalation (heurística simples; idealmente o modelo retorna JSON)
    const lower = reply.toLowerCase();
    const escalation =
      lower.includes("vou pedir") ||
      lower.includes("passar pra") ||
      lower.includes("clínic") ||
      lower.includes("urgente") ||
      lower.includes("sangr") ||
      lower.includes("febre");

    // 7) Salvar resposta da IA
    await supabase.from("care_ai_messages").insert({
      conversation_id,
      role: "assistant",
      body: reply,
      model_used: "claude-sonnet-4-5",
      tokens_input: resp.usage.input_tokens,
      tokens_output: resp.usage.output_tokens,
      cache_hit: (resp.usage as any).cache_read_input_tokens > 0,
    });

    // 8) Atualizar conversa + escalation se necessário
    const updates: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      total_messages: ((conv as any).total_messages ?? 0) + 2,
    };
    if (escalation && (conv as any).escalation_status === "ai_only") {
      updates.escalation_status = "requested";
      updates.escalated_at = new Date().toISOString();
      updates.escalation_reason = "Sinal clínico ou emocional detectado pela IA";
    }

    await supabase.from("care_ai_conversations").update(updates).eq("id", conversation_id);

    if (escalation) {
      // Empilhar ação pra profissional pegar
      await supabase.from("decision_actions_queue").insert({
        client_id: conv.client_id,
        action_type: "alert_team",
        channel: "humano",
        priority: 3,
        reason_code: "ai_escalation",
        payload: {
          title: "Atender chat (IA escalou)",
          description: `Mensagem da cliente: ${message.substring(0, 200)}`,
          cta_label: "Abrir chat",
          cta_kind: "message",
          conversation_id,
        },
      });
    }

    return new Response(
      JSON.stringify({ reply, escalation_required: escalation }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[ai-care-respond] error:", e);
    return new Response(
      JSON.stringify({ error: String((e as Error).message) }),
      { status: 500 }
    );
  }
});
