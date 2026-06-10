-- 00169_comando_do_dia.sql
-- ============================================================================
-- Comando do Dia · funções RPC pras 7 seções do briefing profissional.
-- ============================================================================
--
-- O briefing.tsx vai chamar essas funções pra montar a tela inicial do
-- profissional ao logar. Cada função entrega uma lista pequena (5-10 clientes)
-- com contexto suficiente pra ação imediata: foto, memória, frase-âncora,
-- script ou CTA específico.
--
-- Todas STABLE SECURITY DEFINER + auth.uid() guard via employee_details lookup.
-- Schema usado: appointments(date,start_time), client_details(profile_id),
-- client_protocol_progress(started_at), protocol_definitions(procedure_name),
-- client_memory_facts(fact_text), decision_actions_queue.

SET search_path = public, pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. employee_followups_yesterday — clientes atendidas ontem
-- ---------------------------------------------------------------------------
-- "Você atendeu ontem · agora envia mensagem checando como está sentindo."
-- Retorna até 10 clientes, com snippet do que foi feito + memória relevante.
DROP FUNCTION IF EXISTS public.employee_followups_yesterday(uuid, integer);
CREATE OR REPLACE FUNCTION public.employee_followups_yesterday(
  p_profile_id uuid,
  p_limit      integer DEFAULT 10
)
RETURNS TABLE (
  client_id         uuid,
  client_name       text,
  avatar_url        text,
  service_name      text,
  appointment_id    uuid,
  hours_since       integer,
  memory_snippet    text,
  suggested_opener  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_emp uuid;
BEGIN
  SELECT id INTO v_emp FROM public.employee_details WHERE profile_id = p_profile_id LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    cd.id,
    p.full_name,
    p.avatar_url,
    s.name,
    ap.id,
    EXTRACT(EPOCH FROM (now() - (ap.date + ap.start_time)::timestamptz))::int / 3600 AS hours_since,
    COALESCE(
      (SELECT cmf.fact_text FROM public.client_memory_facts cmf
        WHERE cmf.client_id = cd.id AND cmf.is_active = true
        ORDER BY cmf.priority DESC, cmf.updated_at DESC LIMIT 1),
      cd.memory_notes
    ),
    CASE
      WHEN s.name ILIKE '%sobrancelha%' OR s.name ILIKE '%design%'
        THEN format('Oi, %s! Como tá o desenho? Já desinflamou tudo?', split_part(p.full_name, ' ', 1))
      WHEN s.name ILIKE '%botox%' OR s.name ILIKE '%toxina%'
        THEN format('%s, como tá sentindo a região? Comer e dormir tranquila?', split_part(p.full_name, ' ', 1))
      WHEN s.name ILIKE '%limpeza%' OR s.name ILIKE '%hidrata%'
        THEN format('%s, a pele já desceu da reação? Tá sentindo macia?', split_part(p.full_name, ' ', 1))
      ELSE format('Oi, %s! Como você tá se sentindo depois de ontem?', split_part(p.full_name, ' ', 1))
    END AS suggested_opener
  FROM public.appointments ap
  JOIN public.client_details cd ON cd.id = ap.client_id
  JOIN public.profiles p ON p.id = cd.profile_id
  JOIN public.services s ON s.id = ap.service_id
  WHERE ap.employee_id = v_emp
    AND ap.date = CURRENT_DATE - INTERVAL '1 day'
    AND ap.status = 'completed'
  ORDER BY ap.start_time DESC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.employee_followups_yesterday(uuid, integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. employee_golden_window_today — clientes que ENTRAM HOJE no D+8
-- ---------------------------------------------------------------------------
-- "Hoje é o dia da Janela de Ouro dela — ligação/áudio ainda mais valioso."
-- Lê de client_protocol_progress: started_at = CURRENT_DATE - 8 days.
-- Retorna script pronto + métrica esperada (12,6× Premium).
DROP FUNCTION IF EXISTS public.employee_golden_window_today(uuid, integer);
CREATE OR REPLACE FUNCTION public.employee_golden_window_today(
  p_profile_id uuid,
  p_limit      integer DEFAULT 8
)
RETURNS TABLE (
  client_id         uuid,
  client_name       text,
  avatar_url        text,
  procedure_name    text,
  procedure_key     text,
  days_since        integer,
  ltv_centavos      bigint,
  memory_snippet    text,
  suggested_opener  text,
  has_upcoming_appt boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_emp uuid;
BEGIN
  SELECT id INTO v_emp FROM public.employee_details WHERE profile_id = p_profile_id LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    cd.id,
    p.full_name,
    p.avatar_url,
    pd.procedure_name,
    pd.procedure_key,
    8 AS days_since,
    cd.ltv_centavos,
    COALESCE(
      (SELECT cmf.fact_text FROM public.client_memory_facts cmf
        WHERE cmf.client_id = cd.id AND cmf.is_active = true
        ORDER BY cmf.priority DESC LIMIT 1),
      cd.memory_notes
    ),
    format(
      '%s, hoje fez 8 dias desde a %s. Quero ouvir você no áudio antes de seguir — como tá sentindo?',
      split_part(p.full_name, ' ', 1),
      lower(pd.procedure_name)
    ),
    EXISTS(
      SELECT 1 FROM public.appointments ap2
      WHERE ap2.client_id = cd.id
        AND ap2.date >= CURRENT_DATE
        AND ap2.status IN ('scheduled','confirmed')
    )
  FROM public.client_protocol_progress cpp
  JOIN public.protocol_definitions pd ON pd.id = cpp.protocol_definition_id
  JOIN public.client_details cd ON cd.id = cpp.client_id
  JOIN public.profiles p ON p.id = cd.profile_id
  -- A cliente entra no D+8 hoje. Filtra pra clientes da unidade dessa profissional.
  JOIN public.employee_details ed ON ed.id = v_emp
  WHERE cpp.status = 'active'
    AND cpp.started_at::date = CURRENT_DATE - INTERVAL '8 days'
    AND (cd.preferred_unit_id = ed.unit_id OR EXISTS (
      SELECT 1 FROM public.appointments ap3
      WHERE ap3.client_id = cd.id AND ap3.employee_id = v_emp
        AND ap3.date >= CURRENT_DATE - INTERVAL '60 days'
    ))
  ORDER BY cd.ltv_centavos DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.employee_golden_window_today(uuid, integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. employee_danger_zone — D+25 a D+30, sem retorno marcado
-- ---------------------------------------------------------------------------
-- "Última chance antes de virar não-recompra. Ligar HOJE."
DROP FUNCTION IF EXISTS public.employee_danger_zone(uuid, integer);
CREATE OR REPLACE FUNCTION public.employee_danger_zone(
  p_profile_id uuid,
  p_limit      integer DEFAULT 10
)
RETURNS TABLE (
  client_id         uuid,
  client_name       text,
  avatar_url        text,
  procedure_name    text,
  days_since        integer,
  ltv_centavos      bigint,
  last_visit_date   date,
  memory_snippet    text,
  urgency_text      text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_emp uuid;
  v_unit uuid;
BEGIN
  SELECT id, unit_id INTO v_emp, v_unit FROM public.employee_details WHERE profile_id = p_profile_id LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    cd.id,
    p.full_name,
    p.avatar_url,
    pd.procedure_name,
    (CURRENT_DATE - cpp.started_at::date)::int AS days_since,
    cd.ltv_centavos,
    (SELECT MAX(ap.date) FROM public.appointments ap
      WHERE ap.client_id = cd.id AND ap.status = 'completed') AS last_visit_date,
    COALESCE(
      (SELECT cmf.fact_text FROM public.client_memory_facts cmf
        WHERE cmf.client_id = cd.id AND cmf.is_active = true
        ORDER BY cmf.priority DESC LIMIT 1),
      cd.memory_notes
    ),
    CASE
      WHEN (CURRENT_DATE - cpp.started_at::date)::int >= 28
        THEN 'CRÍTICO · sai da janela em ' || (30 - (CURRENT_DATE - cpp.started_at::date)::int) || ' dias'
      ELSE 'ATENÇÃO · D+' || (CURRENT_DATE - cpp.started_at::date)::int || ' sem agendamento'
    END
  FROM public.client_protocol_progress cpp
  JOIN public.protocol_definitions pd ON pd.id = cpp.protocol_definition_id
  JOIN public.client_details cd ON cd.id = cpp.client_id
  JOIN public.profiles p ON p.id = cd.profile_id
  WHERE cpp.status = 'active'
    AND (CURRENT_DATE - cpp.started_at::date) BETWEEN 25 AND 30
    AND cd.preferred_unit_id = v_unit
    -- Sem appointment futuro
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments ap
      WHERE ap.client_id = cd.id
        AND ap.date >= CURRENT_DATE
        AND ap.status IN ('scheduled','confirmed')
    )
  ORDER BY (CURRENT_DATE - cpp.started_at::date) DESC, cd.ltv_centavos DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.employee_danger_zone(uuid, integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. employee_gift_candidates — pra presentear (cortesia / mimo)
-- ---------------------------------------------------------------------------
-- Critério: LTV ≥ p75 da unidade · sem cortesia nos últimos 60 dias ·
-- ocasião próxima (aniversário em até 7 dias, ou D+15 do último procedimento)
DROP FUNCTION IF EXISTS public.employee_gift_candidates(uuid, integer);
CREATE OR REPLACE FUNCTION public.employee_gift_candidates(
  p_profile_id uuid,
  p_limit      integer DEFAULT 5
)
RETURNS TABLE (
  client_id         uuid,
  client_name       text,
  avatar_url        text,
  ltv_centavos      bigint,
  tier_name         text,
  reason            text,
  days_to_event     integer,
  memory_snippet    text,
  suggested_gift    text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_emp uuid;
  v_unit uuid;
  v_ltv_threshold bigint;
BEGIN
  SELECT id, unit_id INTO v_emp, v_unit FROM public.employee_details WHERE profile_id = p_profile_id LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;

  -- P75 LTV da unidade (filtro de "vale a pena mimar")
  SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY ltv_centavos)
    INTO v_ltv_threshold
    FROM public.client_details
    WHERE preferred_unit_id = v_unit AND ltv_centavos > 0;

  RETURN QUERY
  WITH base AS (
    SELECT
      cd.id, p.full_name, p.avatar_url, cd.ltv_centavos, p.birth_date,
      lt.name AS tier_name,
      cd.memory_notes
    FROM public.client_details cd
    JOIN public.profiles p ON p.id = cd.profile_id
    LEFT JOIN public.loyalty_tiers lt ON lt.id = cd.loyalty_tier_id
    WHERE cd.preferred_unit_id = v_unit
      AND cd.ltv_centavos >= COALESCE(v_ltv_threshold, 0)
      AND NOT EXISTS (
        SELECT 1 FROM public.decision_actions_queue daq
        WHERE daq.client_id = cd.id
          AND daq.action_type = 'dispatch_courtesy'
          AND daq.scheduled_for >= now() - INTERVAL '60 days'
      )
  )
  SELECT
    b.id, b.full_name, b.avatar_url, b.ltv_centavos, b.tier_name,
    CASE
      WHEN b.birth_date IS NOT NULL
       AND (DATE_TRUNC('year', AGE(b.birth_date + INTERVAL '1 year')) + (b.birth_date - DATE_TRUNC('year', b.birth_date))) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        THEN 'aniversário próximo'
      ELSE 'cliente premium · sem mimo há 60+ dias'
    END,
    NULL::int, -- TODO: calcular dias até evento
    COALESCE(
      (SELECT cmf.fact_text FROM public.client_memory_facts cmf
        WHERE cmf.client_id = b.id AND cmf.is_active = true
        ORDER BY cmf.priority DESC LIMIT 1),
      b.memory_notes
    ),
    CASE
      WHEN b.tier_name ILIKE '%constela%' THEN 'Massagem de 30 min + chá especial'
      WHEN b.tier_name ILIKE '%premium%' THEN 'Brinde da curadoria do mês'
      ELSE 'Café especial + mensagem manuscrita'
    END
  FROM base b
  ORDER BY b.ltv_centavos DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.employee_gift_candidates(uuid, integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. Tabela daily_promo_campaigns + função pra targets de divulgação
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_promo_campaigns (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         uuid        REFERENCES public.units(id) ON DELETE CASCADE,  -- null = rede toda
  franchise_id    uuid        REFERENCES public.franchises(id),

  title           text        NOT NULL,                  -- "Pré-lançamento Skin Reset 3.0"
  body_short      text        NOT NULL,                  -- pra preview
  body_full       text,                                  -- mensagem completa pronta pra enviar
  kind            text        NOT NULL CHECK (kind IN ('promo_day','promo_week','pre_launch','flash_sale')),

  service_id      uuid        REFERENCES public.services(id),  -- procedimento alvo (opcional)
  package_id      uuid        REFERENCES public.packages(id),  -- pacote alvo (opcional)

  starts_at       timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz NOT NULL,

  target_filter   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- ex: { "min_ltv_centavos": 200000, "tiers": ["Premium","Constelação"],
  --       "interested_in_keys": ["sobrancelha","botox"], "last_visit_days_max": 90 }

  is_active       boolean     NOT NULL DEFAULT true,
  created_by      uuid        REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpc_active ON public.daily_promo_campaigns (is_active, unit_id) WHERE is_active = true;

ALTER TABLE public.daily_promo_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY dpc_read ON public.daily_promo_campaigns FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY dpc_admin ON public.daily_promo_campaigns FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

-- Função: lista 1 campanha ativa + clientes que fazem match
DROP FUNCTION IF EXISTS public.employee_promo_targets(uuid, integer);
CREATE OR REPLACE FUNCTION public.employee_promo_targets(
  p_profile_id uuid,
  p_limit      integer DEFAULT 10
)
RETURNS TABLE (
  campaign_id      uuid,
  campaign_title   text,
  campaign_body    text,
  campaign_kind    text,
  ends_at          timestamptz,
  client_id        uuid,
  client_name      text,
  avatar_url       text,
  ltv_centavos     bigint,
  affinity_reason  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_emp uuid;
  v_unit uuid;
  v_campaign record;
BEGIN
  SELECT id, unit_id INTO v_emp, v_unit FROM public.employee_details WHERE profile_id = p_profile_id LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;

  -- Pega 1 campanha ativa (prioriza unidade > rede)
  SELECT * INTO v_campaign FROM public.daily_promo_campaigns
   WHERE is_active = true AND now() BETWEEN starts_at AND ends_at
     AND (unit_id = v_unit OR unit_id IS NULL)
   ORDER BY (unit_id = v_unit) DESC, kind = 'flash_sale' DESC, ends_at ASC
   LIMIT 1;

  IF v_campaign.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    v_campaign.id,
    v_campaign.title,
    COALESCE(v_campaign.body_full, v_campaign.body_short),
    v_campaign.kind,
    v_campaign.ends_at,
    cd.id, p.full_name, p.avatar_url, cd.ltv_centavos,
    CASE
      WHEN v_campaign.kind = 'pre_launch' THEN 'cliente Premium · acesso antecipado faz sentido'
      WHEN cd.ltv_centavos >= 500000 THEN 'high spender · provável compra'
      ELSE 'cliente ativa · vale informar'
    END
  FROM public.client_details cd
  JOIN public.profiles p ON p.id = cd.profile_id
  WHERE cd.preferred_unit_id = v_unit
    AND cd.ltv_centavos >= COALESCE((v_campaign.target_filter->>'min_ltv_centavos')::bigint, 0)
    AND (
      v_campaign.target_filter->'last_visit_days_max' IS NULL
      OR EXISTS (
        SELECT 1 FROM public.appointments ap
        WHERE ap.client_id = cd.id
          AND ap.status = 'completed'
          AND ap.date >= CURRENT_DATE - ((v_campaign.target_filter->>'last_visit_days_max')::int) * INTERVAL '1 day'
      )
    )
  ORDER BY cd.ltv_centavos DESC NULLS LAST
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.employee_promo_targets(uuid, integer) TO authenticated;


-- ---------------------------------------------------------------------------
-- 6. employee_today_strategy — agenda do dia COM estratégia por cliente
-- ---------------------------------------------------------------------------
-- Pra cada agendado de hoje, traz: foto, memória ativa, fase do protocolo,
-- valor histórico, oportunidade de upsell, dica de abordagem.
DROP FUNCTION IF EXISTS public.employee_today_strategy(uuid);
CREATE OR REPLACE FUNCTION public.employee_today_strategy(
  p_profile_id uuid
)
RETURNS TABLE (
  appointment_id      uuid,
  start_time          text,
  client_id           uuid,
  client_name         text,
  avatar_url          text,
  service_name        text,
  visit_count         integer,
  ltv_centavos        bigint,
  tier_name           text,
  active_protocol     text,
  active_protocol_day integer,
  memory_facts        jsonb,
  strategy_hint       text,
  upsell_opportunity  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_emp uuid;
BEGIN
  SELECT id INTO v_emp FROM public.employee_details WHERE profile_id = p_profile_id LIMIT 1;
  IF v_emp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH today_appts AS (
    SELECT ap.* FROM public.appointments ap
    WHERE ap.employee_id = v_emp AND ap.date = CURRENT_DATE
      AND ap.status IN ('scheduled','confirmed','in_progress')
    ORDER BY ap.start_time
  )
  SELECT
    t.id,
    to_char(t.start_time, 'HH24:MI'),
    cd.id, p.full_name, p.avatar_url, s.name,
    cd.total_visits,
    cd.ltv_centavos,
    lt.name,
    pd.procedure_name,
    (CURRENT_DATE - cpp.started_at::date)::int,

    -- Memory facts: top 3 priority, agregados em jsonb
    (
      SELECT jsonb_agg(jsonb_build_object(
        'fact', cmf.fact_text,
        'category', cmf.category,
        'priority', cmf.priority
      ) ORDER BY cmf.priority DESC)
      FROM (
        SELECT * FROM public.client_memory_facts cmf2
        WHERE cmf2.client_id = cd.id AND cmf2.is_active = true
        ORDER BY cmf2.priority DESC LIMIT 3
      ) cmf
    ),

    -- Strategy hint baseada no histórico
    CASE
      WHEN cd.total_visits = 1
        THEN 'PRIMEIRA VISITA · foco em vínculo, NUNCA empurra venda na 1ª'
      WHEN cd.total_visits BETWEEN 2 AND 4
        THEN 'CICLO INICIAL · checa adesão ao protocolo, pergunta sentimento'
      WHEN cpp.id IS NOT NULL AND (CURRENT_DATE - cpp.started_at::date)::int BETWEEN 8 AND 30
        THEN 'JANELA MÁGICA · 12,6× chance de Premium se sair daqui com retorno marcado'
      WHEN cd.ltv_centavos >= 500000
        THEN 'HIGH SPENDER · trate como Madrinha · conversa pessoal antes de qualquer coisa'
      ELSE 'CLIENTE REGULAR · execução excelente · pergunta como tá a rotina'
    END,

    -- Upsell opportunity (só sugere, profissional decide)
    CASE
      WHEN cd.total_visits >= 3 AND NOT EXISTS (
        SELECT 1 FROM public.client_packages cp WHERE cp.client_id = cd.id AND cp.status = 'active'
      ) THEN 'sem pacote ativo · sugerir Pacote Cuidado Contínuo'
      WHEN cpp.id IS NOT NULL AND (CURRENT_DATE - cpp.started_at::date)::int > 30 THEN 'fora da janela · NÃO pressionar venda'
      ELSE NULL
    END

  FROM today_appts t
  JOIN public.client_details cd ON cd.id = t.client_id
  JOIN public.profiles p ON p.id = cd.profile_id
  JOIN public.services s ON s.id = t.service_id
  LEFT JOIN public.loyalty_tiers lt ON lt.id = cd.loyalty_tier_id
  LEFT JOIN public.client_protocol_progress cpp ON cpp.client_id = cd.id AND cpp.status = 'active'
  LEFT JOIN public.protocol_definitions pd ON pd.id = cpp.protocol_definition_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.employee_today_strategy(uuid) TO authenticated;
