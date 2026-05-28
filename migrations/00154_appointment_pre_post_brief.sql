-- 00154_appointment_pre_post_brief.sql
-- Campos obrigatórios PRÉ e PÓS atendimento que alimentam o Score de Cuidado.
--
-- Doc 44 detalha quais campos contam pro KPI.
-- O preenchimento dispara `award_daily_action_points` automaticamente (function existente).

-- ---------------------------------------------------------------------------
-- appointment_pre_brief — preenchido até 24h antes da visita
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_pre_brief (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    uuid        NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  professional_id   uuid        NOT NULL REFERENCES public.profiles(id),
  client_id         uuid        NOT NULL REFERENCES public.client_details(id),

  -- Plano de oferta
  planned_packages_jsonb    jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{package_id, level}]
  planned_skus_jsonb        jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{service_id, motivo}]
  planned_courtesy_key      text, -- ex: 'tintura_sobrancelha'

  -- Memória atualizada (snapshot)
  memory_update_notes       text, -- texto livre — algo novo a confirmar?
  upcoming_event_date       date, -- aniversário próximo? viagem?
  upcoming_event_description text,

  -- Contexto comercial
  package_session_current   integer, -- sessão atual no pacote
  risk_signal               text,    -- ex: 'long_gap', 'low_nps', 'package_ending'

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_pre_brief IS
  'Brief preenchido antes da visita. Faz parte do KPI de Execução do Score de Cuidado.';

CREATE INDEX IF NOT EXISTS idx_apb_professional ON public.appointment_pre_brief (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apb_client ON public.appointment_pre_brief (client_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- appointment_post_brief — preenchido até 1h após a visita
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_post_brief (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    uuid        NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  professional_id   uuid        NOT NULL REFERENCES public.profiles(id),
  client_id         uuid        NOT NULL REFERENCES public.client_details(id),

  -- O que foi oferecido
  offered_services_jsonb    jsonb NOT NULL DEFAULT '[]'::jsonb, -- array de service_id
  offered_packages_jsonb    jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- O que ela fechou
  closed_services_jsonb     jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_packages_jsonb     jsonb NOT NULL DEFAULT '[]'::jsonb,
  closed_value_centavos     integer DEFAULT 0,

  -- Como reagiu (5 escalas 1-5)
  reaction_animacao         smallint CHECK (reaction_animacao BETWEEN 1 AND 5),
  reaction_confianca        smallint CHECK (reaction_confianca BETWEEN 1 AND 5),
  reaction_disposicao_fin   smallint CHECK (reaction_disposicao_fin BETWEEN 1 AND 5),
  reaction_vinculo_marca    smallint CHECK (reaction_vinculo_marca BETWEEN 1 AND 5),
  reaction_provavel_indica  smallint CHECK (reaction_provavel_indica BETWEEN 1 AND 5),

  -- Objeções (texto livre + categorias)
  objections_text           text,
  objections_categories     text[] CHECK (
    objections_categories <@ ARRAY['preco','tempo','medo','duvida_tecnica','parceiro','agenda','outros']::text[]
  ),

  -- Data de virada de cartão (se compartilhada)
  card_renewal_date         date,

  -- Próxima ação recomendada
  next_action_suggested_jsonb jsonb DEFAULT '{}'::jsonb, -- sugerida pelo sistema
  next_action_approved_jsonb  jsonb DEFAULT '{}'::jsonb, -- aprovada/editada pela profissional

  -- Notas pessoais (alimenta Memória da cliente)
  personal_notes            text,

  -- Foto depois (opcional)
  after_photo_url           text,

  -- NPS confirmado
  nps_requested             boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz, -- quando profissional bateu "concluído"

  -- Tempo gasto no preenchimento (anti-jogada)
  time_spent_seconds integer
);

COMMENT ON TABLE public.appointment_post_brief IS
  'Brief preenchido após a visita. 17+ campos que alimentam Score (Execução, Relacionamento, Vendas). Tempo de preenchimento monitora qualidade (anti copy-paste).';

CREATE INDEX IF NOT EXISTS idx_apostb_professional ON public.appointment_post_brief (professional_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_apostb_client ON public.appointment_post_brief (client_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_apostb_card_renewal ON public.appointment_post_brief (card_renewal_date) WHERE card_renewal_date IS NOT NULL;

-- RLS
ALTER TABLE public.appointment_pre_brief ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_post_brief ENABLE ROW LEVEL SECURITY;

CREATE POLICY apb_professional_all ON public.appointment_pre_brief FOR ALL TO authenticated
  USING (
    professional_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
  )
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY apostb_professional_all ON public.appointment_post_brief FOR ALL TO authenticated
  USING (
    professional_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
  )
  WITH CHECK (professional_id = auth.uid());
