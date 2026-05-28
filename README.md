# Cuidado Contínuo · Pacote de Implementação

> **Para:** Steinhauser
> **De:** Danilo · 28/05/2026
> **Repo alvo:** `steinhauserhzs/estudio-mais` (branch a definir)
> **Tempo estimado:** 2-3 sprints (Fase 1 — destrava piloto Center Norte)

---

## TL;DR — o que é isso

Esse pacote contém **tudo que falta** pra rodar o **Cuidado Contínuo** (programa de acompanhamento pós-procedimento + Score de Cuidado da profissional + Diário Estúdio Mais) **em cima do código que você já construiu**.

**Boa notícia (descoberta crítica):** 90% já está no repo. Vc renomeou os tiers Bronze/Prata/Ouro/Diamante pra Início/Caminho/Trilha/Constelação (migration 00124). Tem `protocol_definitions`, `client_protocol_progress`, decision-engine com 6 regras, daily-recommendation, care-instructions, loyalty. **O que falta é popular dados, adicionar 1 regra no engine e construir ~4 telas novas.**

Detalhamento completo no Obsidian:
- `🧠 Cérebro de Contexto/Estúdio Mais - Estratégia/42 - Programa de Acompanhamento - Produto Âncora.md`
- `🧠 Cérebro de Contexto/Estúdio Mais - Estratégia/43 - Cuidado Contínuo - O Que Já Existe no App.md`
- `🧠 Cérebro de Contexto/Estúdio Mais - Estratégia/44 - Score de Cuidado - KPIs Prêmios e Co-Criação.md`

---

## Como navegar este pacote

```
cuidado-continuo-handoff/
├── README.md                          ← você está aqui
├── PROMPT-DEV.md                      ← prompt pra colar na IA antes de codar
├── migrations/                        ← SQLs prontos pra aplicar via MCP Supabase
│   ├── 00150_protocol_definitions_olhar_seed.sql
│   ├── 00151_service_care_instructions_olhar.sql
│   ├── 00152_score_de_cuidado_schema.sql
│   ├── 00153_score_de_cuidado_rls.sql
│   ├── 00154_appointment_pre_post_brief.sql
│   ├── 00155_objections_catalog.sql
│   └── 00156_bug_reports_feature_ideas.sql
├── decision-engine/                   ← TypeScript a colar em packages/decision-engine/src
│   ├── actions/dispatch-courtesy.ts
│   ├── rules/r7-magic-window.ts
│   └── scores/magic-window-propensity.ts
├── mobile-screens/                    ← Specs de telas Expo novas
│   └── (employee, client) — ver specs/mobile-screens.md
├── web-pages/                         ← Specs de páginas Next.js novas
│   └── (dashboard, portal) — ver specs/web-pages.md
└── specs/
    ├── mobile-screens.md              ← mapeamento de cada tela nova com referência ao HTML
    ├── web-pages.md
    └── prototype-links.md             ← URLs locais dos protótipos HTML pra você abrir
```

---

## Ordem de implementação (PR sequence)

### PR 1 · Dados — destrava piloto (1-2 dias)

**Migrations a aplicar nesta ordem:**
1. `00150_protocol_definitions_olhar_seed.sql` — popula 5 protocolos de Sobrancelha (Design, Brow Lamination, Lash Lifting, Tintura, Micropigmentação 3D)
2. `00151_service_care_instructions_olhar.sql` — popula `services.pre_care_instructions` e `post_care_instructions` para os 7 procedimentos do Bloco Olhar

**Trigger a criar (não está no pacote, escreve em cima):**
- Quando `appointments` finaliza com status=completed E service.procedure_key existe em protocol_definitions → criar `client_protocol_progress` automaticamente

**Validação:**
- Criar 1 appointment de Design com cliente teste · verificar criação de `client_protocol_progress` · verificar que o `protocol-progress.tsx` no Expo renderiza ações dos dias 1, 3, 5, 8, 15.

### PR 2 · Decision Engine — Janela Mágica (2-3 dias)

**Arquivos a copiar:**
- `decision-engine/scores/magic-window-propensity.ts` → `packages/decision-engine/src/scores/`
- `decision-engine/rules/r7-magic-window.ts` → `packages/decision-engine/src/rules/`
- `decision-engine/actions/dispatch-courtesy.ts` → `packages/decision-engine/src/actions/`

**Atualizar:**
- `packages/decision-engine/src/index.ts` — exportar score e regra novos
- `packages/decision-engine/src/rules/master-rules.ts` — aplicar R7 na cadeia
- `packages/decision-engine/src/actions/dispatcher.ts` — adicionar case `post_procedure_care` + procedure_key='design_sobrancelha' + days_since ∈ [8,30] → action='dispatch_courtesy'
- `packages/decision-engine/src/types/index.ts` — adicionar 'dispatch_courtesy' em ActionType

**Validação:**
- Teste unitário com signals simulando cliente Beatriz em D+8 do Design → action retornada deve ser `dispatch_courtesy` com payload `{courtesy_procedure_key: "tintura_sobrancelha"}`

### PR 3 · Score de Cuidado — schema + RLS (3-4 dias)

**Migrations:**
3. `00152_score_de_cuidado_schema.sql`
4. `00153_score_de_cuidado_rls.sql`
5. `00154_appointment_pre_post_brief.sql`
6. `00155_objections_catalog.sql`
7. `00156_bug_reports_feature_ideas.sql`

