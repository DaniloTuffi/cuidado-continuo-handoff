-- 00159_diario_schema.sql
-- Schema do Diário Estúdio Mais — plataforma editorial dentro do app.
-- Clientes Trilha/Constelação publicam colunas. Outras clientes leem, curtem, comentam.
-- Encontros Constelação (eventos físicos) também moram aqui.
--
-- Doc 42 (Cuidado Contínuo) descreve a tese. RLS em arquivo separado (00160).

-- ---------------------------------------------------------------------------
-- 1. diario_columns — colunas publicadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diario_columns (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_profile_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  franchise_id      uuid        NOT NULL REFERENCES public.franchises(id),

  slug              text        NOT NULL UNIQUE,
  title             text        NOT NULL,
  deck              text,                                -- "lead" do jornalismo
  body_markdown     text        NOT NULL,                -- conteúdo em markdown

  category          text        NOT NULL CHECK (category IN (
    'lideranca','carreira','maternidade','saude_feminina','direito',
    'arquitetura','estilo','joalheria','mindset','ciencia','mae_60_plus','outros'
  )),

  cover_image_url   text,
  reading_minutes   integer,
  edition_number    integer,                             -- número da edição (38, 37, ...)

  published_at      timestamptz,
  is_featured       boolean     NOT NULL DEFAULT false,
  is_draft          boolean     NOT NULL DEFAULT true,

  view_count        integer     NOT NULL DEFAULT 0,
  like_count        integer     NOT NULL DEFAULT 0,
  comment_count     integer     NOT NULL DEFAULT 0,
  share_count       integer     NOT NULL DEFAULT 0,

  curated_by        uuid REFERENCES public.profiles(id),
  curated_at        timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.diario_columns IS
  'Colunas editoriais do Diário Estúdio Mais. Publicadas por clientes Trilha/Constelação após curadoria interna.';

CREATE INDEX IF NOT EXISTS idx_dc_published ON public.diario_columns (published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dc_author ON public.diario_columns (author_profile_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_category ON public.diario_columns (category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_featured ON public.diario_columns (is_featured, published_at DESC) WHERE is_featured = true;

-- ---------------------------------------------------------------------------
-- 2. diario_comments — comentários em colunas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diario_comments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id         uuid        NOT NULL REFERENCES public.diario_columns(id) ON DELETE CASCADE,
  author_profile_id uuid        NOT NULL REFERENCES public.profiles(id),
  parent_comment_id uuid REFERENCES public.diario_comments(id) ON DELETE CASCADE,

  body              text        NOT NULL,
  like_count        integer     NOT NULL DEFAULT 0,
  is_hidden         boolean     NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dcom_column ON public.diario_comments (column_id, created_at DESC) WHERE is_hidden = false;

-- ---------------------------------------------------------------------------
-- 3. diario_likes — curtidas em colunas e comentários
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diario_likes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type       text        NOT NULL CHECK (target_type IN ('column','comment')),
  target_id         uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dl_target UNIQUE (profile_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_dl_target ON public.diario_likes (target_type, target_id);

-- ---------------------------------------------------------------------------
-- 4. diario_events — Encontros Constelação
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diario_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id      uuid        NOT NULL REFERENCES public.franchises(id),
  slug              text        NOT NULL UNIQUE,

  title             text        NOT NULL,
  deck              text,
  category          text,
  cover_image_url   text,

  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  timezone          text        DEFAULT 'America/Sao_Paulo',
  location          text,
  location_address  text,
  capacity          integer     NOT NULL CHECK (capacity > 0),

  -- Tier mínimo pra ver/participar
  min_tier          text CHECK (min_tier IN ('inicio','caminho','trilha','constelacao')),

  host_profile_ids  uuid[]      NOT NULL DEFAULT '{}',
  agenda_jsonb      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  faq_jsonb         jsonb       NOT NULL DEFAULT '[]'::jsonb,

  is_published      boolean     NOT NULL DEFAULT false,
  is_off_record     boolean     NOT NULL DEFAULT true,  -- não publicável em redes
  rsvp_count        integer     NOT NULL DEFAULT 0,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.diario_events IS
  'Encontros Constelação do Diário. Off-the-record por padrão. Tier mínimo controla visibilidade.';

CREATE INDEX IF NOT EXISTS idx_de_franchise ON public.diario_events (franchise_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_de_upcoming ON public.diario_events (starts_at) WHERE is_published = true AND starts_at > now();

-- ---------------------------------------------------------------------------
-- 5. diario_event_rsvp — confirmações de presença
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diario_event_rsvp (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid        NOT NULL REFERENCES public.diario_events(id) ON DELETE CASCADE,
  profile_id        uuid        NOT NULL REFERENCES public.profiles(id),

  status            text        NOT NULL DEFAULT 'confirmed'
                                CHECK (status IN ('confirmed','waitlist','canceled','no_show','attended')),

  guest_count       integer     NOT NULL DEFAULT 0 CHECK (guest_count >= 0 AND guest_count <= 2),
  guest_names       text[],

  confirmed_at      timestamptz NOT NULL DEFAULT now(),
  canceled_at       timestamptz,
  attended_at       timestamptz,

  CONSTRAINT uq_der_event_profile UNIQUE (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_der_event_status ON public.diario_event_rsvp (event_id, status);

-- ---------------------------------------------------------------------------
-- 6. diario_columnist_invites — convites pra virar colunista
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.diario_columnist_invites (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid        NOT NULL REFERENCES public.client_details(id),
  invited_by        uuid        NOT NULL REFERENCES public.profiles(id),
  proposed_category text,
  notes             text,
  status            text        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined','revoked')),
  responded_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dci_client ON public.diario_columnist_invites (client_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Trigger pra atualizar contadores
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diario_increment_like()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.target_type = 'column' THEN
    UPDATE public.diario_columns SET like_count = like_count + 1 WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'comment' THEN
    UPDATE public.diario_comments SET like_count = like_count + 1 WHERE id = NEW.target_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.diario_decrement_like()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF OLD.target_type = 'column' THEN
    UPDATE public.diario_columns SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.target_id;
  ELSIF OLD.target_type = 'comment' THEN
    UPDATE public.diario_comments SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.target_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_diario_like_inc ON public.diario_likes;
CREATE TRIGGER trg_diario_like_inc
  AFTER INSERT ON public.diario_likes
  FOR EACH ROW EXECUTE FUNCTION public.diario_increment_like();

DROP TRIGGER IF EXISTS trg_diario_like_dec ON public.diario_likes;
CREATE TRIGGER trg_diario_like_dec
  AFTER DELETE ON public.diario_likes
  FOR EACH ROW EXECUTE FUNCTION public.diario_decrement_like();
