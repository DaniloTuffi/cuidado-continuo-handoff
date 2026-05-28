-- 00153_score_de_cuidado_rls.sql
-- RLS pra tabelas do Score de Cuidado.
-- Padrão: profissional vê dele · gerente vê da unidade · admin vê tudo.
-- Premio em loyalty_transactions já tem RLS própria.

-- ---------------------------------------------------------------------------
-- profile_score_monthly
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_score_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY psm_self_select ON public.profile_score_monthly FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager','admin','owner')
        AND (p.role IN ('admin','owner') OR p.franchise_id = profile_score_monthly.franchise_id)
    )
  );

-- Insert/update apenas via function compute_monthly_score (SECURITY DEFINER).
-- Sem políticas pra INSERT/UPDATE de usuário comum.

-- ---------------------------------------------------------------------------
-- profile_score_kpi_log
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_score_kpi_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY pskl_self_select ON public.profile_score_kpi_log FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager','admin','owner')
        AND (p.role IN ('admin','owner') OR p.franchise_id = (
          SELECT franchise_id FROM public.profiles WHERE id = profile_score_kpi_log.profile_id
        ))
    )
  );

-- ---------------------------------------------------------------------------
-- profile_score_audit — gerente cria, profissional lê o que é dele
-- ---------------------------------------------------------------------------
ALTER TABLE public.profile_score_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY psa_self_select ON public.profile_score_audit FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR audited_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','owner')
    )
  );

CREATE POLICY psa_manager_insert ON public.profile_score_audit FOR INSERT TO authenticated
  WITH CHECK (
    audited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('manager','admin','owner')
    )
  );
