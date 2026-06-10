// apps/mobile/lib/cuidado-continuo-queries.ts
//
// Helpers compartilhados das queries do Cuidado Contínuo.
// Centraliza o conhecimento de schema (employee_details, appointments com date+start_time, etc)
// pra evitar divergência entre telas.

import { supabase } from "./supabase";

/**
 * Resolve profile_id → employee_details record.
 * Cliente vê o app sem employee, é null.
 */
export async function getMyEmployee(profileId: string) {
  const { data } = await supabase
    .from("employee_details")
    .select("id, unit_id, position, bio, photo_url, units(name)")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data as null | {
    id: string;
    unit_id: string;
    position: string | null;
    bio: string | null;
    photo_url: string | null;
    units: { name: string } | null;
  };
}

/**
 * Score mensal corrente do profissional + delta vs mês anterior.
 */
export async function getMyScoreSummary(profileId: string) {
  const ym = currentYearMonth();
  const ymPrev = ymOffset(-1);

  const [curr, prev] = await Promise.all([
    supabase
      .from("profile_score_monthly")
      .select(
        "total_score, premio_centavos, execucao_score, relacionamento_score, vendas_score, cocriacao_score, ranking_unidade"
      )
      .eq("profile_id", profileId)
      .eq("year_month", ym)
      .maybeSingle(),
    supabase
      .from("profile_score_monthly")
      .select("total_score")
      .eq("profile_id", profileId)
      .eq("year_month", ymPrev)
      .maybeSingle(),
  ]);

  if (!curr.data) return null;
  return {
    total_score: Number(curr.data.total_score) || 0,
    trend_vs_last_month:
      curr.data.total_score && prev.data?.total_score
        ? Math.round(Number(curr.data.total_score) - Number(prev.data.total_score))
        : 0,
    premio_centavos: curr.data.premio_centavos || 0,
    execucao_score: Number(curr.data.execucao_score) || 0,
    relacionamento_score: Number(curr.data.relacionamento_score) || 0,
    vendas_score: Number(curr.data.vendas_score) || 0,
    cocriacao_score: Number(curr.data.cocriacao_score) || 0,
    ranking_unidade: curr.data.ranking_unidade,
  };
}

/**
 * Agendamentos de hoje da profissional, com memória da cliente.
 */
export async function getTodayAppointments(employeeId: string) {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("appointments")
    .select(`
      id, date, start_time, end_time, status,
      client_id,
      client_details!client_id (
        id, memory_notes,
        profiles!profile_id (full_name, avatar_url)
      ),
      services!service_id (name, belle_code)
    `)
    .eq("employee_id", employeeId)
    .eq("date", today)
    .order("start_time");
  return (data ?? []) as any[];
}

/**
 * Próxima ação priorizada do profissional (lê de decision_actions_queue).
 */
export async function getNextActions(profileId: string, scope: "today" | "week" | "all" = "today", limit = 5) {
  const { data, error } = await supabase.rpc("next_best_actions_for_professional", {
    p_profile_id: profileId,
    p_scope: scope,
    p_limit: limit,
  });
  if (error) console.warn("[cc] next actions error:", error.message);
  return (data ?? []) as Array<{
    id: string;
    client_id: string;
    client_name: string;
    action_title: string;
    action_desc: string;
    action_context: string | null;
    priority: "high" | "med" | "low";
    cta_label: string;
    cta_kind: "message" | "call" | "audio" | "script";
    executed_at: string | null;
  }>;
}

/**
 * Pipeline 6 colunas do profissional.
 */
export async function getPipeline(profileId: string) {
  const { data, error } = await supabase.rpc("pipeline_clients_for_professional", {
    p_profile_id: profileId,
  });
  if (error) console.warn("[cc] pipeline error:", error.message);
  return (data ?? []) as Array<{
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
    pipeline_column: string;
  }>;
}

/**
 * Comando do Dia · 6 RPCs (migration 00169).
 * Cada uma alimenta uma seção do briefing.
 */

export async function getFollowupsYesterday(profileId: string, limit = 10) {
  const { data, error } = await supabase.rpc("employee_followups_yesterday", {
    p_profile_id: profileId,
    p_limit: limit,
  });
  if (error) console.warn("[cc] followups yesterday error:", error.message);
  return (data ?? []) as Array<{
    client_id: string;
    client_name: string;
    avatar_url: string | null;
    service_name: string;
    appointment_id: string;
    hours_since: number;
    memory_snippet: string | null;
    suggested_opener: string;
  }>;
}

