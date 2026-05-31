# Mural · Schema & Queries de Integração

> Guia técnico pra ligar o `mural.html` ao banco de dados Supabase do Estúdio Mais.
> Cada bloco do HTML tem `data-source` + `data-field` apontando pra tabela/coluna.
> Este documento detalha as queries, RPCs e migrations necessárias.

**Layout:** mobile-first (single-column), vira 2 colunas em ≥1100px. Topbar com scroll horizontal nas abas em mobile.

---

## Convenções no HTML

| Atributo | Significado |
|----------|-------------|
| `data-source="tabela_x"` | Tabela ou RPC de origem (Supabase) |
| `data-source="rpc:nome_rpc"` | Chama RPC em vez de tabela direta |
| `data-where="..."` | Filtro SQL (em pseudo-código pra orientar a query) |
| `data-order="..."` | ORDER BY |
| `data-limit="N"` | LIMIT |
| `data-args='{...}'` | Argumentos pro RPC (JSON) |
| `data-field="coluna"` | Coluna a substituir no texto do elemento |
| `data-field="col\|formatter"` | Aplica formatter (ver tabela abaixo) |
| `data-template="row"` | Elemento usado como template — repetir 1× por row |
| `data-flag="is_me"` | Aplica classe extra (.me) quando boolean for true |
| `data-bucket="key"` | Item do array pertence ao bucket lógico `key` |

### Formatters

| Tag | Faz |
|-----|-----|
| `currency_brl` | Centavos → "R$ 1.000,00" |
| `currency_brl_short` | Centavos → "R$ 1k" / "R$ 1,8k" / "R$ 18.400" |
| `integer` | Number → "62" sem decimais |
| `time_ago` | Timestamp → "hoje, 8h12" / "ontem" / "2 dias atrás" |
| `weekday_short_time` | Timestamp → "ter · 16h" |
| `launch_label` | Timestamp → "Novo · esta semana" / "Novo · ontem" |
| `icon_for` | Mapeia valor enum → emoji (`conquista` → 🏆) |
| `prefix:texto` | Antepõe texto ao valor |
| `suffix:texto` | Anexa texto ao valor |
| `format:N unidades` | Substitui `N` pelo valor (ex: "replicada em 3 unidades") |
| `show_if:texto` | Mostra `texto` só se valor for truthy |

---

## Mapeamento por bloco

### Topbar · Score chip + popover
- **Tabela:** `profile_score_monthly` (✓ existe — migration 00152)
- **Query base:**
  ```sql
  SELECT total_score, premio_centavos, ranking_unidade,
         (total_score - LAG(total_score) OVER (ORDER BY year_month)) AS delta_vs_prev_month
    FROM profile_score_monthly
   WHERE profile_id = auth.uid()
     AND year_month = to_char(now(),'YYYY-MM')
   LIMIT 1;
  ```
- **KPI breakdown:** `profile_score_kpi_log` filtrado por `categoria IN ('execucao','relacionamento','vendas','cocriacao')` no mesmo mês.

---

### 1. Mensagem dos sócios
- **Tabela:** `partner_messages` ✦ **CRIAR**

```sql
CREATE TABLE public.partner_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id  uuid NOT NULL REFERENCES public.franchises(id),
  author_id     uuid NOT NULL REFERENCES public.profiles(id),
  body          text NOT NULL,
  pinned        boolean NOT NULL DEFAULT false,
  audience      text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','managers','professionals','franchisees')),
  published_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_partner_msg_published ON public.partner_messages (franchise_id, published_at DESC);
-- RLS: SELECT WHERE franchise_id IN allowed_franchises AND (expires_at IS NULL OR expires_at > now())
```

- **Query:**
  ```sql
  SELECT pm.*, p.full_name AS author_name, p.avatar_url, initials(p.full_name) AS author_initials
    FROM partner_messages pm
    JOIN profiles p ON p.id = pm.author_id
   WHERE pm.franchise_id = current_franchise_id()
     AND (pm.expires_at IS NULL OR pm.expires_at > now())
   ORDER BY pm.pinned DESC, pm.published_at DESC
   LIMIT 1;
  ```

