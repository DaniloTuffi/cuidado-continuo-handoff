-- 00152_score_de_cuidado_schema.sql
-- Schema do Score de Cuidado — sistema de KPIs, prêmios e co-criação da profissional.
--
-- Doc referência: 44 - Score de Cuidado - KPIs Prêmios e Co-Criação (Obsidian)
-- 4 categorias: Execução (40%) · Relacionamento (30%) · Vendas (20%) · Co-Criação (10%)
--
-- Aplicar APÓS 00151 (instruções dos serviços).
-- RLS em arquivo separado (00153).
-- Functions em arquivo separado (a criar pelo dev).

-- ---------------------------------------------------------------------------
-- 1. profile_score_monthly — score mensal por profissional
-- 1 row por (profile_id, year_month). Recalcula via function compute_monthly_score.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_score_monthly (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  franchise_id    uuid        NOT NULL REFERENCES public.franchises(id) ON DELETE CASCADE,
  year_month      char(7)     NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'), -- '2026-05'
  -- Score final 0-100 (soma ponderada)
  total_score     numeric(5,2) NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
  -- Breakdown por categoria (cada um 0-100)
  execucao_score      numeric(5,2) NOT NULL DEFAULT 0 CHECK (execucao_score >= 0 AND execucao_score <= 100),
  relacionamento_score numeric(5,2) NOT NULL DEFAULT 0 CHECK (relacionamento_score >= 0 AND relacionamento_score <= 100),
  vendas_score        numeric(5,2) NOT NULL DEFAULT 0 CHECK (vendas_score >= 0 AND vendas_score <= 100),
  cocriacao_score     numeric(5,2) NOT NULL DEFAULT 0 CHECK (cocriacao_score >= 0 AND cocriacao_score <= 100),
  -- Prêmio mensal calculado
  premio_centavos integer     NOT NULL DEFAULT 0 CHECK (premio_centavos >= 0),
  -- Pago? (cria loyalty_transaction quando paid_at é setado)
  paid_at         timestamptz,
  paid_loyalty_transaction_id uuid REFERENCES public.loyalty_transactions(id),
  -- Trimestre fechado?
  trimestre_bonus_centavos integer NOT NULL DEFAULT 0,
  -- Posição no ranking da unidade (snapshot)
  ranking_unidade integer,
  ranking_rede    integer,
  -- Auditoria
  computed_at     timestamptz NOT NULL DEFAULT now(),
  audited_by      uuid REFERENCES public.profiles(id),
  audited_at      timestamptz,
  CONSTRAINT uq_profile_score_monthly UNIQUE (profile_id, year_month)
);

COMMENT ON TABLE public.profile_score_monthly IS
  'Score de Cuidado mensal por profissional. Calculado por compute_monthly_score(). Prêmio em centavos pra evitar floats.';
COMMENT ON COLUMN public.profile_score_monthly.year_month IS
  'Formato YYYY-MM (ex: 2026-05). Não criar manualmente — função recalcula.';
COMMENT ON COLUMN public.profile_score_monthly.premio_centavos IS
  'Prêmio mensal em centavos. Escala: 7000 (70-79), 20000 (80-89), 50000 (90-99), 100000 (100) e 150000 (perfeito).';

CREATE INDEX IF NOT EXISTS idx_psm_franchise_yearmonth ON public.profile_score_monthly (franchise_id, year_month);
CREATE INDEX IF NOT EXISTS idx_psm_yearmonth ON public.profile_score_monthly (year_month);
CREATE INDEX IF NOT EXISTS idx_psm_profile ON public.profile_score_monthly (profile_id, year_month DESC);

-- ---------------------------------------------------------------------------
-- 2. profile_score_kpi_log — log granular de cada KPI computado
-- Histórico de cada KPI ao longo do mês. Usado pelo gerente pra auditoria.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_score_kpi_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year_month      char(7)     NOT NULL,
  categoria       text        NOT NULL CHECK (categoria IN ('execucao','relacionamento','vendas','cocriacao')),
  kpi_key         text        NOT NULL,  -- ex: 'acoes_executadas_pct', 'nps_medio'
  kpi_value       numeric     NOT NULL,
  kpi_target      numeric,                -- meta esperada (ex: 90 pra 90%)
  kpi_score_contribution numeric(5,2),    -- quanto esse KPI contribuiu pro score categoria
  computed_at     timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb       NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE public.profile_score_kpi_log IS
  'Log granular de KPIs computados. Usado pra auditoria, dashboard de breakdown, debugging.';

CREATE INDEX IF NOT EXISTS idx_pskl_profile_yearmonth ON public.profile_score_kpi_log (profile_id, year_month);
CREATE INDEX IF NOT EXISTS idx_pskl_kpi ON public.profile_score_kpi_log (kpi_key, year_month);

-- ---------------------------------------------------------------------------
-- 3. profile_score_audit — observações da consultora auditadas pelo gerente
-- Sample-based: a cada N observações pós-atendimento, 1 é re-lida.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_score_audit (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id  uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  audited_by      uuid        NOT NULL REFERENCES public.profiles(id),
  audited_at      timestamptz NOT NULL DEFAULT now(),
  -- 1-5 estrelas pela qualidade da observação
  quality_stars   smallint    NOT NULL CHECK (quality_stars >= 1 AND quality_stars <= 5),
  -- Comentário do gerente (opcional)
  audit_notes     text
);

COMMENT ON TABLE public.profile_score_audit IS
  'Auditoria de observações pós-atendimento pelo gerente. Mantém qualidade do registro, evita templates copy-paste.';

CREATE INDEX IF NOT EXISTS idx_psa_profile_audited ON public.profile_score_audit (profile_id, audited_at DESC);

-- ---------------------------------------------------------------------------
-- Validação rápida — rodar após apply
-- SELECT 'profile_score_monthly' AS t, count(*) FROM public.profile_score_monthly
-- UNION ALL SELECT 'profile_score_kpi_log', count(*) FROM public.profile_score_kpi_log
-- UNION ALL SELECT 'profile_score_audit', count(*) FROM public.profile_score_audit;
-- ---------------------------------------------------------------------------
