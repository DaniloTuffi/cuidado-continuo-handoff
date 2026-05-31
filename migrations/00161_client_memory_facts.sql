-- 00161_client_memory_facts.sql
-- Memória estruturada da cliente — substitui texto livre em client_details.memory_notes.
-- Permite cruzamento, alertas (aniversário próximo), KPI de Memória Preenchida.
--
-- A coluna client_details.memory_notes continua como fallback/legacy.

CREATE TABLE IF NOT EXISTS public.client_memory_facts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid        NOT NULL REFERENCES public.client_details(id) ON DELETE CASCADE,

  category          text        NOT NULL CHECK (category IN (
    'familia','trabalho','saude_geral','receios_esteticos','preferencias','datas_marcantes',
    'conquistas','relacoes','politica_comunicacao','conteudo_curtido','outros'
  )),
  fact_key          text,                                 -- ex: 'aniversario_filho', 'viagem_planejada'
  fact_text         text        NOT NULL,
  fact_date         date,                                 -- pra triggers de aniversário/viagem
  recurring_yearly  boolean     NOT NULL DEFAULT false,

  added_by          uuid        NOT NULL REFERENCES public.profiles(id),
  added_in_appointment_id uuid REFERENCES public.appointments(id),

  is_archived       boolean     NOT NULL DEFAULT false,
  last_seen_at      timestamptz,                          -- última vez que aparece no briefing

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cmf_client_cat ON public.client_memory_facts (client_id, category) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_cmf_upcoming_dates ON public.client_memory_facts (fact_date) WHERE fact_date IS NOT NULL AND is_archived = false;

-- RLS
ALTER TABLE public.client_memory_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cmf_prof_franchise ON public.client_memory_facts FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_details cd
      JOIN public.profiles me ON me.id = auth.uid()
      WHERE cd.id = client_id
        AND (me.role IN ('admin','owner') OR cd.franchise_id = me.franchise_id)
    )
  )
  WITH CHECK (
    added_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('employee','manager','admin','owner')
    )
  );

-- Function pra puxar memória estruturada agrupada por categoria
CREATE OR REPLACE FUNCTION public.client_memory_grouped(p_client_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT jsonb_object_agg(category, facts)
  FROM (
    SELECT category, jsonb_agg(jsonb_build_object(
      'id', id,
      'fact_text', fact_text,
      'fact_date', fact_date,
      'recurring_yearly', recurring_yearly
    ) ORDER BY created_at DESC) AS facts
    FROM public.client_memory_facts
    WHERE client_id = p_client_id AND is_archived = false
    GROUP BY category
  ) g;
$$;
GRANT EXECUTE ON FUNCTION public.client_memory_grouped(uuid) TO authenticated;
