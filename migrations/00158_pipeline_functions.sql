-- 00158_pipeline_functions.sql
-- Functions Supabase consumidas pelas telas mobile do Modo Profissional:
--   - next_best_actions_for_professional → Briefing Diário (5 ações priorizadas)
--   - pipeline_clients_for_professional  → Pipeline kanban (todas as clientes em jornada)
--   - next_best_actions_log              → tabela onde a tela marca executed_at
--
-- Apply order: depois de 00150-00157.
-- Depende de: client_protocol_progress, appointments, client_details, profile_score_monthly.

-- ---------------------------------------------------------------------------
-- 1. next_best_actions_log — log de ações sugeridas/executadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.next_best_actions_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id         uuid REFERENCES public.client_details(id) ON DELETE SET NULL,
  action_type       text NOT NULL,
  action_title      text NOT NULL,
  action_desc       text NOT NULL,
  action_context    text,
  priority          text NOT NULL DEFAULT 'med' CHECK (priority IN ('high','med','low')),
  cta_label         text NOT NULL DEFAULT 'Abrir',
  cta_kind          text NOT NULL DEFAULT 'message' CHECK (cta_kind IN ('message','call','audio','script')),
  suggested_at      timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','executed','ignored','snoozed')),
  executed_at       timestamptz,
  payload           jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_nbal_prof_status ON public.next_best_actions_log (professional_id, status, suggested_at DESC);
CREATE INDEX IF NOT EXISTS idx_nbal_client ON public.next_best_actions_log (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.next_best_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY nbal_self_all ON public.next_best_actions_log FOR ALL TO authenticated
  USING (professional_id = auth.uid())
  WITH CHECK (professional_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. next_best_actions_for_professional — top N ações priorizadas pro briefing
--    Combina decision-engine output (clientes na Janela Mágica, in_protocol,
--    high_churn_risk, eventos pessoais) com log existente.
--    Retorna ações ordenadas por priority (high → med → low).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_best_actions_for_professional(
  p_profile_id uuid,
  p_scope text DEFAULT 'today',
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  client_name text,
  action_title text,
  action_desc text,
  action_context text,
  priority text,
  cta_label text,
  cta_kind text,
  executed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Guard
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_profile_id THEN
    -- Só admin/manager pode ver de outros
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    nbal.id,
    nbal.client_id,
    cd.full_name,
    nbal.action_title,
    nbal.action_desc,
    nbal.action_context,
    nbal.priority,
    nbal.cta_label,
    nbal.cta_kind,
    nbal.executed_at
  FROM public.next_best_actions_log nbal
  LEFT JOIN public.client_details cd ON cd.id = nbal.client_id
  WHERE nbal.professional_id = p_profile_id
    AND nbal.status IN ('suggested','executed')
    AND (
      p_scope = 'today' AND nbal.suggested_at::date = CURRENT_DATE
      OR p_scope = 'week' AND nbal.suggested_at::date >= CURRENT_DATE - INTERVAL '7 days'
      OR p_scope = 'all'
    )
  ORDER BY
    CASE nbal.priority WHEN 'high' THEN 1 WHEN 'med' THEN 2 ELSE 3 END,
    nbal.suggested_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_best_actions_for_professional(uuid, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. pipeline_clients_for_professional — todas as clientes em jornada
--    Categoriza em 6 colunas com base em client_protocol_progress + appointments.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_clients_for_professional(
  p_profile_id uuid
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  client_tier text,
  procedure_key text,
  procedure_name text,
  days_since integer,
  package_session_current integer,
  package_total_sessions integer,
  memory_snippet text,
  next_action_text text,
  context_tag text,
  priority text,
  pipeline_column text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_profile_id THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner')) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  WITH client_jorney AS (
    SELECT DISTINCT ON (cd.id)
      cd.id AS cd_id,
      cd.full_name,
      cd.loyalty_tier_id::text AS tier,
      cd.memory_notes,
      cd.total_purchases,
      cpp.id AS cpp_id,
      cpp.procedure_definition_id,
      cpp.started_at,
      cpp.status AS cpp_status,
      pd.procedure_key,
      pd.procedure_name,
      EXTRACT(DAY FROM (now() - cpp.started_at))::int AS days_since,
      pkg.session_current,
      pkg.session_total
    FROM public.client_details cd
    JOIN public.appointments ap ON ap.client_id = cd.id AND ap.professional_id = p_profile_id
    LEFT JOIN public.client_protocol_progress cpp
      ON cpp.client_id = cd.id AND cpp.status = 'active'
    LEFT JOIN public.protocol_definitions pd ON pd.id = cpp.protocol_definition_id
    LEFT JOIN LATERAL (
      SELECT cs.session_number AS session_current, cp.total_sessions AS session_total
      FROM public.client_packages cp
      JOIN public.client_sessions cs ON cs.client_package_id = cp.id
      WHERE cp.client_id = cd.id
      ORDER BY cs.created_at DESC
      LIMIT 1
    ) pkg ON true
    WHERE ap.scheduled_at >= now() - INTERVAL '180 days'
    ORDER BY cd.id, ap.scheduled_at DESC
  )
  SELECT
    cj.cd_id,
    cj.full_name,
    cj.tier,
    cj.procedure_key,
    cj.procedure_name,
    cj.days_since,
    cj.session_current,
    cj.session_total,
    LEFT(cj.memory_notes, 140) AS memory_snippet,
    CASE
      WHEN cj.days_since BETWEEN 8 AND 30 AND cj.total_purchases = 1
        THEN 'Confirmar cortesia D+15'
      WHEN cj.cpp_status = 'active' AND cj.days_since BETWEEN 1 AND 7
        THEN 'Áudio de boas-vindas'
      WHEN cj.session_current = cj.session_total - 1
        THEN 'Ponte 3 — propor renovação'
      WHEN cj.session_current = COALESCE(cj.session_total, 12) / 2
        THEN 'Ponte 2 — proposta natural'
      ELSE NULL
    END AS next_action_text,
    CASE
      WHEN cj.days_since BETWEEN 8 AND 30 AND cj.total_purchases = 1
        THEN 'JANELA MÁGICA · 12,6× chance Premium'
      WHEN cj.session_current = cj.session_total - 1
        THEN 'PONTE 3 · DECISÃO'
      ELSE NULL
    END AS context_tag,
    CASE
      WHEN cj.days_since BETWEEN 8 AND 30 AND cj.total_purchases = 1 THEN 'high'
      WHEN cj.session_current IN (
        COALESCE(cj.session_total - 1, 11),
        COALESCE(cj.session_total / 2, 6)
      ) THEN 'med'
      ELSE 'low'
    END AS priority,
    CASE
      WHEN cj.cpp_status = 'active' AND cj.days_since BETWEEN 1 AND 7 THEN 'primeira_visita'
      WHEN cj.days_since BETWEEN 8 AND 30 AND cj.total_purchases = 1 THEN 'janela_magica'
      WHEN cj.session_current BETWEEN 1 AND 5 THEN 'em_pacote'
      WHEN cj.session_current = COALESCE(cj.session_total, 12) / 2 THEN 'meio_pacote'
      WHEN cj.session_current = COALESCE(cj.session_total - 1, 11) THEN 'penultima_sessao'
      ELSE 'constelacao'
    END AS pipeline_column
  FROM client_jorney cj
  ORDER BY priority, cj.days_since ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pipeline_clients_for_professional(uuid) TO authenticated;

-- Nota: ajustar a query de `pkg.session_current` conforme a estrutura real de
-- client_packages / client_sessions no schema atual. Esta versão é template.
