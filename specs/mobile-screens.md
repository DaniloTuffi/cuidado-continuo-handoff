# Mobile Screens · Cuidado Contínuo

Specs das telas novas pro app Expo. Cada tela tem:
- **Path** no Expo Router
- **Protótipo HTML** de referência (abrir antes de implementar)
- **Tabelas/queries** que consome
- **Componentes** que pode reaproveitar
- **Decisões pendentes**

---

## 🆕 `apps/mobile/app/(employee)/briefing.tsx`

**Substitui:** nada (tela nova)
**Protótipo:** http://127.0.0.1:8081/briefing.html

### O que faz

Tela inicial do Modo Profissional ao abrir o app. Mostra as 5 ações priorizadas do dia + score chip + memória das clientes do dia.

### Layout (de cima pra baixo)

1. **Switcher 2 níveis** (componente compartilhado `<ModeBar />`) — Modo Cliente | Modo Profissional + sub-nav Briefing/Pipeline/Score/Diário
2. **Score chip** persistente (clica e abre popover)
3. **Header pessoal:** "Bom dia, segunda · 28 de maio" / "Lene Souza ✦" / "Designer · Center Norte · 18 clientes ativas"
4. **Stats grid 4 cards:** Score · Ações hoje · NPS médio · Recompras mês
5. **Briefing card** — 5 ações priorizadas (com cor por prioridade)
6. **Próximas da semana** card — 3 itens
7. **Score Card** (sidebar) — versão compacta
8. **Memory card** — 5 clientes do dia com lembrete pessoal

### Queries Supabase

```sql
-- 5 ações priorizadas
SELECT * FROM next_best_actions_for_professional(auth.uid(), 'today', 5);
-- (function nova — usa decision-engine output, ranqueia por priority desc)

-- Stats do dia
SELECT * FROM profile_daily_stats(auth.uid(), CURRENT_DATE);
-- (function nova — agrega score parcial do mês corrente, NPS, recompras, ações executadas)

-- Memória das clientes de hoje
SELECT c.id, c.full_name, c.memory_notes, a.scheduled_at
FROM appointments a
JOIN client_details c ON c.id = a.client_id
WHERE a.professional_id = auth.uid()
  AND a.scheduled_at::date = CURRENT_DATE
ORDER BY a.scheduled_at;
```

### Componentes a criar/reutilizar

- `<ModeBar mode="profissional" subActive="briefing" />` — compartilhado em todas as telas profissionais
- `<ScoreChip />` — chip + popover (compartilhado)
- `<ActionItem priority="high|med|low" />` — card de ação
- `<StatCard label value delta />` — já pode existir

### Tabela `next_best_actions_log`

Nova tabela pra registrar **quais ações foram sugeridas, executadas, ignoradas** — alimenta KPI de Execução do Score.

```sql
CREATE TABLE next_best_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid REFERENCES profiles(id),
  client_id uuid REFERENCES client_details(id),
  action_type text NOT NULL,
  suggested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','executed','ignored','snoozed')),
  executed_at timestamptz,
  payload jsonb DEFAULT '{}'
);
```

### Decisão pendente

- A ação "Confirmar cortesia" leva pra chat in-app ou pra modal de envio de mensagem? (Sugerido: modal com template editável)

---

## 🆕 `apps/mobile/app/(employee)/pipeline.tsx`

**Protótipo:** http://127.0.0.1:8081/dashboard.html

### O que faz

Pipeline (kanban) com 6 colunas das clientes ativas da profissional em jornada.

### Colunas

1. 🌱 **1ª Visita** (D+1 a D+7)
2. ⚡ **Janela Mágica** (D+8 a D+30 sem 2ª compra)
3. 📦 **Em Pacote** (sessões 1-5)
4. 🔄 **Meio do Pacote** (sessão 6)
5. 🔐 **Penúltima Sessão** (sessão N-1 de N)
6. ✨ **Constelação** (Premium consolidada)

### Query base

