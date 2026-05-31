-- 00165_self_assessments.sql
-- Análises Domésticas — cliente registra em casa (foto, dor, sono, ciclo, hidratação).
-- Cada análise vira sinal pra decision-engine e Score de Cuidado da profissional.

CREATE TYPE assessment_kind AS ENUM (
  'photo_evolution',       -- foto de evolução (antes/depois)
  'pain_scale',            -- escala 0-10
  'sleep_quality',         -- qualidade do sono
  'energy_level',          -- nível de energia
  'cycle_log',             -- dia do ciclo + sintomas
  'skin_hydration',        -- hidratação da pele
  'mood_check',            -- bem-estar emocional
  'inchaco_post_op',       -- inchaço pós procedimento
  'side_effect_check'      -- alerta de efeito colateral
);

CREATE TABLE IF NOT EXISTS public.client_self_assessments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL REFERENCES public.client_details(id) ON DELETE CASCADE,
  related_protocol_id uuid REFERENCES public.client_protocol_progress(id),
  related_procedure_key text,

  kind                assessment_kind NOT NULL,
  day_relative        integer,                        -- D+N (positivo) ou D-N (negativo) em relação ao procedimento

  -- Dados (sempre tudo nullable; o kind define o que importa)
  numeric_value       numeric,                        -- pain 0-10, sleep hours, hydration %
  scale_value         text,                           -- ex: 'baixo|medio|alto'
  text_note           text,
  photo_url           text,                           -- Supabase Storage
  metadata_jsonb      jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Avaliação automática pelo decision-engine
  alert_triggered     boolean     NOT NULL DEFAULT false,
  alert_reason_code   text,                           -- ex: 'pain_high', 'inchaco_acima_esperado'

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csa_client_kind ON public.client_self_assessments (client_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_csa_alert ON public.client_self_assessments (alert_triggered, created_at DESC) WHERE alert_triggered = true;

-- RLS
ALTER TABLE public.client_self_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY csa_self ON public.client_self_assessments FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = client_self_assessments.client_id AND profile_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.appointments ap
    JOIN public.employee_details ed ON ed.id = ap.employee_id
    WHERE ap.client_id = client_self_assessments.client_id
      AND ed.profile_id = auth.uid()
      AND ap.date >= CURRENT_DATE - INTERVAL '180 days'
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

-- Trigger: pain >= 7 ou inchaco > esperado → alert_triggered + decision_actions_queue
CREATE OR REPLACE FUNCTION public.self_assessment_alert_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_alert boolean := false;
  v_reason text;
BEGIN
  IF NEW.kind = 'pain_scale' AND NEW.numeric_value >= 7 THEN
    v_alert := true; v_reason := 'pain_high';
  ELSIF NEW.kind = 'side_effect_check' AND NEW.text_note IS NOT NULL THEN
    v_alert := true; v_reason := 'side_effect_reported';
  ELSIF NEW.kind = 'inchaco_post_op' AND NEW.numeric_value >= 8 THEN
    v_alert := true; v_reason := 'inchaco_acima_esperado';
  END IF;

  IF v_alert THEN
    NEW.alert_triggered := true;
    NEW.alert_reason_code := v_reason;

    -- Empilhar ação no decision-engine pra profissional ver no Briefing
    INSERT INTO public.decision_actions_queue (
      client_id, action_type, channel, priority, reason_code, payload, scheduled_for
    ) VALUES (
      NEW.client_id,
      'alert_team',
      'humano',
      2,                                              -- alta prioridade
      v_reason,
      jsonb_build_object(
        'title', 'Alerta: ' || v_reason,
        'description', 'Cliente registrou em casa ' || NEW.kind || ' = ' || COALESCE(NEW.numeric_value::text, NEW.text_note, 'sem valor'),
        'cta_kind', 'call',
        'cta_label', 'Ligar agora'
      ),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_csa_alert ON public.client_self_assessments;
CREATE TRIGGER trg_csa_alert
  BEFORE INSERT ON public.client_self_assessments
  FOR EACH ROW EXECUTE FUNCTION public.self_assessment_alert_trigger();
