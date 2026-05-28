// packages/decision-engine/src/rules/r7-magic-window.ts
//
// Regra R7 — Janela Mágica (8-30 dias pós-procedimento qualificado).
//
// Adiciona-se à cadeia de regras mestras existente (R1-R6 já implementadas).
// Princípio: cliente em Janela Mágica TEM PRIORIDADE sobre ações comuns,
// porque o multiplicador 12,6x de Premium não pode esperar.
//
// Hierarquia preservada: segurança clínica > momento > experiência > negócio.
// Janela Mágica entra como momento — só pula clínico (in_protocol, post_procedure_care
// crítico continua tendo precedência).
//
// Acoplamento:
//   - computeMagicWindowScore (scores/magic-window-propensity.ts)
//   - dispatchCourtesy (actions/dispatch-courtesy.ts)
//   - dispatcher.ts (chama R7 após R3 e antes de R6)

import type { ActionDecision, ActionType, RuleContext } from '../types'
import { computeMagicWindowScore } from '../scores/magic-window-propensity'

/**
 * R7 — Promove `dispatch_courtesy` quando cliente está em Janela Mágica
 *      e não tem ação clínica crítica pendente.
 *
 * Não substitui R1 (silêncio): se cliente recebeu muitos estímulos, R7 também
 * respeita o silêncio. Mas R7 pode chegar ANTES de R1 ser checada — então
 * a ordem na master-rules importa.
 *
 * Ordem sugerida em applyMasterRules:
 *   R1 → R2 → R3 → R7 (Janela Mágica) → R4 → R5 → R6
 */
export function enforceR7MagicWindow(
  context: RuleContext,
  currentAction: ActionType,
): { action: ActionType; reason?: string } {
  // Se ação atual é clínica crítica, R7 não interfere
  if (currentAction === 'show_care_recommendation' && context.state === 'post_procedure_care') {
    const adherenceLow = (context.signals.protocolAdherenceScore ?? 100) < 50
    if (adherenceLow) {
      // Adherence baixa = clínica vence
      return { action: currentAction, reason: 'R7: clinical care takes precedence over magic window' }
    }
  }

  // Computa score da Janela Mágica
  const magicScore = computeMagicWindowScore(context.signals, context.weights)

  if (!magicScore.in_window) {
    return { action: currentAction, reason: undefined }
  }

  // Cliente está na janela. Verifica se já recebeu cortesia pendente
  if (context.signals.pendingCourtesyAppointmentId) {
    // Já tem cortesia agendada → reforço suave, não nova oferta
    if (currentAction !== 'show_insight' && currentAction !== 'do_nothing') {
      return {
        action: 'show_insight',
        reason: 'R7: cortesia já agendada — reforçar com lembrete leve, não nova oferta',
      }
    }
    return { action: currentAction }
  }

  // Cliente está na janela mas ainda não tem cortesia agendada
  // → promover ação para dispatch_courtesy (a menos que R1 já mande silêncio)
  if (currentAction === 'do_nothing') {
    // R1 mandou silêncio. R7 NÃO sobrescreve — silêncio é decisão.
    return { action: currentAction, reason: 'R7: R1 silence respected even in magic window' }
  }

  return {
    action: 'dispatch_courtesy',
    reason: `R7: cliente em Janela Mágica D+${magicScore.days_since_procedure} do ${magicScore.procedure_key} — 12,6x chance Premium`,
  }
}

/**
 * Para uso no dispatcher quando precisar configurar o payload da ação.
 * Retorna apenas o procedure_key da cortesia, ou null se não aplicável.
 */
export { selectCourtesyForMagicWindow } from '../scores/magic-window-propensity'
