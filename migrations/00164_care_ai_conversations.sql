-- 00164_care_ai_conversations.sql
-- IA 24/7 da Cliente — chat com Claude pra dúvidas pós-procedimento.
-- Handoff humano quando: dúvida clínica séria, sintoma persistente, sentimento negativo, etc.

CREATE TABLE IF NOT EXISTS public.care_ai_conversations (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid        NOT NULL REFERENCES public.client_details(id) ON DELETE CASCADE,

  -- Conversa "viva" — quando uma nova é aberta após inatividade
  started_at          timestamptz NOT NULL DEFAULT now(),
  last_message_at     timestamptz NOT NULL DEFAULT now(),
  closed_at           timestamptz,

  -- Contexto inicial
  related_procedure_key text,                        -- ex: 'design_sobrancelha' (se houver)
  related_protocol_id uuid REFERENCES public.client_protocol_progress(id),

  topic_summary       text,                          -- IA atualiza com 1 frase resumo
  sentiment_score     numeric(3,2),                  -- -1 a 1 (negativo a positivo)
  total_messages      integer     NOT NULL DEFAULT 0,

  -- Handoff humano
  escalation_status   text        NOT NULL DEFAULT 'ai_only'
                                  CHECK (escalation_status IN ('ai_only','requested','assigned','resolved')),
  escalated_at        timestamptz,
  assigned_to_employee_id uuid REFERENCES public.employee_details(id),
  escalation_reason   text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cac_client_open ON public.care_ai_conversations (client_id, last_message_at DESC)
  WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cac_escalated ON public.care_ai_conversations (escalation_status, escalated_at DESC)
  WHERE escalation_status IN ('requested','assigned');

CREATE TABLE IF NOT EXISTS public.care_ai_messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid        NOT NULL REFERENCES public.care_ai_conversations(id) ON DELETE CASCADE,
  role                text        NOT NULL CHECK (role IN ('user','assistant','system','employee')),
  body                text        NOT NULL,
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- LLM tracking
  model_used          text,                          -- ex: claude-sonnet-4.6
  tokens_input        integer,
  tokens_output       integer,
  cache_hit           boolean,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cam_conv ON public.care_ai_messages (conversation_id, created_at);

-- RLS
ALTER TABLE public.care_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY cac_actors ON public.care_ai_conversations FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = care_ai_conversations.client_id AND profile_id = auth.uid())
  OR (
    assigned_to_employee_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.employee_details ed
      WHERE ed.id = care_ai_conversations.assigned_to_employee_id
        AND ed.profile_id = auth.uid()
    )
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

CREATE POLICY cam_actors ON public.care_ai_messages FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.care_ai_conversations c
    WHERE c.id = care_ai_messages.conversation_id
      AND (
        EXISTS (SELECT 1 FROM public.client_details cd WHERE cd.id = c.client_id AND cd.profile_id = auth.uid())
        OR (
          c.assigned_to_employee_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.employee_details ed WHERE ed.id = c.assigned_to_employee_id AND ed.profile_id = auth.uid())
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
      )
  )
);