```sql
SELECT
  c.id, c.full_name, c.tier_id, c.loyalty_points,
  cpp.protocol_definition_id, cpp.started_at, cpp.expected_end_at,
  cpp.daily_log, cpp.status,
  -- Categorizar em coluna do pipeline
  CASE
    WHEN cpp.status = 'active' AND now()::date - cpp.started_at::date BETWEEN 0 AND 7 THEN 'primeira_visita'
    WHEN cpp.status = 'active' AND now()::date - cpp.started_at::date BETWEEN 8 AND 30
         AND c.total_purchases = 1 THEN 'janela_magica'
    -- ... outros estados
  END AS pipeline_column
FROM client_details c
JOIN appointments a ON a.client_id = c.id
LEFT JOIN client_protocol_progress cpp ON cpp.client_id = c.id AND cpp.status = 'active'
WHERE a.professional_id = auth.uid()
ORDER BY a.scheduled_at DESC;
```

### Filtros funcionais

- Janela Mágica · Em Pacote · Bloco do Olhar · Por procedimento · Ordenar
- Botão "Todas" reseta

### Cards arrastáveis

Cards do pipeline são clicáveis (abrem modal de detalhe) e tem botões diretos (Mensagem · WhatsApp · Ligar · Áudio). **NÃO** são draggable no MVP (só visual).

### Componentes

- `<PipelineColumn title count subtitle>{cards}</PipelineColumn>`
- `<ClientCard priority="high|med|low" />`
- `<ClientDetailModal />` (já tem similar em `client-file.tsx`, evoluir)

---

## 🆕 `apps/mobile/app/(employee)/score.tsx`

**Protótipo:** http://127.0.0.1:8081/score-detalhe.html

### O que faz

Página completa do Score de Cuidado. Hero com ring animado · breakdown KPIs · escala de prêmios · ranking unidade · histórico 6 meses · bugs/ideias com prêmio.

### Queries

```sql
-- Score atual + breakdown
SELECT * FROM compute_monthly_score(auth.uid(), to_char(now(), 'YYYY-MM'));

-- KPIs por categoria
SELECT * FROM get_kpi_breakdown(auth.uid(), to_char(now(), 'YYYY-MM'));

-- Histórico 6 meses
SELECT year_month, total_score, premio_centavos
FROM profile_score_monthly
WHERE profile_id = auth.uid()
ORDER BY year_month DESC LIMIT 6;

-- Ranking unidade
SELECT psm.profile_id, p.full_name, psm.total_score, psm.premio_centavos
FROM profile_score_monthly psm
JOIN profiles p ON p.id = psm.profile_id
WHERE psm.franchise_id = (SELECT franchise_id FROM profiles WHERE id = auth.uid())
  AND psm.year_month = to_char(now(), 'YYYY-MM')
ORDER BY psm.total_score DESC;

-- Bugs e ideias da profissional
SELECT * FROM bug_reports WHERE reporter_profile_id = auth.uid() ORDER BY created_at DESC;
SELECT * FROM feature_ideas WHERE reporter_profile_id = auth.uid() ORDER BY created_at DESC;
```

### Decisão pendente

- Ring animado: usar `react-native-svg` (recomendado) ou animação CSS-equivalente?

---

## 🔄 Expandir `apps/mobile/app/(employee)/client-file.tsx` → `client-360.tsx`

**Protótipo:** http://127.0.0.1:8081/cliente-detalhe.html

### O que adicionar à tela existente

Atualmente `client-file.tsx` já existe (vi no repo). Adicionar:

- **Hero com foto + tier badge** (Início/Caminho/Trilha/Constelação)
- **6 stats:** LTV total · Visitas · NPS médio · Indicações · Eventos · Colunas Diário
- **Tabs:** Visão geral · Histórico · Memória · Procedimentos · Diário · Conexões
- **Pull quote** central com citação verbatim da cliente
- **Memória detalhada** com 6 categorias (Família, Trabalho, Receios, Preferências, Saúde, Datas)
- **Linha do tempo 90 dias** com eventos
- **Antes/Depois** placeholder (Storage Supabase)
- **Sidebar:** Tier card · Próximas ações sugeridas · Painel Hormonal (semana) · Última coluna do Diário