---

### 2. Pipeline do dia (4 chips)
- **Origem:** `appointments` + `client_details` + `appointment_pre_brief`
- **RPC nova:** `get_employee_pipeline_summary(p_professional_id uuid, p_date date)`

```sql
CREATE OR REPLACE FUNCTION public.get_employee_pipeline_summary(
  p_professional_id uuid DEFAULT auth.uid(),
  p_date            date DEFAULT current_date
)
RETURNS TABLE (bucket text, count integer) AS $$
  -- 1ª visita: appointments.visit_number = 1 hoje
  SELECT 'primeira_visita'::text, COUNT(*)::integer
    FROM appointments
   WHERE professional_id = p_professional_id AND date = p_date AND visit_number = 1
  UNION ALL
  -- Janela Mágica: client_details.lifecycle_stage = 'janela_magica'
  SELECT 'janela_magica', COUNT(*)
    FROM appointments a
    JOIN client_details cd ON cd.id = a.client_id
   WHERE a.professional_id = p_professional_id AND a.date = p_date
     AND cd.lifecycle_stage = 'janela_magica'
  UNION ALL
  -- Zona de Perigo: ≥45 dias desde last_appointment_at
  SELECT 'zona_perigo', COUNT(*)
    FROM client_details cd
    JOIN appointments a ON a.client_id = cd.id AND a.professional_id = p_professional_id
   WHERE cd.last_appointment_at <= (now() - interval '45 days')
     AND cd.is_active = true
  UNION ALL
  -- Retorno pedido: appointment_pre_brief.risk_signal = 'asked_for_attention'
  SELECT 'retorno_pedido', COUNT(*)
    FROM appointment_pre_brief apb
   WHERE apb.professional_id = p_professional_id
     AND apb.risk_signal = 'asked_for_attention'
     AND apb.created_at >= now() - interval '7 days';
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

### 3. Briefing · 4 blocos
Todos os 4 sub-blocos populam de `appointment_pre_brief` (✓ existe — migration 00154) com filtros diferentes.

#### 3a. Saindo da Zona Premium / Zona de Perigo
```sql
SELECT cd.full_name AS client_name,
       CASE apb.risk_signal
         WHEN 'long_gap' THEN format('%s dias sem voltar', age_in_days)
         WHEN 'low_nps' THEN 'NPS últimos 2 atendimentos < 8'
         WHEN 'premium_downgrade' THEN format('ticket R$ %s → R$ %s', last_premium_ticket, current_avg_ticket)
       END AS risk_description
  FROM appointment_pre_brief apb
  JOIN client_details cd ON cd.id = apb.client_id
 WHERE apb.professional_id = auth.uid()
   AND apb.risk_signal IN ('long_gap','low_nps','premium_downgrade')
   AND apb.created_at >= current_date
 LIMIT 5;
```

#### 3b. Primeira visita · com fonte
```sql
SELECT cd.full_name AS client_name,
       format('%s · %s · %s', cd.acquisition_source, cd.referrer_name, cd.acquisition_note) AS source_description
  FROM appointments a
  JOIN client_details cd ON cd.id = a.client_id
 WHERE a.professional_id = auth.uid()
   AND a.date = current_date
   AND a.visit_number = 1;
```

> Requer `client_details.acquisition_source ENUM('indicacao','lead','parceria','porta')` + `referrer_name` + `acquisition_note`.
> Verificar se já existe em `00001_v2_complete_schema.sql`.

#### 3c. Toques pessoais · Janela Mágica
```sql
SELECT cd.full_name AS client_name,
       apb.upcoming_event_description
  FROM appointment_pre_brief apb
  JOIN appointments a ON a.id = apb.appointment_id
  JOIN client_details cd ON cd.id = apb.client_id
 WHERE a.professional_id = auth.uid()
   AND a.date = current_date
   AND apb.upcoming_event_date BETWEEN (current_date - 3) AND (current_date + 7)
   AND apb.upcoming_event_description IS NOT NULL;
