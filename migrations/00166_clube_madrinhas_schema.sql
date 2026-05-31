-- 00166_clube_madrinhas_schema.sql
-- Clube das Madrinhas — acesso escasso ao Painel das Madrinhas existente
-- via Flask + WebView. Substitui a tese de tiers de assinatura recorrente (00163).
--
-- Doc 45 (Obsidian) descreve a estratégia. Painel Flask continua existindo
-- com seu próprio banco; aqui registramos elegibilidade + acessos.
--
-- DROP da 00163 (tier de assinatura) recomendado em produção se já aplicada:
--   DROP TABLE client_cc_subscriptions, cuidado_continuo_tiers CASCADE;

-- ---------------------------------------------------------------------------
-- 1. clube_madrinhas_membership — elegibilidade + status
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clube_madrinhas_membership (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL UNIQUE REFERENCES public.client_details(id) ON DELETE CASCADE,

  -- Status
  status              text        NOT NULL DEFAULT 'invited'
                                  CHECK (status IN (
                                    'invited',         -- liberada via exceção pela profissional, ainda não validou
                                    'active',          -- compra fechada + acesso pleno
                                    'expired',         -- inatividade > 12 meses
                                    'waitlist',        -- na fila
                                    'declined'         -- recusou explicitamente
                                  )),

  -- Tipo de entrada
  entry_type          text        CHECK (entry_type IN (
                                    'manual_professional',  -- profissional liberou durante atendimento
                                    'cpf_self_check',        -- cliente entrou com CPF e foi encontrada
                                    'auto_high_value',       -- compra ≥ R$ 10k disparou auto
                                    'waitlist_promoted',     -- fila promoveu
                                    'invited_by_madrinha'    -- indicação de outra Madrinha
                                  )),

  -- Tracking
  invited_at          timestamptz,
  activated_at        timestamptz,
  invited_by_employee_id uuid REFERENCES public.employee_details(id),
  invited_by_client_id   uuid REFERENCES public.client_details(id),
  expires_at          timestamptz,

  -- Integração Painel Flask
  flask_client_external_id text,     -- ID no banco Flask
  flask_token_issued_at    timestamptz,

  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmm_status ON public.clube_madrinhas_membership (status);
CREATE INDEX IF NOT EXISTS idx_cmm_invited_by ON public.clube_madrinhas_membership (invited_by_employee_id, invited_at DESC);

-- ---------------------------------------------------------------------------
-- 2. clube_madrinhas_waitlist — fila de espera
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clube_madrinhas_waitlist (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL UNIQUE REFERENCES public.client_details(id) ON DELETE CASCADE,

  position            integer,                            -- preenchido por function periodicamente
  joined_at           timestamptz NOT NULL DEFAULT now(),

  -- Contexto
  source              text        CHECK (source IN ('app_self','professional_added','indication','event_signup')),
  notes               text,

  -- Status
  promoted_at         timestamptz,
  declined_at         timestamptz,
  contacted_count     integer     NOT NULL DEFAULT 0,
  last_contacted_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cmw_position ON public.clube_madrinhas_waitlist (position) WHERE promoted_at IS NULL AND declined_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. clube_high_value_benefits — benefícios desbloqueados por compra ≥ R$ 10k
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clube_high_value_benefits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL REFERENCES public.client_details(id) ON DELETE CASCADE,
  triggering_package_id uuid REFERENCES public.client_packages(id),
  triggering_purchase_centavos integer NOT NULL CHECK (triggering_purchase_centavos >= 1000000), -- ≥ R$ 10.000

  -- Benefícios ativos
  has_medical_followup     boolean NOT NULL DEFAULT true,
  has_nutritionist_followup boolean NOT NULL DEFAULT true,
  has_ai_concierge_premium boolean NOT NULL DEFAULT true,

  -- Cotas
  medical_consultations_remaining integer NOT NULL DEFAULT 1,
  nutri_consultations_remaining   integer NOT NULL DEFAULT 12,  -- 1× semana durante vigência
  nutri_photo_reviews_remaining   integer NOT NULL DEFAULT 52,

  -- Vigência
  starts_at           timestamptz NOT NULL DEFAULT now(),
  ends_at             timestamptz NOT NULL,                -- = client_packages.expiry_date
  is_active           boolean GENERATED ALWAYS AS (now() BETWEEN starts_at AND ends_at) STORED,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chvb_client_active ON public.clube_high_value_benefits (client_id) WHERE is_active = true;

-- Trigger: client_packages.total_paid >= 10000 cria clube_high_value_benefits automático
CREATE OR REPLACE FUNCTION public.create_high_value_benefits_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_total_centavos integer;
  v_expiry timestamptz;
BEGIN
  -- Calcular valor pago em centavos (assumindo client_packages tem payment relacionado)
  SELECT (NEW.total_sessions * COALESCE(p.average_price_per_session, 0))::integer * 100
    INTO v_total_centavos
    FROM public.packages p WHERE p.id = NEW.package_id;

  IF v_total_centavos IS NULL OR v_total_centavos < 1000000 THEN
    RETURN NEW;
  END IF;

  v_expiry := COALESCE(NEW.expiry_date::timestamptz, now() + INTERVAL '1 year');

  INSERT INTO public.clube_high_value_benefits (
    client_id, triggering_package_id, triggering_purchase_centavos,
    starts_at, ends_at
  )
  VALUES (NEW.client_id, NEW.id, v_total_centavos, now(), v_expiry)
  ON CONFLICT DO NOTHING;

  -- Auto-promove pro Clube se ainda não é Madrinha
  INSERT INTO public.clube_madrinhas_membership (
    client_id, status, entry_type, activated_at, expires_at
  ) VALUES (
    NEW.client_id, 'active', 'auto_high_value', now(), v_expiry
  ) ON CONFLICT (client_id) DO UPDATE SET
    status = 'active',
    activated_at = COALESCE(EXCLUDED.activated_at, clube_madrinhas_membership.activated_at),
    expires_at = GREATEST(clube_madrinhas_membership.expires_at, EXCLUDED.expires_at);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_high_value_benefits ON public.client_packages;
CREATE TRIGGER trg_high_value_benefits
  AFTER INSERT ON public.client_packages
  FOR EACH ROW EXECUTE FUNCTION public.create_high_value_benefits_trigger();

-- ---------------------------------------------------------------------------
-- 4. clube_stock_visibility — estoques limitados visíveis por procedimento
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clube_stock_visibility (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid        NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  service_id          uuid        NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  year_month          char(7)     NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),

  monthly_capacity    integer     NOT NULL,                -- total disponível pra Madrinhas
  monthly_used        integer     NOT NULL DEFAULT 0,
  visibility_label    text,                                -- texto custom ex: "Lançamento exclusivo"

  is_active           boolean     NOT NULL DEFAULT true,
  display_order       integer     NOT NULL DEFAULT 0,

  CONSTRAINT uq_csv_unit_service_ym UNIQUE (unit_id, service_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_csv_active ON public.clube_stock_visibility (unit_id, year_month) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 5. instituto_depoimentos — depoimentos de alunas formadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instituto_depoimentos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text        NOT NULL,
  age                 integer,
  city                text,
  professional_area   text,                                -- ex: 'esteticista', 'biomedica'
  graduation_year     integer,
  current_status      text,                                -- ex: 'Trabalhando em clínica em Pinheiros'

  short_quote         text        NOT NULL,                -- frase curta destacada
  full_story          text        NOT NULL,                -- texto longo

  video_url           text,                                -- depoimento em vídeo
  photo_url           text,                                -- foto retrato

  is_published        boolean     NOT NULL DEFAULT false,
  display_order       integer     NOT NULL DEFAULT 0,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ind_published ON public.instituto_depoimentos (is_published, display_order);

-- ---------------------------------------------------------------------------
-- 6. instituto_metrics — métricas do Instituto pra mostrar nos contadores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.instituto_metrics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key          text        NOT NULL UNIQUE,
  current_value       numeric     NOT NULL,
  display_format      text        DEFAULT 'integer' CHECK (display_format IN ('integer','currency','percent')),
  label               text        NOT NULL,
  description         text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.instituto_metrics (metric_key, current_value, display_format, label, description) VALUES
  ('total_alunas_formadas', 0, 'integer', 'mulheres formadas', 'Total acumulado de alunas formadas pelo Instituto'),
  ('total_doado_centavos', 0, 'currency', 'já doado pelo Estúdio Mais', 'Total destinado ao Instituto desde o início'),
  ('current_turma_size', 0, 'integer', 'mulheres na turma atual', 'Tamanho da turma em formação agora'),
  ('next_turma_starts_at_ts', 0, 'integer', 'próxima turma', 'Timestamp Unix da próxima turma')
ON CONFLICT (metric_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Function: client_clube_status — overview completo do cliente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_clube_status(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT jsonb_build_object(
    'membership_status', COALESCE(cmm.status, 'not_member'),
    'has_active_benefits', (
      SELECT EXISTS(
        SELECT 1 FROM public.clube_high_value_benefits
        WHERE client_id = p_client_id AND is_active = true
      )
    ),
    'medical_remaining', (
      SELECT COALESCE(SUM(medical_consultations_remaining), 0)
      FROM public.clube_high_value_benefits
      WHERE client_id = p_client_id AND is_active = true
    ),
    'nutri_remaining', (
      SELECT COALESCE(SUM(nutri_consultations_remaining), 0)
      FROM public.clube_high_value_benefits
      WHERE client_id = p_client_id AND is_active = true
    ),
    'nutri_photos_remaining', (
      SELECT COALESCE(SUM(nutri_photo_reviews_remaining), 0)
      FROM public.clube_high_value_benefits
      WHERE client_id = p_client_id AND is_active = true
    ),
    'waitlist_position', (
      SELECT position FROM public.clube_madrinhas_waitlist
      WHERE client_id = p_client_id
        AND promoted_at IS NULL AND declined_at IS NULL
    )
  )
  FROM (SELECT 1) x
  LEFT JOIN public.clube_madrinhas_membership cmm ON cmm.client_id = p_client_id;
$$;
GRANT EXECUTE ON FUNCTION public.client_clube_status(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Function: verify_cpf_madrinha — cliente entra com CPF, retorna acesso
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_cpf_madrinha(p_cpf text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_client_id uuid;
  v_status text;
BEGIN
  SELECT cd.id INTO v_client_id
    FROM public.client_details cd
    JOIN public.profiles p ON p.id = cd.profile_id
   WHERE regexp_replace(p.cpf, '[^0-9]', '', 'g') = regexp_replace(p_cpf, '[^0-9]', '', 'g')
   LIMIT 1;

  IF v_client_id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'cpf_not_in_base');
  END IF;

  SELECT status INTO v_status
    FROM public.clube_madrinhas_membership
   WHERE client_id = v_client_id;

  RETURN jsonb_build_object(
    'found', true,
    'client_id', v_client_id,
    'is_member', v_status IN ('active','invited'),
    'membership_status', COALESCE(v_status, 'not_member'),
    'can_join_waitlist', v_status IS NULL OR v_status = 'declined'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_cpf_madrinha(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Function: clube_overview_counts — usado pela tela /clube-madrinhas
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clube_overview_counts()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
  SELECT jsonb_build_object(
    'active',   (SELECT count(*) FROM public.clube_madrinhas_membership WHERE status IN ('active','invited')),
    'waitlist', (SELECT count(*) FROM public.clube_madrinhas_waitlist  WHERE promoted_at IS NULL)
  );
$$;
GRANT EXECUTE ON FUNCTION public.clube_overview_counts() TO authenticated;
