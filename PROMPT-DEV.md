# Prompt pro Dev — Cuidado Contínuo · Implementação

> Cole este prompt na sua IA (Claude Code / Cursor / etc) antes de começar a implementar.
> Ele dá contexto completo em 1 mensagem.

---

## Contexto

Você vai implementar o **Cuidado Contínuo** no app do Estúdio Mais (`steinhauserhzs/estudio-mais`). Esse é um produto novo que será vendido junto com qualquer pacote da clínica — um sistema de acompanhamento pós-procedimento (régua D+0 a D+45 por procedimento) com Score de Cuidado da profissional (KPIs + prêmios em dinheiro) e um Diário editorial (clientes Premium viram colunistas).

**Descoberta crítica:** 90% do código já está pronto no repo. A migration `00124_rename_loyalty_tiers_journey.sql` já renomeou tiers Bronze/Prata/Ouro/Diamante para Início/Caminho/Trilha/Constelação. Já existe:

- `protocol_definitions` + `client_protocol_progress` (régua de cuidado por procedimento)
- `packages/decision-engine` com 6 regras R1-R6 e scores (return-propensity, churn-risk)
- `apps/mobile/app/(client)/protocol-progress.tsx`, `daily-recommendation.tsx`, `care-instructions.tsx`, `loyalty.tsx`
- `loyalty_transactions` + função `award_daily_action_points()` (idempotente)

**O que falta:** popular dados (7 protocolos do bloco Sobrancelha), adicionar 1 score + 1 regra + 1 action no decision-engine (Janela Mágica), criar 4 telas novas no modo profissional (Briefing, Pipeline, Score, expandir Client-360), e criar o Diário (decidir se mobile ou web).

## Padrões do repo (respeitar SEMPRE)

- **SQL:** `snake_case`, migrations numeradas (`00150_descricao.sql`), schema em arquivo separado de RLS (`00153_*_rls.sql`)
- **Tabelas multi-tenant:** ter `franchise_id` com FK pra `franchises`
- **Functions:** `SECURITY DEFINER` quando necessário, sempre com check de `auth.uid()`
- **TypeScript:** TS strict, monorepo pnpm + turbo
- **Rotas mobile:** kebab-case Expo Router (`apps/mobile/app/(client)/`, `apps/mobile/app/(employee)/`)
- **Rotas web:** Next.js 15 App Router (`apps/web/app/(dashboard)/`, `apps/web/app/portal/`)
- **Decision engine:** TypeScript em `packages/decision-engine/src/{actions,rules,scores,personas,state}/`

## Pacote de implementação

Os arquivos prontos estão em `/Users/danilo/Documents/cuidado-continuo-handoff/`:

```
migrations/
  00150_protocol_definitions_olhar_seed.sql   ← seeds dos 5 protocolos críticos
  00151_service_care_instructions_olhar.sql   ← popula services.pre/post_care
  00152_score_de_cuidado_schema.sql           ← 3 tabelas do Score
  00153_score_de_cuidado_rls.sql              ← RLS
  00154_appointment_pre_post_brief.sql        ← campos obrigatórios pré/pós atendimento
  00155_objections_catalog.sql                ← catálogo verbatim de objeções
  00156_bug_reports_feature_ideas.sql         ← programa de co-criação

decision-engine/
  scores/magic-window-propensity.ts           ← novo score
  rules/r7-magic-window.ts                    ← nova regra
  actions/dispatch-courtesy.ts                ← nova action

specs/
  mobile-screens.md                           ← spec detalhado das 4 telas novas
```

## Ordem de implementação (PRs sugeridos)

**PR 1 · Dados (1-2 dias)**
1. Aplicar migrations 00150 e 00151 via MCP Supabase em dev
2. Criar trigger: `appointments.status = 'completed'` AND service tem `procedure_key` → criar `client_protocol_progress` automaticamente
3. Testar com 1 cliente fictícia: agendar Design de Sobrancelha → completar → verificar que `daily_actions` aparecem no `protocol-progress.tsx`

