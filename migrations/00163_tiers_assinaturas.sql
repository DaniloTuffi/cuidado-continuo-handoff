-- 00163_tiers_assinaturas.sql
-- Tier Cuidado (R$ 200/mês) + Tier 360° (R$ 500/mês) — assinaturas recorrentes
-- via Asaas. Pool de profissionais (nutri, dermato, médica, personal) que atendem
-- os tiers pagos.
--
-- Tier Essencial é grátis automático com qualquer compra ≥ R$ 95 (sem schema próprio).

-- ---------------------------------------------------------------------------
-- 1. cuidado_continuo_tiers — catálogo dos tiers (3 rows fixas seedadas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cuidado_continuo_tiers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text        NOT NULL UNIQUE CHECK (slug IN ('essencial','cuidado','programa_360')),
  name                text        NOT NULL,
  description         text,
  monthly_price_centavos integer NOT NULL DEFAULT 0,
  annual_price_centavos  integer,                -- desconto anual opcional
  features_jsonb      jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Quantas consultas vídeo por mês (por especialidade)
  nutri_sessions_per_month     integer NOT NULL DEFAULT 0,
  dermato_sessions_per_quarter integer NOT NULL DEFAULT 0,
  medica_sessions_per_quarter  integer NOT NULL DEFAULT 0,
  personal_sessions_per_quarter integer NOT NULL DEFAULT 0,

  is_active           boolean     NOT NULL DEFAULT true,
  display_order       integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cuidado_continuo_tiers
  (slug, name, description, monthly_price_centavos, annual_price_centavos, features_jsonb,
   nutri_sessions_per_month, dermato_sessions_per_quarter, medica_sessions_per_quarter, personal_sessions_per_quarter,
   display_order)
VALUES
  ('essencial', 'Essencial',
    'Cordão umbilical mínimo · ativa automático com qualquer compra ≥ R$ 95',
    0, 0,
    '["Casa do Cuidado", "Pós-Procedimento interativo", "IA 24/7 dúvidas gerais", "Chat com executora", "Cortesia Janela Mágica D+15"]'::jsonb,
    0, 0, 0, 0, 1),
  ('cuidado', 'Cuidado',
    'Acompanhamento mensal com profissional de protocolo + Painel Hormonal completo',
    20000, 180000,
    '["Tudo do Essencial", "Consulta online mensal (nutri/enfermeira)", "Painel Hormonal completo", "Análises Domésticas ilimitadas", "Plano refeito 4×/ano", "Chat com gerente"]'::jsonb,
    1, 0, 0, 0, 2),
  ('programa_360', 'Programa 360°',
    'Acompanhamento multidisciplinar premium — modelo Mayo Clinic da estética',
    50000, 480000,
    '["Tudo do Cuidado", "Consulta dermato trimestral", "Médica do protocolo trimestral", "Personal/fisio dermatofuncional trimestral", "Suplementação coordenada", "Atendimento prioritário em qualquer unidade", "Pacote evento (reajuste pré-festa/viagem)"]'::jsonb,
    1, 1, 1, 1, 3)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_centavos = EXCLUDED.monthly_price_centavos,
  annual_price_centavos = EXCLUDED.annual_price_centavos,
  features_jsonb = EXCLUDED.features_jsonb;

-- ---------------------------------------------------------------------------
-- 2. client_cc_subscriptions — assinatura ativa do cliente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_cc_subscriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL REFERENCES public.client_details(id) ON DELETE CASCADE,
  tier_slug           text        NOT NULL REFERENCES public.cuidado_continuo_tiers(slug),

  status              text        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','paused','canceled','past_due','trial')),
  billing_cycle       text        NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),

  -- Pricing snapshot (preço travado no momento da assinatura)
  price_centavos      integer     NOT NULL,

  started_at          timestamptz NOT NULL DEFAULT now(),
  next_billing_at     timestamptz NOT NULL,
  trial_ends_at       timestamptz,
  paused_until        timestamptz,
  canceled_at         timestamptz,

  -- Integração Asaas
  asaas_subscription_id text,
  asaas_customer_id     text,

  -- Profissionais alocados (pool)
  assigned_nutri_id   uuid REFERENCES public.employee_details(id),
  assigned_dermato_id uuid REFERENCES public.employee_details(id),
  assigned_medica_id  uuid REFERENCES public.employee_details(id),
  assigned_personal_id uuid REFERENCES public.employee_details(id),

  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_client_active_sub UNIQUE (client_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_ccs_billing ON public.client_cc_subscriptions (next_billing_at)
  WHERE status IN ('active','past_due');
CREATE INDEX IF NOT EXISTS idx_ccs_tier ON public.client_cc_subscriptions (tier_slug, status);

-- ---------------------------------------------------------------------------
-- 3. cc_professional_pool — profissionais do pool 360°
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cc_professional_pool (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid        NOT NULL UNIQUE REFERENCES public.employee_details(id) ON DELETE CASCADE,

  specialty           text        NOT NULL CHECK (specialty IN (
    'nutricionista','dermatologista','medica_protocolo','personal_trainer','fisio_dermatofuncional','enfermeira'
  )),

  max_active_clients  integer     NOT NULL DEFAULT 30,
  current_clients_count integer   NOT NULL DEFAULT 0,
  consultations_per_month integer NOT NULL DEFAULT 0,

  hourly_rate_centavos integer,                 -- pagamento PJ (não CLT)
  bio                 text,
  photo_url           text,
  presentation_video_url text,

  is_accepting_new_clients boolean NOT NULL DEFAULT true,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pool_specialty ON public.cc_professional_pool (specialty, is_accepting_new_clients)
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 4. cc_video_consultations — agendamentos de consulta online
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cc_video_consultations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     uuid        NOT NULL REFERENCES public.client_cc_subscriptions(id),
  client_id           uuid        NOT NULL REFERENCES public.client_details(id),
  professional_id     uuid        NOT NULL REFERENCES public.cc_professional_pool(id),
  specialty           text        NOT NULL,

  scheduled_at        timestamptz NOT NULL,
  duration_minutes    integer     NOT NULL DEFAULT 30,
  status              text        NOT NULL DEFAULT 'scheduled'
                                  CHECK (status IN ('scheduled','confirmed','completed','no_show','canceled','rescheduled')),

  -- Vídeo provider (Daily.co/Whereby/Zoom)
  video_provider      text        DEFAULT 'daily',
  video_room_url      text,
  video_recording_url text,

  professional_notes  text,        -- notas pra próxima consulta
  client_summary      text,        -- resumo enviado pra cliente

  completed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cvc_client_scheduled ON public.cc_video_consultations (client_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_cvc_pro_scheduled ON public.cc_video_consultations (professional_id, scheduled_at)
  WHERE status IN ('scheduled','confirmed');

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.cuidado_continuo_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_cc_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_professional_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_video_consultations ENABLE ROW LEVEL SECURITY;

-- Catálogo: leitura pública pra qualquer autenticada
CREATE POLICY cct_read_all ON public.cuidado_continuo_tiers FOR SELECT TO authenticated USING (true);

-- Assinatura: cliente vê a sua + admin/manager vê da unidade
CREATE POLICY ccs_self_read ON public.client_cc_subscriptions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = client_cc_subscriptions.client_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);
CREATE POLICY ccs_self_write ON public.client_cc_subscriptions FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = client_cc_subscriptions.client_id AND profile_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = client_cc_subscriptions.client_id AND profile_id = auth.uid())
);

-- Pool: leitura pra autenticadas (cliente vê quem pode atender), escrita só admin
CREATE POLICY pool_read ON public.cc_professional_pool FOR SELECT TO authenticated USING (true);
CREATE POLICY pool_admin_write ON public.cc_professional_pool FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
);

-- Consultas: cliente vê suas, profissional vê das suas, admin vê tudo
CREATE POLICY cvc_actors ON public.cc_video_consultations FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = cc_video_consultations.client_id AND profile_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.cc_professional_pool pp
    JOIN public.employee_details ed ON ed.id = pp.employee_id
    WHERE pp.id = cc_video_consultations.professional_id AND ed.profile_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);
