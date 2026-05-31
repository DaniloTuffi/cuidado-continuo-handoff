-- 00160_diario_rls.sql
-- RLS do Diário — pública leitura de colunas publicadas, escrita restrita.

ALTER TABLE public.diario_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_event_rsvp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diario_columnist_invites ENABLE ROW LEVEL SECURITY;

-- COLUNAS: qualquer cliente autenticada vê colunas publicadas; autora vê suas próprias drafts
CREATE POLICY dc_read_published ON public.diario_columns FOR SELECT TO authenticated
  USING (is_draft = false AND published_at IS NOT NULL);
CREATE POLICY dc_read_own_drafts ON public.diario_columns FOR SELECT TO authenticated
  USING (author_profile_id = auth.uid());
CREATE POLICY dc_insert_own ON public.diario_columns FOR INSERT TO authenticated
  WITH CHECK (author_profile_id = auth.uid());
CREATE POLICY dc_update_own ON public.diario_columns FOR UPDATE TO authenticated
  USING (author_profile_id = auth.uid())
  WITH CHECK (author_profile_id = auth.uid());
CREATE POLICY dc_curate_manager ON public.diario_columns FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner')));

-- COMENTÁRIOS: clientes autenticadas leem, qualquer uma pode comentar em coluna publicada
CREATE POLICY dcom_read ON public.diario_comments FOR SELECT TO authenticated
  USING (
    is_hidden = false
    AND EXISTS (SELECT 1 FROM public.diario_columns dc WHERE dc.id = column_id AND dc.is_draft = false)
  );
CREATE POLICY dcom_insert ON public.diario_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.diario_columns dc WHERE dc.id = column_id AND dc.is_draft = false)
  );
CREATE POLICY dcom_update_own ON public.diario_comments FOR UPDATE TO authenticated
  USING (author_profile_id = auth.uid()) WITH CHECK (author_profile_id = auth.uid());

-- LIKES: cliente pode curtir/descurtir
CREATE POLICY dl_self_all ON public.diario_likes FOR ALL TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY dl_read_counts ON public.diario_likes FOR SELECT TO authenticated USING (true);

-- EVENTOS: cliente vê eventos do próprio franchise SE atende tier mínimo
CREATE POLICY de_read_franchise_tier ON public.diario_events FOR SELECT TO authenticated
  USING (
    is_published = true
    AND franchise_id IN (SELECT franchise_id FROM public.profiles WHERE id = auth.uid())
    AND (
      min_tier IS NULL
      OR tier_rank_of_profile(auth.uid()) >= tier_rank_of_name(min_tier)
    )
  );
CREATE POLICY de_admin_all ON public.diario_events FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner')));

-- Function helper de rank de tier (ajustar se já houver uma similar no repo)
CREATE OR REPLACE FUNCTION public.tier_rank_of_name(p_tier text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_tier
    WHEN 'inicio' THEN 1
    WHEN 'caminho' THEN 2
    WHEN 'trilha' THEN 3
    WHEN 'constelacao' THEN 4
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.tier_rank_of_profile(p_profile_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r integer;
BEGIN
  SELECT public.tier_rank_of_name(lower(lt.name))
    INTO r
  FROM public.client_details cd
  LEFT JOIN public.loyalty_tiers lt ON lt.id = cd.loyalty_tier_id
  WHERE cd.profile_id = p_profile_id;
  RETURN COALESCE(r, 1);
END;
$$;
GRANT EXECUTE ON FUNCTION public.tier_rank_of_name(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_rank_of_profile(uuid) TO authenticated;

-- RSVP: cliente confirma a si mesma
CREATE POLICY der_self_read ON public.diario_event_rsvp FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
  );
CREATE POLICY der_self_write ON public.diario_event_rsvp FOR ALL TO authenticated
  USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());

-- CONVITES: cliente vê convites pra ela; profissional vê os que enviou
CREATE POLICY dci_self_read ON public.diario_columnist_invites FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.client_details WHERE id = client_id AND profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('manager','admin','owner'))
  );
CREATE POLICY dci_prof_insert ON public.diario_columnist_invites FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('employee','manager','admin','owner'))
  );
