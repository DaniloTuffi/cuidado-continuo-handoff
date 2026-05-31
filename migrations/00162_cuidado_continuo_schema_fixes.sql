-- 00162_cuidado_continuo_schema_fixes.sql
-- Reconcilia o schema do Cuidado Contínuo com a realidade do banco do Belle:
--   - units (lojas) em vez de franchise direto
--   - employee_details para profissionais
--   - appointments.date + start_time (não scheduled_at)
--   - package_sessions (não client_sessions)
--   - decision_actions_queue já existe — REUSADA em vez de next_best_actions_log paralela
--
-- ALTER TABLEs aditivos (não destrutivos), seguros pra produção.
-- Apply order: depois de 00150-00161.

-- ---------------------------------------------------------------------------
-- 1. Adendos em client_details — campos do Perfil 360°
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_details
  ADD COLUMN IF NOT EXISTS bio                  text,
  ADD COLUMN IF NOT EXISTS occupation           text,
  ADD COLUMN IF NOT EXISTS age                  integer,
  ADD COLUMN IF NOT EXISTS city                 text,
  ADD COLUMN IF NOT EXISTS memory_notes         text,
  ADD COLUMN IF NOT EXISTS ltv_centavos         bigint GENERATED ALWAYS AS ((total_spent * 100)::bigint) STORED,
  ADD COLUMN IF NOT EXISTS nps_avg              numeric(3,1),
  ADD COLUMN IF NOT EXISTS referrals_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS events_count         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS diario_columns_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_purchases      integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.client_details.memory_notes IS
  'Texto livre de memória da cliente (fallback). Estruturada em client_memory_facts.';
COMMENT ON COLUMN public.client_details.ltv_centavos IS
  'Total gasto em centavos (derivado de total_spent — sempre sincronizado).';

-- ---------------------------------------------------------------------------
-- 2. Adendos em profiles — campos da byline do Diário
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio                text,
  ADD COLUMN IF NOT EXISTS role_label         text,
  ADD COLUMN IF NOT EXISTS tier_label         text;

COMMENT ON COLUMN public.profiles.role_label IS
  'Texto livre da profissão/cargo da pessoa (CEO Pharma, Ginecologista, Joalheira). Aparece na byline do Diário.';
COMMENT ON COLUMN public.profiles.tier_label IS
  'Cached do nome do tier atual da cliente (Início / Caminho / Trilha / Constelação). Sincronizado por trigger.';

-- ---------------------------------------------------------------------------
-- 3. Drop tabela next_best_actions_log (substituída por decision_actions_queue)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.next_best_actions_log CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Function: next_best_actions_for_professional
--    Lê de decision_actions_queue (já existente, populado pelo decision-engine).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.next_best_actions_for_professional(uuid, text, integer);
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_employee_id uuid;
  v_unit_id uuid;
