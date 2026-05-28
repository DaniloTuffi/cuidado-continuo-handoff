-- 00155_objections_catalog.sql
-- Catálogo de objeções catalogadas pela equipe. Gold mine de treinamento.
-- Cada objeção registrada conta pro KPI 'objections_catalogadas' (Vendas Saudáveis).
--
-- Doc referência: 09 - Projeto Ela Volta (Bônus estratégico — playbook de objeções)

CREATE TABLE IF NOT EXISTS public.objections_catalog (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id    uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  professional_id   uuid        NOT NULL REFERENCES public.profiles(id),
  client_id         uuid        REFERENCES public.client_details(id) ON DELETE SET NULL,
  franchise_id      uuid        NOT NULL REFERENCES public.franchises(id),

  -- A objeção em si
  category          text        NOT NULL CHECK (
    category IN ('preco','tempo','medo','duvida_tecnica','parceiro','agenda','resultado','duracao','outros')
  ),
  raw_text          text        NOT NULL,  -- verbatim da cliente
  context_text      text,                  -- o que a profissional ofertou quando surgiu
  resolved_text     text,                  -- o que a profissional respondeu

  -- Resultado
  resolution_outcome text CHECK (resolution_outcome IN ('closed','postponed','lost','still_negotiating')),

  -- Procedimento ou pacote alvo
  related_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  related_package_id uuid,

  -- Curadoria (gerente marca como "verdade útil pro time")
  curated_for_training boolean NOT NULL DEFAULT false,
  curated_by        uuid REFERENCES public.profiles(id),
  curated_at        timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.objections_catalog IS
  'Catálogo verbatim de objeções da cliente. Profissional ganha ponto no Score por catalogar. Gerente curou as melhores pra biblioteca de treinamento da rede.';

CREATE INDEX IF NOT EXISTS idx_oc_franchise_category ON public.objections_catalog (franchise_id, category);
CREATE INDEX IF NOT EXISTS idx_oc_professional ON public.objections_catalog (professional_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oc_curated ON public.objections_catalog (curated_for_training, category) WHERE curated_for_training = true;

-- RLS
ALTER TABLE public.objections_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY oc_select_franchise ON public.objections_catalog FOR SELECT TO authenticated
  USING (
    franchise_id IN (SELECT franchise_id FROM public.profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

CREATE POLICY oc_insert_professional ON public.objections_catalog FOR INSERT TO authenticated
  WITH CHECK (professional_id = auth.uid());

CREATE POLICY oc_update_manager ON public.objections_catalog FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid()
        AND role IN ('manager','admin','owner')
    )
  );
