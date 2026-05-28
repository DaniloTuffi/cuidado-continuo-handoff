// packages/decision-engine/src/actions/dispatch-courtesy.ts
//
// Action `dispatch_courtesy` — agenda automaticamente cortesia inteligente
// na Janela Mágica (D+8 a D+30 pós-procedimento qualificado).
//
// Esta action é selecionada pela R7 (rules/r7-magic-window.ts).
// O payload contém o procedure_key da cortesia + sugestão de slot.
//
// IMPORTANTE: esta action NÃO confirma agendamento — ela CRIA UMA OFERTA
// que aparece no app da cliente (banner Janela Mágica) e dispara push.
// A cliente confirma o horário.
//
// Para o profissional, a action também aparece como item priorizado no Briefing
// Diário (status: "Aguardando aceite da cliente").

import type { ActionDecision, ActionType, Channel, ClientSignals, RuleContext } from '../types'
import { selectCourtesyForMagicWindow, computeMagicWindowScore } from '../scores/magic-window-propensity'

export interface DispatchCourtesyPayload {
  courtesy_procedure_key: string  // ex: 'tintura_sobrancelha'
  courtesy_cost_centavos: number  // custo Estúdio (R$ 3,47 = 347)
  courtesy_perceived_value_centavos: number  // valor percebido (R$ 219,60 = 21960)
  suggested_window_start: string  // ISO date (próximo dia útil + N)
  suggested_window_end: string    // ISO date
  reason_for_client: string       // texto pra exibir pra cliente — não comercial
  reason_for_professional: string // contexto pra briefing
  related_to_procedure_key: string
  related_to_appointment_id: string | null
}

/**
 * Cardápio de cortesias com custo e valor percebido.
 * Sincroniza com tabela `services` no banco — usar `service.cost_cents` e `service.max_price_cents`.
 * Valores referência da tabela Maio/2026.
 */
const COURTESY_CATALOG: Record<string, {
  cost_centavos: number
  perceived_value_centavos: number
  emotional_reason: string
}> = {
  tintura_sobrancelha: {
    cost_centavos: 347,
    perceived_value_centavos: 21960,
    emotional_reason: 'A Lene reservou uma Tintura de cortesia pra sua próxima visita — é o complemento natural do Design que cobre fios brancos e dá efeito de sobrancelha cheia por 3-4 semanas.',
  },
  brow_lamination: {
    cost_centavos: 782,
    perceived_value_centavos: 41480,
    emotional_reason: 'Sua Brow Lamination está reservada — é o tratamento que dá brilho e fixa o formato por 8 semanas.',
  },
  lash_lifting: {
    cost_centavos: 501,
    perceived_value_centavos: 41358,
    emotional_reason: 'Lash Lifting de cortesia agendado — completa o olhar com curvatura natural por 8 semanas.',
  },
}

export function buildDispatchCourtesyAction(
  context: RuleContext,
): ActionDecision | null {
  const magicScore = computeMagicWindowScore(context.signals, context.weights)

  if (!magicScore.in_window || !magicScore.procedure_key) {
    return null
  }

  const courtesyKey = selectCourtesyForMagicWindow(
    magicScore.procedure_key,
    magicScore.days_since_procedure,
  )

  if (!courtesyKey || !COURTESY_CATALOG[courtesyKey]) {
    return null
  }

  const courtesy = COURTESY_CATALOG[courtesyKey]

  // Janela sugerida: 3 a 10 dias após hoje (cliente escolhe)
  const today = new Date()
  const windowStart = new Date(today)
  windowStart.setDate(today.getDate() + 3)
  const windowEnd = new Date(today)
  windowEnd.setDate(today.getDate() + 10)

  const payload: DispatchCourtesyPayload = {
    courtesy_procedure_key: courtesyKey,
    courtesy_cost_centavos: courtesy.cost_centavos,
    courtesy_perceived_value_centavos: courtesy.perceived_value_centavos,
    suggested_window_start: windowStart.toISOString().split('T')[0],
    suggested_window_end: windowEnd.toISOString().split('T')[0],
    reason_for_client: courtesy.emotional_reason,
    reason_for_professional: `Janela Mágica · D+${magicScore.days_since_procedure} do ${magicScore.procedure_key} · cliente sem 2ª compra · ROI da cortesia: ${Math.round(courtesy.perceived_value_centavos / courtesy.cost_centavos)}×`,
    related_to_procedure_key: magicScore.procedure_key,
    related_to_appointment_id: context.signals.lastAppointmentId ?? null,
  }

  return {
    actionType: 'dispatch_courtesy' as ActionType,
    channel: 'app_push' as Channel,
    priority: 9, // alta — Janela Mágica é o maior preditor de LTV
    reasonCode: 'magic_window_courtesy_dispatch',
    humanReadable: `Ofertar cortesia ${courtesyKey} para cliente em Janela Mágica`,
    payload: payload as unknown as Record<string, unknown>,
  }
}