```

#### 3d. Próxima semana · cuidado antecipado
Mesma query do 3c, com filtro `upcoming_event_date BETWEEN (current_date + 1) AND (current_date + 10)` e `a.date >= current_date + 1`.

---

### 4. Gincanas ativas
- **Tabela:** `gincanas` ✦ **CRIAR**

```sql
CREATE TABLE public.gincanas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id    uuid NOT NULL REFERENCES public.franchises(id),
  title           text NOT NULL,
  description     text NOT NULL,
  periodo_label   text NOT NULL,                      -- "Diária" · "Semanal" · "Mensal"
  premio_centavos integer NOT NULL CHECK (premio_centavos >= 0),
  premio_extra    text,                                -- ex: "+ SPA"
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','cancelled')),
  activated_by    uuid NOT NULL REFERENCES public.profiles(id),
  rule_key        text NOT NULL,                      -- ex: 'nps_10_count', 'janela_magica_close_count'
  metric_target   numeric,                            -- meta numérica opcional
  audience        text NOT NULL DEFAULT 'all',        -- ou unit_id específico
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gincanas_active ON public.gincanas (franchise_id, status, ends_at);
```

- **Query:**
  ```sql
  SELECT g.*, p.full_name AS activated_by_name, p.role AS activated_by_role
    FROM gincanas g
    JOIN profiles p ON p.id = g.activated_by
   WHERE g.franchise_id = current_franchise_id()
     AND g.status = 'active'
     AND now() BETWEEN g.starts_at AND g.ends_at
   ORDER BY g.ends_at ASC;
  ```

- **Minha posição:** RPC `get_my_gincana_position(p_gincana_id uuid)` retorna `{ position, current_value, leader_value, distance_to_next }`. Cálculo depende de `rule_key`.

---

### 5. Bonificações pontuais
- **Tabela:** `bonificacao_regras` ✦ **CRIAR**

```sql
CREATE TABLE public.bonificacao_regras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id    uuid NOT NULL REFERENCES public.franchises(id),
  rule_key        text NOT NULL,                      -- 'premium_first_visit', 'zona_perigo_recovery', etc
  valor_centavos  integer NOT NULL CHECK (valor_centavos >= 0),
  criterio        text NOT NULL,                      -- texto pra exibir ao profissional
  is_active       boolean NOT NULL DEFAULT true,
  display_order   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_bonif_rule_per_franchise ON public.bonificacao_regras (franchise_id, rule_key) WHERE is_active = true;
