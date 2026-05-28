// packages/decision-engine/src/scores/magic-window-propensity.ts
//
// Score de propensão da Janela Mágica — adapta o return-propensity existente
// pra detectar clientes que JUSTO AGORA estão na janela 8-30 dias pós-procedimento
// e ainda não fizeram 2ª compra.
//
// Fundamento estatístico: doc 27 - Os 4 Ingredientes do Premium
// Cliente que retorna em 8-30 dias = 12,6x mais chance de virar Premium.
//
// Acoplado com:
//   - actions/dispatch-courtesy.ts (consome esse score pra decidir cortesia)
//   - rules/r7-magic-window.ts (aplica R7 quando score > threshold)

import type { ClientSignals, DecisionWeights } from '../types'

export interface MagicWindowScore {
  score: number              // 0-100
  in_window: boolean         // true se está entre D+8 e D+30
  days_since_procedure: number
  procedure_key: string | null
  procedure_qualifies: boolean  // procedure tem cortesia escalonada configurada?
  has_second_purchase: boolean  // já fez 2ª compra?
  reason_code: 'in_magic_window' | 'window_passed' | 'window_pending' | 'no_qualifying_procedure' | 'already_repurchased'
}

/**
 * Procedures que disparam Janela Mágica + sua cortesia escalonada.
 * D+15 → primeira cortesia
 * D+30 → cortesia upgrade
 * D+90 → cortesia premium
 *
 * Sincronize com risk_rules.magic_window_courtesy_procedure_key
 * em protocol_definitions (migration 00150).
 */
export const MAGIC_WINDOW_PROCEDURES: Record<string, {
  d15_courtesy: string
  d30_courtesy: string
  d90_courtesy: string
}> = {
  design_sobrancelha: {
    d15_courtesy: 'tintura_sobrancelha',
    d30_courtesy: 'brow_lamination',
    d90_courtesy: 'lash_lifting',
  },
  // Adicionar outros procedure_keys conforme cobertura expandir
}

export function computeMagicWindowScore(
  signals: ClientSignals,
  weights: DecisionWeights,
): MagicWindowScore {
  const daysSinceProcedure = signals.daysSinceLastProcedure ?? Infinity
  const procedureKey = signals.lastProcedureKey ?? null
  const hasSecondPurchase = signals.totalPurchases > 1

  // Procedure precisa estar configurado pra Janela Mágica
  const procedureQualifies = procedureKey !== null && procedureKey in MAGIC_WINDOW_PROCEDURES

  if (!procedureQualifies) {
    return {
      score: 0,
      in_window: false,
      days_since_procedure: daysSinceProcedure,
      procedure_key: procedureKey,
      procedure_qualifies: false,
      has_second_purchase: hasSecondPurchase,
      reason_code: 'no_qualifying_procedure',
    }
  }

  if (hasSecondPurchase) {
    return {
      score: 0,
      in_window: false,
      days_since_procedure: daysSinceProcedure,
      procedure_key: procedureKey,
      procedure_qualifies: true,
      has_second_purchase: true,
      reason_code: 'already_repurchased',
    }
  }

  const windowStart = weights['magic_window.start_day'] ?? 8
  const windowEnd = weights['magic_window.end_day'] ?? 30

  if (daysSinceProcedure < windowStart) {
    return {
      score: 0,
      in_window: false,
      days_since_procedure: daysSinceProcedure,
      procedure_key: procedureKey,
      procedure_qualifies: true,
      has_second_purchase: false,
      reason_code: 'window_pending',
    }
  }

  if (daysSinceProcedure > windowEnd) {
    return {
      score: 0,
      in_window: false,
      days_since_procedure: daysSinceProcedure,
      procedure_key: procedureKey,
      procedure_qualifies: true,
      has_second_purchase: false,
      reason_code: 'window_passed',
    }
  }

  // Dentro da janela. Score cai gradualmente conforme se aproxima do fim.
  // D+8: 100 · D+30: 50 (cliente que volta cedo é melhor — Ingrediente 3)
  const windowRange = windowEnd - windowStart
  const daysIntoWindow = daysSinceProcedure - windowStart
  const score = Math.max(50, 100 - (daysIntoWindow / windowRange) * 50)

  return {
    score: Math.round(score),
    in_window: true,
    days_since_procedure: daysSinceProcedure,
    procedure_key: procedureKey,
    procedure_qualifies: true,
    has_second_purchase: false,
    reason_code: 'in_magic_window',
  }
}

/**
 * Decide qual cortesia ofertar conforme dias passados.
 * D+8-15: primeira cortesia (Tintura)
 * D+16-30: ainda primeira (não escala antes da 2ª compra)
 *
 * Após 2ª compra, decision-engine reavalia. Quando cliente volta no D+30+
 * de NOVO procedimento (ex: Tintura → D+30), aí escala pra Brow Lamination.
 */
export function selectCourtesyForMagicWindow(
  procedureKey: string,
  daysSinceProcedure: number,
): string | null {
  const cfg = MAGIC_WINDOW_PROCEDURES[procedureKey]
  if (!cfg) return null

  if (daysSinceProcedure >= 8 && daysSinceProcedure <= 30) {
    return cfg.d15_courtesy
  }

  // Cliente que JÁ aceitou D+15 e voltou: oferta D+30 escalonada
  // (esta lógica fica no dispatcher conforme estado da cliente)
  return null
}