**PR 2 · Decision Engine (2-3 dias)**
1. Copiar 3 arquivos TS pra `packages/decision-engine/src/`
2. Atualizar `index.ts` exportando novos módulos
3. Atualizar `types/index.ts` adicionando `'dispatch_courtesy'` em `ActionType`
4. Atualizar `rules/master-rules.ts` chamando `enforceR7MagicWindow` na cadeia (entre R3 e R4)
5. Atualizar `actions/dispatcher.ts` consumindo `buildDispatchCourtesyAction` quando state corresponder
6. Testes unitários no `__tests__/`

**PR 3 · Score schema (3-4 dias)**
1. Aplicar migrations 00152-00156
2. Criar functions:
   - `compute_monthly_score(profile_id, year_month)` — calcula score mensal
   - `get_kpi_breakdown(profile_id, year_month)` — retorna 4 categorias
   - `award_score_premio(profile_id, year_month)` — cria `loyalty_transaction` se ainda não pago
   - `next_best_actions_for_professional(profile_id, scope, limit)` — top N ações priorizadas
3. Cron job semanal: snapshot ranking unidade + rede

**PR 4 · Mobile Modo Profissional (1-2 sprints)**
- Ver `specs/mobile-screens.md`
- Criar `<ModeBar />` e `<ScoreChip />` compartilhados primeiro
- Depois `briefing.tsx`, `pipeline.tsx`, `score.tsx`, expandir `client-file.tsx`

**PR 5 · Diário (1 sprint, depois de decisão mobile vs web)**
- Ver `specs/mobile-screens.md` (seção Diário) e protótipos em http://127.0.0.1:8081/

## Protótipos visuais

Servidor local em http://127.0.0.1:8081 (rodar `python3 -m http.server 8081` em `/Users/danilo/Documents/cuidado-continuo-design/`):

- index.html · Vista da Cliente (Beatriz D+8)
- briefing.html · Briefing Hoje (Lene · 5 ações)
- dashboard.html · Pipeline 28 clientes
- cliente-detalhe.html · Perfil 360° (Elaine)
- score-detalhe.html · Score completo + prêmios
- colunistas.html · Diário hub
- coluna.html · Coluna aberta
- perfil-colunista.html · Perfil colunista
- evento.html · Encontro Constelação

## Documentação completa no Obsidian

```
/Users/danilo/Documents/Obsidian/Clayton/🧠 Cérebro de Contexto/Estúdio Mais - Estratégia/
├── 36 - App - Playbook de Padrões do Código.md    ← LEIA ANTES DE QUALQUER MIGRATION
├── 42 - Programa de Acompanhamento - Produto Âncora.md   ← tese comercial
├── 43 - Cuidado Contínuo - O Que Já Existe no App.md     ← mapa do código atual
└── 44 - Score de Cuidado - KPIs Prêmios e Co-Criação.md  ← KPIs e fórmulas

/Users/danilo/Documents/Obsidian/Clayton/
└── Beneficios_Procedimentos_Lote3_Sobrancelha.md  ← catálogo clínico (revisar com clínica antes)
```

## Decisões pendentes (perguntar ao Danilo)

- [ ] Diário em mobile (Expo) ou web (Next.js portal)?
- [ ] Score: priorizar UI web (admin) ou mobile (employee)?
- [ ] Catálogo clínico Lote 3 precisa revisão da designer sênior + enfermeira antes de production
- [ ] Vídeo consulta online (Tier Cuidado/360°): Daily.co, Whereby ou Zoom?
- [ ] Antes/depois fotos: Supabase Storage ou Cloudinary?

## Sequência da primeira sessão

1. Ler README.md completo (15 min)
2. Abrir todos os protótipos em http://127.0.0.1:8081/ e navegar (20 min)
3. Ler docs 42, 43, 44 do Obsidian (45 min)
4. Reunião com Danilo sobre as decisões pendentes (30 min)
5. Aplicar migration 00150 + 00151 em ambiente dev (1h)
6. Testar fluxo Design → protocol-progress aparece no app cliente (30 min)

**Total: ~3h pra ter o piloto técnico rodando.**

---

> *"Não é construir o Cuidado Contínuo. É ativar o que já tá lá."*

Boa implementação. Qualquer dúvida, fala com o Danilo direto.