```

> Quando o profissional dispara um trigger (ex: fecha cliente Premium na 1ª visita), uma RPC server-side checa as regras ativas e cria `loyalty_transactions` correspondente.

---

### 6. Ranking ao vivo · Score Jornada
- **Tabela:** `profile_score_monthly` (✓ existe)
- **Query:**
  ```sql
  WITH unit_rank AS (
    SELECT psm.*,
           p.full_name AS profile_full_name,
           u.name      AS unit_name,
           (psm.profile_id = auth.uid()) AS is_me,
           ROW_NUMBER() OVER (ORDER BY psm.total_score DESC) AS rank
      FROM profile_score_monthly psm
      JOIN profiles p   ON p.id = psm.profile_id
      JOIN employee_details ed ON ed.profile_id = p.id
      JOIN units u      ON u.id = ed.unit_id
     WHERE psm.year_month   = to_char(now(),'YYYY-MM')
       AND psm.franchise_id = current_franchise_id()
  )
  SELECT * FROM unit_rank
   WHERE rank <= 5 OR is_me = true
   ORDER BY rank;
  ```

---

### 7. Vendas em destaque
- **RPC nova:** `get_top_sales_60d(p_franchise_id, p_limit)` — top 3 vendas de pacote nos últimos 60 dias.
- **RPC nova:** `get_top_first_visit_sales(p_franchise_id, p_min_value_cents, p_days, p_limit)`.

```sql
CREATE OR REPLACE FUNCTION public.get_top_sales_60d(
  p_franchise_id uuid DEFAULT current_franchise_id(),
  p_limit        integer DEFAULT 3
)
RETURNS TABLE (
  rank integer,
  professional_name text,
  professional_id uuid,
  package_name text,
  client_initials text,
  final_amount integer,
  paid_at timestamptz
) AS $$
  SELECT ROW_NUMBER() OVER (ORDER BY pmt.final_amount DESC)::integer AS rank,
         p.full_name AS professional_name,
         p.id AS professional_id,
         pkg.name AS package_name,
         initials(cli.full_name) AS client_initials,
         pmt.final_amount,
         pmt.created_at AS paid_at
    FROM payments pmt
    JOIN packages pkg ON pkg.id = pmt.package_id
    JOIN profiles p   ON p.id = pmt.professional_id
    JOIN client_details cli ON cli.id = pmt.client_id
   WHERE pmt.franchise_id = p_franchise_id
     AND pmt.created_at >= now() - interval '60 days'
     AND pmt.status = 'paid'
     AND pmt.package_id IS NOT NULL
   ORDER BY pmt.final_amount DESC
   LIMIT p_limit;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

### 8. Banco de ideias
- **Tabela:** `feature_ideas` (✓ existe — migration 00156) — **adaptar campos:**

```sql
ALTER TABLE public.feature_ideas
  ADD COLUMN IF NOT EXISTS visibility   text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','team','franchise','network')),
  ADD COLUMN IF NOT EXISTS likes_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replicated_units_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS author_unit_id uuid REFERENCES public.units(id);

-- Tabela auxiliar de curtidas
CREATE TABLE IF NOT EXISTS public.feature_idea_likes (
  idea_id    uuid REFERENCES public.feature_ideas(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, profile_id)
);
```

- **Query:**
  ```sql
  SELECT fi.*, p.full_name AS author_name, u.name AS author_unit_name
    FROM feature_ideas fi
    JOIN profiles p ON p.id = fi.author_id
    LEFT JOIN units u ON u.id = fi.author_unit_id
   WHERE fi.visibility IN ('team','franchise','network')
     AND fi.status IN ('approved','replicated')
   ORDER BY fi.likes_count DESC, fi.created_at DESC
   LIMIT 5;
  ```

---

### 9. Histórias & conquistas
- **Tabela:** `unit_stories` ✦ **CRIAR**

```sql
CREATE TABLE public.unit_stories (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id uuid NOT NULL REFERENCES public.franchises(id),
  unit_id      uuid REFERENCES public.units(id),                  -- NULL = toda a rede
  tipo         text NOT NULL CHECK (tipo IN ('conquista','novidade','marco','reconhecimento')),
  title        text NOT NULL,
  description  text NOT NULL,
  pinned       boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stories_published ON public.unit_stories (franchise_id, pinned DESC, published_at DESC);
```

---

### 10. Próximos treinamentos
- **Tabela:** `trainings` ✦ **CRIAR**

```sql
CREATE TABLE public.trainings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id  uuid NOT NULL REFERENCES public.franchises(id),
  title         text NOT NULL,
  description   text,
  scheduled_at  timestamptz NOT NULL,
  duration_min  integer NOT NULL DEFAULT 60,
  location      text,
  meeting_url   text,
  is_mandatory  boolean NOT NULL DEFAULT false,
  target_roles  text[] NOT NULL DEFAULT '{}',                     -- ex: '{professional,manager}'
  target_units  uuid[] NOT NULL DEFAULT '{}',                     -- vazio = todas
  created_by    uuid NOT NULL REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trainings_upcoming ON public.trainings (franchise_id, scheduled_at);
```

---