export async function getGoldenWindowToday(profileId: string, limit = 8) {
  const { data, error } = await supabase.rpc("employee_golden_window_today", {
    p_profile_id: profileId,
    p_limit: limit,
  });
  if (error) console.warn("[cc] golden window error:", error.message);
  return (data ?? []) as Array<{
    client_id: string;
    client_name: string;
    avatar_url: string | null;
    procedure_name: string;
    procedure_key: string;
    days_since: number;
    ltv_centavos: number;
    memory_snippet: string | null;
    suggested_opener: string;
    has_upcoming_appt: boolean;
  }>;
}

export async function getDangerZone(profileId: string, limit = 10) {
  const { data, error } = await supabase.rpc("employee_danger_zone", {
    p_profile_id: profileId,
    p_limit: limit,
  });
  if (error) console.warn("[cc] danger zone error:", error.message);
  return (data ?? []) as Array<{
    client_id: string;
    client_name: string;
    avatar_url: string | null;
    procedure_name: string;
    days_since: number;
    ltv_centavos: number;
    last_visit_date: string | null;
    memory_snippet: string | null;
    urgency_text: string;
  }>;
}

export async function getGiftCandidates(profileId: string, limit = 5) {
  const { data, error } = await supabase.rpc("employee_gift_candidates", {
    p_profile_id: profileId,
    p_limit: limit,
  });
  if (error) console.warn("[cc] gift candidates error:", error.message);
  return (data ?? []) as Array<{
    client_id: string;
    client_name: string;
    avatar_url: string | null;
    ltv_centavos: number;
    tier_name: string | null;
    reason: string;
    days_to_event: number | null;
    memory_snippet: string | null;
    suggested_gift: string;
  }>;
}

export async function getPromoTargets(profileId: string, limit = 10) {
  const { data, error } = await supabase.rpc("employee_promo_targets", {
    p_profile_id: profileId,
    p_limit: limit,
  });
  if (error) console.warn("[cc] promo targets error:", error.message);
  return (data ?? []) as Array<{
    campaign_id: string;
    campaign_title: string;
    campaign_body: string;
    campaign_kind: "promo_day" | "promo_week" | "pre_launch" | "flash_sale";
    ends_at: string;
    client_id: string;
    client_name: string;
    avatar_url: string | null;
    ltv_centavos: number;
    affinity_reason: string;
  }>;
}

export async function getTodayStrategy(profileId: string) {
  const { data, error } = await supabase.rpc("employee_today_strategy", {
    p_profile_id: profileId,
  });
  if (error) console.warn("[cc] today strategy error:", error.message);
  return (data ?? []) as Array<{
    appointment_id: string;
    start_time: string;
    client_id: string;
    client_name: string;
    avatar_url: string | null;
    service_name: string;
    visit_count: number;
    ltv_centavos: number;
    tier_name: string | null;
    active_protocol: string | null;
    active_protocol_day: number | null;
    memory_facts: Array<{ fact: string; category: string; priority: number }> | null;
    strategy_hint: string;
    upsell_opportunity: string | null;
  }>;
}

/**
 * Marca ação como executada na fila do decision-engine.
 */
export async function markActionExecuted(actionId: string) {
  return supabase
    .from("decision_actions_queue")
    .update({ status: "delivered", dispatched_at: new Date().toISOString() })
    .eq("id", actionId);
}

/**
 * Reportar bug.
 */
export async function reportBug(args: {
  profileId: string;
  unitId: string | null;
  title: string;
  description: string;
  steps?: string;
  frequency: string;
  screen?: string;
}) {
  return supabase.from("bug_reports").insert({
    reporter_profile_id: args.profileId,
    franchise_id: (await getUnitFranchise(args.unitId)) ?? null,
    title: args.title,
    description: args.description,
    steps_to_reproduce: args.steps,
    frequency: args.frequency,
    screen_or_path: args.screen,
    status: "new",
  });
}

/**
 * Enviar ideia.
 */
export async function submitIdea(args: {
  profileId: string;
  unitId: string | null;
  title: string;
  problem: string;
  howItWorks?: string;
  whoBenefits?: string;
  willingToTest: boolean;
}) {
  return supabase.from("feature_ideas").insert({
    reporter_profile_id: args.profileId,
    franchise_id: (await getUnitFranchise(args.unitId)) ?? null,
    title: args.title,
    problem_it_solves: args.problem,
    how_it_works: args.howItWorks,
    who_benefits: args.whoBenefits,
    willing_to_test: args.willingToTest,
    status: "new",
  });
}

/**
 * Resolve franchise_id a partir do unit_id (atalho).
 */
async function getUnitFranchise(unitId: string | null): Promise<string | null> {
  if (!unitId) return null;
  const { data } = await supabase.from("units").select("franchise_id").eq("id", unitId).maybeSingle();
  return data?.franchise_id ?? null;
}

// --- Helpers de data ---
export function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ymOffset(monthsBack: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function brl(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  });
}
