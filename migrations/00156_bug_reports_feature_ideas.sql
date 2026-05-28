-- 00156_bug_reports_feature_ideas.sql
-- Programa de Co-Criação — bugs reportados e ideias enviadas pela equipe.
-- Cada bug validado ou ideia implementada credita prêmio em loyalty_transactions.
--
-- Doc 44 detalha valores: bug baixo R$ 100 · bug médio R$ 300 · bug crítico R$ 500
--                         ideia implementada R$ 500 · ideia que muda KPI rede R$ 2000

-- ---------------------------------------------------------------------------
-- 1. bug_reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id uuid      NOT NULL REFERENCES public.profiles(id),
  franchise_id      uuid        NOT NULL REFERENCES public.franchises(id),

  title             text        NOT NULL,
  description       text        NOT NULL,
  steps_to_reproduce text,
  frequency         text CHECK (frequency IN ('once','rare','sometimes','often','always')),
  screen_or_path    text,       -- ex: 'mobile/(client)/daily-recommendation'
  attachment_url    text,       -- print ou vídeo

  -- Workflow
  status            text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','triaging','validated','fixed','duplicate','wont_fix','rejected')),
  severity          text CHECK (severity IN ('low','medium','high','critical')),
  validated_by      uuid REFERENCES public.profiles(id),
  validated_at      timestamptz,
  fixed_at          timestamptz,
  fixed_commit_sha  text,

  -- Prêmio
  premio_centavos   integer DEFAULT 0 CHECK (premio_centavos >= 0),
  paid_loyalty_transaction_id uuid REFERENCES public.loyalty_transactions(id),
  paid_at           timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bug_reports IS
  'Bugs reportados pela equipe. Validação dispara prêmio em loyalty_transactions. Severidade define valor: low R$ 100 / med R$ 300 / high-crit R$ 500.';

CREATE INDEX IF NOT EXISTS idx_br_reporter ON public.bug_reports (reporter_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_br_status ON public.bug_reports (status);

-- ---------------------------------------------------------------------------
-- 2. feature_ideas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feature_ideas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id uuid      NOT NULL REFERENCES public.profiles(id),
  franchise_id      uuid        NOT NULL REFERENCES public.franchises(id),

  title             text        NOT NULL,
  problem_it_solves text        NOT NULL,
  how_it_works      text,
  who_benefits      text,
  willing_to_test   boolean NOT NULL DEFAULT false,

  -- Workflow
  status            text NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','evaluating','planned','in_development','implemented','rejected','duplicate')),
  evaluated_by      uuid REFERENCES public.profiles(id),
  evaluated_at      timestamptz,
  implemented_at    timestamptz,
  feature_name_in_app text,     -- nome que a feature recebeu no app (pode ter o nome de quem propôs)

  -- Impacto observado pós-lançamento
  kpi_impact_jsonb  jsonb DEFAULT '{}',  -- {kpi: 'recompra_90d', before: 10, after: 28}
  changes_network_kpi boolean NOT NULL DEFAULT false,

  -- Prêmio
  premio_centavos   integer DEFAULT 0 CHECK (premio_centavos >= 0),
  paid_loyalty_transaction_id uuid REFERENCES public.loyalty_transactions(id),
  paid_at           timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.feature_ideas IS
  'Ideias enviadas pela equipe. Implementação dispara prêmio R$ 500 (padrão) ou R$ 2000 (muda KPI rede). Pode levar o nome de quem propôs.';

CREATE INDEX IF NOT EXISTS idx_fi_reporter ON public.feature_ideas (reporter_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_status ON public.feature_ideas (status);

-- RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY br_self_all ON public.bug_reports FOR ALL TO authenticated
  USING (
    reporter_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  )
  WITH CHECK (reporter_profile_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner')));

CREATE POLICY fi_self_all ON public.feature_ideas FOR ALL TO authenticated
  USING (
    reporter_profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  )
  WITH CHECK (reporter_profile_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner')));