### Decisão pendente

- A tabela `client_details.memory_notes` é texto livre. Migrar pra `client_memory_categories` estruturado? (Recomendo: deixar `memory_notes` como fallback e adicionar tabela nova `client_memory_facts` com category enum)

---

## 🆕 `apps/mobile/app/(client)/diario/` — Diário Estúdio Mais

> **DECISÃO PENDENTE:** Diário em mobile (Expo) ou web (Next.js portal)?
> Recomendação: web (`apps/web/app/portal/diario/`) — porque é leitura longa, melhor em browser.

### Páginas (se for Expo)

- `apps/mobile/app/(client)/diario/index.tsx` → http://127.0.0.1:8081/colunistas.html
- `apps/mobile/app/(client)/diario/[slug].tsx` → http://127.0.0.1:8081/coluna.html
- `apps/mobile/app/(client)/diario/colunista/[id].tsx` → http://127.0.0.1:8081/perfil-colunista.html
- `apps/mobile/app/(client)/diario/evento/[id].tsx` → http://127.0.0.1:8081/evento.html

### Tabelas novas necessárias

```sql
-- Colunas do Diário
CREATE TABLE diario_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_profile_id uuid REFERENCES profiles(id),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  deck text,
  body_markdown text NOT NULL,
  category text NOT NULL,
  cover_image_url text,
  published_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  is_featured boolean DEFAULT false,
  edition_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE diario_comments (...);
CREATE TABLE diario_likes (...);
CREATE TABLE diario_events (
  id uuid PRIMARY KEY,
  title text, deck text, location text, capacity int, ...
);
CREATE TABLE diario_event_rsvp (...);
CREATE TABLE diario_columnist_invites (
  -- Profissional convida cliente Trilha/Constelação a virar colunista
);
```

### Decisão pendente

- Editor de coluna: rich text simples no app, ou redirecionar pra um editor web?
- Eventos: integrar com Google Calendar ou só interno?

---

## 🆕 `<ScoreChip />` componente compartilhado

**Protótipo:** chip aparece nos protótipos briefing.html · dashboard.html · cliente-detalhe.html

### Onde reaproveitar

- briefing.tsx (sub-nav: Briefing)
- pipeline.tsx (sub-nav: Pipeline)
- client-360.tsx (sub-nav: Pipeline ▸ Nome)
- score.tsx (não mostra — já está nele)

### Comportamento

- Mostra ⭐ + score atual + tendência (↑6 = +6 vs mês anterior)
- Click expande popover com breakdown rápido + prêmio + botão "Ver Score completo →"
- Atualiza em tempo real conforme score muda (re-fetch a cada 5min via React Query)

### Implementação

```tsx
import { useScoreSummary } from '@/lib/hooks/useScoreSummary';

export function ScoreChip() {
  const { data: score } = useScoreSummary(); // hook que faz query da function get_kpi_breakdown
  const [open, setOpen] = useState(false);

  if (!score) return null;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.chip}>
        <Text style={styles.star}>⭐</Text>
        <Text style={styles.value}>{score.total_score}</Text>
        <Text style={styles.trend}>↑{score.trend_vs_last_month}</Text>
      </Pressable>
      <ScorePopover visible={open} onClose={() => setOpen(false)} score={score} />
    </>
  );
}
```

---

## Ordem sugerida de implementação mobile

1. **`<ModeBar />`** (compartilhado) — base de navegação
2. **`<ScoreChip />`** (compartilhado) — usado em 3 telas
3. **`briefing.tsx`** — tela inicial profissional
4. **`pipeline.tsx`** — kanban
5. **Expandir `client-file.tsx`** — perfil 360°
6. **`score.tsx`** — score completo
7. **Diário** (decidir mobile vs web primeiro)

Estimativa: 2-3 sprints (4-6 semanas) com 1 dev front-end dedicado.
