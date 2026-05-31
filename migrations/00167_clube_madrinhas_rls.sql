-- 00167_clube_madrinhas_rls.sql
-- RLS para Clube das Madrinhas.

ALTER TABLE public.clube_madrinhas_membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_madrinhas_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_high_value_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clube_stock_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instituto_depoimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instituto_metrics ENABLE ROW LEVEL SECURITY;

-- Membership: cliente vê o seu · profissional que liberou vê o que liberou · admin tudo
CREATE POLICY cmm_self ON public.clube_madrinhas_membership FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = clube_madrinhas_membership.client_id AND profile_id = auth.uid())
  OR (
    invited_by_employee_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.employee_details ed WHERE ed.id = invited_by_employee_id AND ed.profile_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

-- Membership: profissional pode criar liberação manual; cliente pode declinar
CREATE POLICY cmm_pro_insert ON public.clube_madrinhas_membership FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.employee_details ed
    WHERE ed.profile_id = auth.uid()
      AND ed.id = invited_by_employee_id
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

CREATE POLICY cmm_self_update ON public.clube_madrinhas_membership FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = clube_madrinhas_membership.client_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

-- Waitlist: cliente vê o seu, qualquer profissional vê tudo, cliente entra na fila sozinha
CREATE POLICY cmw_self_select ON public.clube_madrinhas_waitlist FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = clube_madrinhas_waitlist.client_id AND profile_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('employee','manager','admin','owner'))
);

CREATE POLICY cmw_self_insert ON public.clube_madrinhas_waitlist FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = clube_madrinhas_waitlist.client_id AND profile_id = auth.uid())
);

-- High value benefits: cliente vê os seus + profissional vê do paciente + admin
CREATE POLICY chvb_actors ON public.clube_high_value_benefits FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.client_details WHERE id = clube_high_value_benefits.client_id AND profile_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.appointments ap
    JOIN public.employee_details ed ON ed.id = ap.employee_id
    WHERE ap.client_id = clube_high_value_benefits.client_id
      AND ed.profile_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

-- Stock visibility: público pra autenticadas (cliente vê quanto resta)
CREATE POLICY csv_read ON public.clube_stock_visibility FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY csv_admin_write ON public.clube_stock_visibility FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
);

-- Instituto: leitura pública pra autenticadas
CREATE POLICY ind_read ON public.instituto_depoimentos FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY ind_admin ON public.instituto_depoimentos FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
);

CREATE POLICY im_read ON public.instituto_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY im_admin ON public.instituto_metrics FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
);