### 11. Novos procedimentos
- **Tabela:** `services` (✓ existe) — adicionar flag de destaque:

```sql
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until date,
  ADD COLUMN IF NOT EXISTS meta_obs text;                          -- "ticket médio: R$ 3.5k · margem 62%"

CREATE INDEX IF NOT EXISTS idx_services_featured ON public.services (is_featured, created_at DESC)
  WHERE is_featured = true;
```

---

### 12. Canal direto
- Link pra `/portal/chat` (existente). Sem query — só navegação.

---

## RLS — observações

Todas as tabelas novas devem respeitar o padrão do projeto:

```sql
ALTER TABLE public.partner_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_msg_select" ON public.partner_messages
  FOR SELECT TO authenticated
  USING (franchise_id = ANY (get_user_allowed_franchises()));

CREATE POLICY "partner_msg_insert" ON public.partner_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND franchise_id = ANY (get_user_allowed_franchises())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid()
        AND role IN ('franchise_owner','super_admin','regional_manager')
    )
  );
```

Aplicar o mesmo padrão pra `gincanas`, `bonificacao_regras`, `unit_stories`, `trainings`.

---

## Migrations sugeridas

Numeração contínua a partir da última (`00157`):

| # | Migration | Conteúdo |
|---|-----------|----------|
| 00158 | `mural_partner_messages.sql` | Tabela + RLS |
| 00159 | `mural_gincanas.sql` | Tabela + RLS + RPC `get_my_gincana_position` |
| 00160 | `mural_bonificacao_regras.sql` | Tabela + RLS + trigger awarding |
| 00161 | `mural_unit_stories.sql` | Tabela + RLS |
| 00162 | `mural_trainings.sql` | Tabela + RLS |
| 00163 | `mural_feature_ideas_extend.sql` | ALTER table + feature_idea_likes |
| 00164 | `mural_services_featured.sql` | ALTER table |
| 00165 | `mural_rpcs.sql` | get_employee_pipeline_summary + get_top_sales_60d + get_top_first_visit_sales |

---

## Frontend (Hari — referência)

O bind no React/Next vai parecer assim:

```tsx
// app/(dashboard)/mural/page.tsx (ou portal/mural)
import { createClient } from '@/lib/supabase/server'

export default async function MuralPage() {
  const supabase = await createClient()
  const [partnerMsg, pipeline, gincanas, ranking, ideias, stories, trainings, news] = await Promise.all([
    supabase.from('partner_messages').select('*, author:profiles(*)').limit(1),
    supabase.rpc('get_employee_pipeline_summary'),
    supabase.from('gincanas').select('*, activated_by:profiles(full_name)').eq('status','active'),
    supabase.from('profile_score_monthly').select('*, profile:profiles(full_name), unit:units(name)').order('total_score',{ascending:false}).limit(5),
    supabase.from('feature_ideas').select('*, author:profiles(full_name), unit:units(name)').eq('visibility','team').limit(5),
    supabase.from('unit_stories').select('*').order('pinned',{ascending:false}).limit(3),
    supabase.from('trainings').select('*').gte('scheduled_at', new Date().toISOString()).limit(4),
    supabase.from('services').select('*').eq('is_featured', true).order('created_at',{ascending:false}).limit(1),
  ])

  return <MuralClient data={{ partnerMsg, pipeline, gincanas, ranking, ideias, stories, trainings, news }} />
}
```

---

**Dúvidas?** Olhar:
- `mural.html` — protótipo com data-attributes
- `briefing.html`, `dashboard.html`, `score-detalhe.html` — outros prototypes do modo Profissional pra padrão visual
- `packages/supabase/migrations/00152_score_de_cuidado_schema.sql` — schema do Score (já existente)
- `packages/supabase/migrations/00154_appointment_pre_post_brief.sql` — brief pré/pós (já existente)
- `packages/supabase/migrations/00156_bug_reports_feature_ideas.sql` — feature_ideas (a estender)