**Functions adicionais (não no pacote, escrever em cima):**
- `compute_monthly_score(profile_id, ano_mes)` — calcula score mensal
- `get_kpi_breakdown(profile_id, ano_mes)` — retorna 4 KPI categorias
- `award_score_premio(profile_id, ano_mes)` — credita prêmio em `loyalty_transactions` (já existe)

### PR 4 · Telas mobile do Modo Profissional (1-2 sprints)

**Novas telas em `apps/mobile/app/(employee)/`:**
- `briefing.tsx` — Briefing Diário (5 ações priorizadas) → ver `specs/mobile-screens.md` + protótipo `briefing.html`
- `pipeline.tsx` — Pipeline kanban de 6 colunas → ver protótipo `dashboard.html`
- `score.tsx` — Score completo + ranking + prêmios → ver protótipo `score-detalhe.html`
- `client-360.tsx` — Perfil 360° da cliente (expandir `client-file.tsx` existente) → ver protótipo `cliente-detalhe.html`

**Componente compartilhado:**
- `<ScoreChip />` — chip persistente do score com popover (ver protótipo nas telas profissionais)

### PR 5 · Telas mobile/web do Diário (1 sprint)

**Novas rotas em `apps/web/app/portal/diario/`:**
- `page.tsx` (hub de colunistas)
- `[slug]/page.tsx` (coluna aberta)
- `colunista/[id]/page.tsx` (perfil de colunista)
- `evento/[id]/page.tsx` (evento aberto)

**Ou em `apps/mobile/app/(client)/diario/`** se for nativo (decidir com Danilo).

Ver `specs/web-pages.md` + protótipos `colunistas.html`, `coluna.html`, `perfil-colunista.html`, `evento.html`.

---

## Decisões pendentes do Danilo (perguntar antes de implementar)

- [ ] **Diário Estúdio Mais** — implementar em Next.js (web/portal) ou Expo (mobile)?
- [ ] **Score de Cuidado UI** — primeiro web (dashboard admin) ou primeiro mobile (employee)?
- [ ] **Painel de fotos antes/depois** — usar Supabase Storage ou serviço externo (Cloudinary)?
- [ ] **Vídeo de consulta online** (Tier Cuidado/360°) — Daily.co, Whereby ou Zoom API?
- [ ] **Catálogo clínico do Lote 3** — revisão clínica oficial pendente (designer sênior + enfermeira do Estúdio)

---

## O que **NÃO** está no pacote (escopo de uma próxima rodada)

- Implementação dos 3 Tiers de venda (Essencial / Cuidado / 360°) — modelagem comercial, integração Asaas
- Pool de profissionais para consulta online (nutri / dermato / médica)
- Painel das Madrinhas v2 (vendedora de pacote) — já existe spec em doc 37
- Anamnese Premium tablet — já existe protótipo (`/Users/danilo/Documents/experiencia-premium-tablet/`) e doc 38, decidir se substitui `anamnese-v3` atual ou roda em paralelo

---

## Protótipos HTML (pra você abrir e ver o comportamento)

Servidor local rodando em http://127.0.0.1:8081 (subir com `python3 -m http.server 8081` na pasta `/Users/danilo/Documents/cuidado-continuo-design/`):

| Tela | Protótipo |
|---|---|
| 🏠 Vista da Cliente | http://127.0.0.1:8081/index.html |
| 💼 Briefing Hoje | http://127.0.0.1:8081/briefing.html |
| 📊 Pipeline de 28 clientes | http://127.0.0.1:8081/dashboard.html |
| 👤 Perfil 360° da cliente | http://127.0.0.1:8081/cliente-detalhe.html |
| ⭐ Score de Cuidado | http://127.0.0.1:8081/score-detalhe.html |
| 📰 Diário (hub) | http://127.0.0.1:8081/colunistas.html |
| 📰 Coluna aberta | http://127.0.0.1:8081/coluna.html |
| 📰 Perfil colunista | http://127.0.0.1:8081/perfil-colunista.html |
| 📰 Evento Constelação | http://127.0.0.1:8081/evento.html |

---

## Conexão com docs do Obsidian

| Doc | Quando consultar |
|---|---|
| 35 — App Análise Repo | overview do que existe |
| 36 — Playbook Padrões | snake_case, kebab-case, franchise_id, RLS — leia antes de criar qualquer migration |
| 42 — Cuidado Contínuo Produto-Âncora | tese comercial e decisões fechadas |
| 43 — O Que Já Existe no App | mapeamento do código atual, schemas, decision-engine |
| 44 — Score de Cuidado + Prêmios | KPIs, fórmulas, escalas de prêmio, campos obrigatórios |
| Beneficios_Procedimentos_Lote3_Sobrancelha | catálogo clínico que vira seed dos protocolos |

---

## Sequência sugerida pra primeira sessão

1. Abrir http://127.0.0.1:8081/index.html e navegar pelas 9 telas (15 min)
2. Ler docs 42, 43, 44 do Obsidian (45 min)
3. Aplicar migrations PR 1 em ambiente de dev (1h)
4. Confirmar que protocolo Design cria `client_protocol_progress` automático após appointment (testar via SQL editor)
5. Marcar reunião com Danilo pra alinhar decisões pendentes (acima)

---

## Frase-âncora

> *"Não é construir o Cuidado Contínuo. É ativar o que já tá lá."*

Boa implementação. Qualquer dúvida, fala comigo direto.

— Danilo