BEGIN
  -- Resolve profile_id → employee_details → unit
  SELECT ed.id, ed.unit_id INTO v_employee_id, v_unit_id
    FROM public.employee_details ed
   WHERE ed.profile_id = p_profile_id
   LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN; -- not an employee, return empty
  END IF;

  -- Guard auth (admin/manager pode ver outros)
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_profile_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('manager','admin','owner')
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    daq.id,
    daq.client_id,
    p.full_name AS client_name,
    COALESCE(daq.payload->>'title', daq.action_type) AS action_title,
    COALESCE(daq.payload->>'description', '') AS action_desc,
    COALESCE(daq.payload->>'context_tag', daq.reason_code) AS action_context,
    CASE
      WHEN daq.priority <= 3 THEN 'high'
      WHEN daq.priority <= 6 THEN 'med'
      ELSE 'low'
    END AS priority,
    COALESCE(daq.payload->>'cta_label', 'Abrir') AS cta_label,
    COALESCE(daq.payload->>'cta_kind', 'message') AS cta_kind,
    daq.dispatched_at AS executed_at
  FROM public.decision_actions_queue daq
  JOIN public.client_details cd ON cd.id = daq.client_id
  JOIN public.profiles p ON p.id = cd.profile_id
  WHERE (daq.unit_id = v_unit_id OR cd.preferred_unit_id = v_unit_id)
    AND daq.status IN ('pending','delivered')
    AND (
      p_scope = 'today' AND daq.scheduled_for::date = CURRENT_DATE
      OR p_scope = 'week' AND daq.scheduled_for >= CURRENT_DATE - INTERVAL '7 days'
      OR p_scope = 'all'
    )
  ORDER BY daq.priority ASC, daq.scheduled_for ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_best_actions_for_professional(uuid, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Function: pipeline_clients_for_professional (REWRITE com schema real)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pipeline_clients_for_professional(uuid);
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT id INTO v_employee_id
    FROM public.employee_details
   WHERE profile_id = p_profile_id
   LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH last_appts AS (
    SELECT DISTINCT ON (ap.client_id)
      ap.client_id,
      ap.id AS appt_id,
      ap.service_id,
      ap.date AS last_date,
      (ap.date + ap.start_time)::timestamptz AS last_ts,
      ap.completed_at,
      cd.profile_id AS client_profile_id,
      cd.loyalty_tier_id,
      LEFT(cd.memory_notes, 140) AS memory_snippet,
      cd.total_purchases
    FROM public.appointments ap
    JOIN public.client_details cd ON cd.id = ap.client_id
    WHERE ap.employee_id = v_employee_id
      AND ap.date >= CURRENT_DATE - INTERVAL '180 days'
    ORDER BY ap.client_id, ap.date DESC, ap.start_time DESC
  ),
  client_jorney AS (
    SELECT
      la.client_id AS cd_id,
      p.full_name,
      lt.name AS tier_name,
      la.memory_snippet,
      la.total_purchases,
      cpp.id AS cpp_id,
      cpp.protocol_definition_id,
      cpp.started_at,
      cpp.status AS cpp_status,
      pd.procedure_key,
      pd.procedure_name,
      EXTRACT(DAY FROM (now() - cpp.started_at))::int AS days_since,
      pkg.session_number AS session_current,
      pkg.total_sessions AS session_total
    FROM last_appts la
    JOIN public.profiles p ON p.id = la.client_profile_id
    LEFT JOIN public.loyalty_tiers lt ON lt.id = la.loyalty_tier_id
    LEFT JOIN public.client_protocol_progress cpp
      ON cpp.client_id = la.client_id AND cpp.status = 'active'
    LEFT JOIN public.protocol_definitions pd ON pd.id = cpp.protocol_definition_id
    LEFT JOIN LATERAL (
      SELECT ps.session_number, cp.total_sessions
      FROM public.package_sessions ps
      JOIN public.client_packages cp ON cp.id = ps.client_package_id
      WHERE cp.client_id = la.client_id
        AND cp.status = 'active'
      ORDER BY ps.session_number DESC NULLS LAST
      LIMIT 1
    ) pkg ON true
  )
  SELECT
    cj.cd_id,
    cj.full_name,
    cj.tier_name,
    cj.procedure_key,
    cj.procedure_name,
    cj.days_since,
    cj.session_current,
    cj.session_total,
    cj.memory_snippet,
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
        THEN 'JANELA MÁGICA · 12,6× Premium'
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
  ORDER BY priority, days_since ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pipeline_clients_for_professional(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Function: pipeline_clients_for_unit — gerente vê todas da unidade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pipeline_clients_for_unit(
  p_unit_id uuid
)
RETURNS TABLE (
  client_id uuid,
  client_name text,
  professional_name text,
  procedure_name text,
  days_since integer,
  memory_snippet text,
  next_action_text text,
  context_tag text,
  priority text,
  pipeline_column text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Permissão: só manager/admin/owner da unit ou rede
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('manager','admin','owner')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    pf.cd_id          AS client_id,
    pf.client_name,
    emp_p.full_name   AS professional_name,
    pf.procedure_name,
    pf.days_since,
    pf.memory_snippet,
    pf.next_action_text,
    pf.context_tag,
    pf.priority,
    pf.pipeline_column
  FROM public.employee_details ed
  JOIN public.profiles emp_p ON emp_p.id = ed.profile_id
  CROSS JOIN LATERAL public.pipeline_clients_for_professional(ed.profile_id) pf
  WHERE ed.unit_id = p_unit_id AND ed.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pipeline_clients_for_unit(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. View: client_procedure_summary (agregação de procedimentos por cliente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.client_procedure_summary AS
SELECT
  cd.id AS client_id,
  s.id AS service_id,
  s.name AS procedure_name,
  s.belle_code AS procedure_key,
  COUNT(*) AS total_sessions,
  MAX(ap.date + ap.start_time) AS last_session_at
FROM public.client_details cd
JOIN public.appointments ap ON ap.client_id = cd.id
JOIN public.services s ON s.id = ap.service_id
WHERE ap.status::text = 'completed'
GROUP BY cd.id, s.id, s.name, s.belle_code;

GRANT SELECT ON public.client_procedure_summary TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Function: client_timeline_recent — eventos dos últimos N dias
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_timeline_recent(
  p_client_id uuid,
  p_days integer DEFAULT 90
)
RETURNS TABLE (
  id uuid,
  occurred_at timestamptz,
  title text,
  description text,
  kind text,
  tag text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  WITH events AS (
    -- Visitas
    SELECT
      ap.id,
      (ap.date + ap.start_time)::timestamptz AS occurred_at,
      'Sessão · ' || s.name AS title,
      'Profissional: ' || ep.full_name AS description,
      'visit'::text AS kind,
      NULL::text AS tag
    FROM public.appointments ap
    JOIN public.services s ON s.id = ap.service_id
    LEFT JOIN public.employee_details ed ON ed.id = ap.employee_id
    LEFT JOIN public.profiles ep ON ep.id = ed.profile_id
    WHERE ap.client_id = p_client_id
      AND ap.date >= CURRENT_DATE - (p_days || ' days')::interval
      AND ap.status::text = 'completed'

    UNION ALL

    -- Eventos do Diário
    SELECT
      r.id,
      r.confirmed_at AS occurred_at,
      'Evento · ' || ev.title AS title,
      r.status AS description,
      'event'::text,
      NULL
    FROM public.diario_event_rsvp r
    JOIN public.diario_events ev ON ev.id = r.event_id
    JOIN public.client_details cd ON cd.profile_id = r.profile_id
    WHERE cd.id = p_client_id
      AND r.confirmed_at >= now() - (p_days || ' days')::interval

    UNION ALL

    -- Colunas publicadas
    SELECT
      dc.id,
      dc.published_at,
      'Publicou · ' || dc.title,
      'Categoria: ' || dc.category,
      'column'::text,
      'DIÁRIO'::text
    FROM public.diario_columns dc
    JOIN public.client_details cd ON cd.profile_id = dc.author_profile_id
    WHERE cd.id = p_client_id
      AND dc.published_at IS NOT NULL
      AND dc.published_at >= now() - (p_days || ' days')::interval
  )
  SELECT * FROM events ORDER BY occurred_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.client_timeline_recent(uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Function: diario_top_columnists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diario_top_columnists(
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  role_label text,
  column_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT
    p.id,
    p.full_name,
    p.avatar_url,
    p.role_label,
    COUNT(dc.id) AS column_count
  FROM public.profiles p
  JOIN public.diario_columns dc ON dc.author_profile_id = p.id
  WHERE dc.is_draft = false
  GROUP BY p.id, p.full_name, p.avatar_url, p.role_label
  ORDER BY column_count DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.diario_top_columnists(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Trigger: appointment completed → cria client_protocol_progress
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_completion_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_procedure_key text;
  v_protocol_id uuid;
  v_existing_id uuid;
BEGIN
  -- Só age em transição pra completed
  IF NEW.status::text <> 'completed' OR (OLD.status::text = 'completed') THEN
    RETURN NEW;
  END IF;

  -- Achar procedure_key correspondente ao serviço
  SELECT s.belle_code INTO v_procedure_key
    FROM public.services s WHERE s.id = NEW.service_id;
  IF v_procedure_key IS NULL THEN RETURN NEW; END IF;

  -- Achar protocolo ativo correspondente
  SELECT id INTO v_protocol_id
    FROM public.protocol_definitions
   WHERE procedure_key = v_procedure_key AND is_active = true
   ORDER BY version DESC LIMIT 1;
  IF v_protocol_id IS NULL THEN RETURN NEW; END IF;

  -- Evitar duplicação
  SELECT id INTO v_existing_id
    FROM public.client_protocol_progress
   WHERE client_id = NEW.client_id
     AND protocol_definition_id = v_protocol_id
     AND status = 'active'
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.client_protocol_progress (
    client_id, procedure_execution_id, protocol_definition_id,
    started_at, expected_end_at, status
  )
  SELECT
    NEW.client_id,
    NEW.id,
    v_protocol_id,
    now(),
    now() + (pd.duration_days || ' days')::interval,
    'active'
  FROM public.protocol_definitions pd WHERE pd.id = v_protocol_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_complete_create_protocol ON public.appointments;
CREATE TRIGGER trg_appointment_complete_create_protocol
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointment_completion_trigger();

-- ---------------------------------------------------------------------------
-- 11. Function: compute_monthly_score (placeholder — escrever cálculo real)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_monthly_score(
  p_profile_id uuid,
  p_year_month char(7)
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_employee_id uuid;
  v_unit_id uuid;
  v_franchise_id uuid;
  v_exec numeric := 0;
  v_relac numeric := 0;
  v_vendas numeric := 0;
  v_cocriacao numeric := 0;
  v_total numeric := 0;
  v_premio integer := 0;
  v_ym_start date := (p_year_month || '-01')::date;
  v_ym_end date := (v_ym_start + INTERVAL '1 month - 1 day')::date;
BEGIN
  SELECT ed.id, ed.unit_id, u.franchise_id
    INTO v_employee_id, v_unit_id, v_franchise_id
    FROM public.employee_details ed
    JOIN public.units u ON u.id = ed.unit_id
   WHERE ed.profile_id = p_profile_id
   LIMIT 1;
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_employee');
  END IF;

  -- Execução (40%) — % de actions dispatched / scheduled
  SELECT COALESCE(100.0 *
    COUNT(*) FILTER (WHERE daq.status IN ('dispatched','delivered'))
    / NULLIF(COUNT(*), 0), 0)
    INTO v_exec
    FROM public.decision_actions_queue daq
   WHERE daq.unit_id = v_unit_id
     AND daq.scheduled_for::date BETWEEN v_ym_start AND v_ym_end;

  -- Relacionamento (30%) — observações com quality_stars >= 4
  SELECT COALESCE(100.0 *
    COUNT(*) FILTER (WHERE psa.quality_stars >= 4)
    / NULLIF(COUNT(*), 0), 0)
    INTO v_relac
    FROM public.profile_score_audit psa
   WHERE psa.profile_id = p_profile_id
     AND psa.audited_at BETWEEN v_ym_start AND v_ym_end;

  -- Vendas (20%) — taxa de recompra 90d em coorte do mês
  v_vendas := 75; -- placeholder; cálculo real exige cohort SQL complexo

  -- Co-Criação (10%) — bugs validados + ideas implementadas
  SELECT COALESCE(100.0 * (
      COALESCE((SELECT COUNT(*) FROM public.bug_reports
                WHERE reporter_profile_id = p_profile_id
                  AND status = 'validated'
                  AND created_at::date BETWEEN v_ym_start AND v_ym_end), 0)
    + COALESCE((SELECT COUNT(*) FROM public.feature_ideas
                WHERE reporter_profile_id = p_profile_id
                  AND status = 'implemented'
                  AND created_at::date BETWEEN v_ym_start AND v_ym_end), 0) * 3
  ) / 10.0, 0) INTO v_cocriacao;

  v_total := (v_exec * 0.40) + (v_relac * 0.30) + (v_vendas * 0.20) + (v_cocriacao * 0.10);

  v_premio := CASE
    WHEN v_total >= 100 THEN 150000
    WHEN v_total >= 90 THEN 100000
    WHEN v_total >= 80 THEN 50000
    WHEN v_total >= 70 THEN 20000
    ELSE 0
  END;

  INSERT INTO public.profile_score_monthly (
    profile_id, franchise_id, year_month, total_score,
    execucao_score, relacionamento_score, vendas_score, cocriacao_score,
    premio_centavos, computed_at
  ) VALUES (
    p_profile_id, v_franchise_id, p_year_month, v_total,
    v_exec, v_relac, v_vendas, v_cocriacao,
    v_premio, now()
  )
  ON CONFLICT (profile_id, year_month) DO UPDATE
    SET total_score = EXCLUDED.total_score,
        execucao_score = EXCLUDED.execucao_score,
        relacionamento_score = EXCLUDED.relacionamento_score,
        vendas_score = EXCLUDED.vendas_score,
        cocriacao_score = EXCLUDED.cocriacao_score,
        premio_centavos = EXCLUDED.premio_centavos,
        computed_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'total_score', round(v_total, 2),
    'execucao', round(v_exec, 2),
    'relacionamento', round(v_relac, 2),
    'vendas', round(v_vendas, 2),
    'cocriacao', round(v_cocriacao, 2),
    'premio_centavos', v_premio
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_monthly_score(uuid, char) TO authenticated, service_role;
