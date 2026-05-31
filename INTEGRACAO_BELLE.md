# Integração com Belle — Cuidado Contínuo 100% funcional

> Este documento explica como o **Cuidado Contínuo** (Briefing, Pipeline, Score, Diário) consome dados que chegam do **Belle SaaS** via ETL existente. Sem mudança no contrato Belle. Sem tabelas paralelas.

---

## TL;DR

**O Cuidado Contínuo é uma camada de inteligência em cima dos dados que o Belle já alimenta no Supabase.** Mesmo grafo de dados que o app de produção usa (`appointments`, `client_details`, `employee_details`, `units`, `services`, `client_packages`, `package_sessions`). Nada de schema fantasma.

---

## Fluxo de dados (Belle → Supabase → Telas)

```
Belle API por loja (com token POR UNIT)
        ↓
scripts/belle-etl/sync/00-run-all.ts (cron Vercel ou pg_cron)
        ↓
Tabelas Supabase normalizadas:
  appointments  ←  agendamentos
  client_details ← clientes
  employee_details ← profissionais
  client_packages + package_sessions ← pacotes vendidos
  services ← catálogo
        ↓
Trigger appointment.status → completed dispara
  appointment_completion_trigger() (migration 00162)
        ↓
Cria automaticamente client_protocol_progress
  (régua D+0 a D+45 do procedimento)
        ↓
decision-engine processa scores:
  return-propensity · magic-window-propensity · churn-risk
        ↓
Empilha ações em decision_actions_queue
  com priority, payload, reason_code
        ↓
Telas mobile/web LEEM via RPC:
  next_best_actions_for_professional()  → Briefing
  pipeline_clients_for_professional()    → Pipeline
  pipeline_clients_for_unit()            → Web admin
  compute_monthly_score()                → Score
```

---

## Migrations a aplicar (em ordem)

```bash
00150_protocol_definitions_olhar_seed.sql      # ✅ Steinhauser já aplicou
00151_service_care_instructions_olhar.sql      # ✅ idem
00152_score_de_cuidado_schema.sql              # ✅ idem
00153_score_de_cuidado_rls.sql                 # ✅ idem
00154_appointment_pre_post_brief.sql           # ✅ idem
00155_objections_catalog.sql                   # ✅ idem
00156_bug_reports_feature_ideas.sql            # ✅ idem
00157_anamnese_premium_sessions.sql            # ✅ Steinhauser criou
00158_pipeline_functions.sql                   # ⏳ pendente (PR 4)
00159_diario_schema.sql                        # ⏳ pendente (PR 5)
00160_diario_rls.sql                           # ⏳ pendente (PR 5)
00161_client_memory_facts.sql                  # ⏳ pendente (PR 6)
00162_cuidado_continuo_schema_fixes.sql        # ⏳ pendente — RECONCILIA SCHEMA
```

**A 00162 é o mais importante** — ela ajusta tudo pra usar o schema real:
- Adiciona colunas faltantes em `client_details` (bio, age, city, occupation, memory_notes, ltv_centavos derivada)
- Adiciona colunas em `profiles` (bio, role_label, tier_label)
- **Substitui `next_best_actions_log` pela `decision_actions_queue` existente** (drop da tabela paralela)
- Reescreve `next_best_actions_for_professional` lendo de `decision_actions_queue`
- Reescreve `pipeline_clients_for_professional` com schema real (`employee_id`, `appointments.date+start_time`, `package_sessions`)
- Adiciona `pipeline_clients_for_unit` para gerente
- Cria view `client_procedure_summary` agregando appointments concluídos
- Cria function `client_timeline_recent` que junta visitas + eventos + colunas
- Cria function `diario_top_columnists`
- Adiciona trigger `appointment_completion_trigger` que cria `client_protocol_progress` automaticamente
- Implementa esboço de `compute_monthly_score` lendo dos pesos das 4 categorias

---

## O que falta pra dados de cliente fluírem do Belle

Hoje o ETL roda apenas:
- `01-services-from-api` (catálogo)
- `02-employees-from-api` (funcionários da franqueadora)
- `03-franqueadas-from-api` (lista de lojas)

**Não roda sync de clientes/agendamentos/vendas** porque o token da franqueadora não tem acesso.

### Pra ativar:
1. **Cada franqueada gera token Belle dela** no painel próprio
2. **Adicionar variáveis de ambiente no Vercel:**
   ```
   BELLE_API_TOKEN_CENTER_NORTE=…
   BELLE_API_TOKEN_PAULISTA=…
   BELLE_API_TOKEN_CIDADE_JARDIM=…
   ```
3. **Criar `scripts/belle-etl/sync/04-multi-store-sync.ts`** que itera as units e usa o token correspondente
4. **Adicionar no cron `00-run-all.ts`** o passo 04
5. **Agendar cron** no Vercel (`vercel.json` cron) ou no Postgres (`pg_cron`)

A partir daí, novos appointments concluídos disparam o trigger e populam protocolos automaticamente.

---

## Como cada tela lê os dados

### Briefing Diário (`(employee)/briefing.tsx`)

```typescript
const emp = await getMyEmployee(profile.id);        // employee_details lookup
const actions = await getNextActions(profile.id);    // decision_actions_queue
const appts = await getTodayAppointments(emp.id);    // appointments.date = TODAY
const score = await getMyScoreSummary(profile.id);   // profile_score_monthly
```

### Pipeline (`(employee)/pipeline.tsx`)

```typescript
const clients = await getPipeline(profile.id);
// → RPC pipeline_clients_for_professional(profile_id)
// internamente:
//   JOIN appointments ap ON ap.employee_id = (SELECT id FROM employee_details WHERE profile_id = $1)
//   JOIN client_protocol_progress cpp (ativos)
//   JOIN package_sessions ps (não client_sessions inexistente)
//   categoriza em 6 colunas por days_since e session_current
```

### Score (`(employee)/score.tsx`)

```typescript
// Lê profile_score_monthly (já calculado por compute_monthly_score)
// Ranking unidade: profile_score_monthly WHERE franchise_id = profile.franchise_id
// Histórico: ORDER BY year_month DESC LIMIT 6
// Co-criação: bug_reports + feature_ideas WHERE reporter = profile.id
```

### Bug Report / Idea Submit

```typescript
const emp = await getMyEmployee(profile.id);
await reportBug({
  profileId, unitId: emp.unit_id,    // unit_id resolve franchise via lookup
  title, description, ...
});
```

### Diário (`(client)/diario/*`)

```typescript
// Hub: diario_columns WHERE is_draft = false ORDER BY published_at DESC
// Coluna aberta: diario_columns WHERE slug = $1
//                + diario_comments + diario_likes
// Perfil colunista: profiles + agregação de diario_columns
// Evento: diario_events + diario_event_rsvp
//   tier mínimo controlado por function tier_rank_of_profile(auth.uid())
```

---

## Schema Belle → Cuidado Contínuo (mapeamento)

| Belle (Source) | Supabase normalizado | Usado por |
|---|---|---|
| `Cliente` | `client_details` + `profiles` | Briefing, Pipeline, Cliente 360°, Diário |
| `Funcionário` | `employee_details` + `profiles` | Todas as telas (employee) |
| `Loja` | `units` (FK → franchises) | Multi-tenancy de queries |
| `Agendamento` | `appointments` | Briefing (today), Pipeline (cohort 180d), trigger protocolo |
| `Serviço` | `services` (com `belle_code` mapeando para `procedure_key`) | Pipeline (nome), regra clínica |
| `Pacote vendido` | `client_packages` + `package_sessions` | Pipeline (session_current vs total) |
| `Venda` | `payments` (Belle) + `loyalty_transactions` (interno) | Score, Prêmios |

**Belle.belle_code** = chave de ouro. É o que liga o catálogo do Belle aos protocolos do Cuidado Contínuo. Cada protocol_definition tem `procedure_key` que bate com `services.belle_code`. Trigger de appointment usa isso pra disparar protocolo correto.

---

## Decision Engine — quem popula `decision_actions_queue`

Job recorrente (a criar em `apps/web/app/api/cron/decision-engine/route.ts`):

```typescript
// Roda em cron Vercel a cada 1h
import { DecisionEngine } from "@estudio-mais/decision-engine";

const engine = new DecisionEngine(weights);

for (const client of activeClients) {
  const signals = await collectSignals(client);  // appointments, protocols, scores
  const { action, blocks } = await engine.nextBestAction(client.id, signals);

  if (action.actionType !== "do_nothing") {
    await supabase.from("decision_actions_queue").insert({
      client_id: client.id,
      action_type: action.actionType,
      channel: action.channel,
      priority: action.priority,
      reason_code: action.reasonCode,
      payload: {
        title: action.humanReadable,
        description: action.payload?.description,
        cta_label: action.payload?.cta_label,
        cta_kind: action.payload?.cta_kind,
        context_tag: action.payload?.context_tag,
      },
      unit_id: client.preferred_unit_id,
      scheduled_for: new Date().toISOString(),
    });
  }
}
```

Esse cron alimenta as filas que aparecem no Briefing Hoje das profissionais. As 6 regras mestras (R1-R6) + R7 Janela Mágica já são aplicadas internamente pelo `nextBestAction()`.

---

## Score mensal — como recalcular

```sql
-- Manualmente (teste)
SELECT public.compute_monthly_score('<profile_id>', '2026-05');

-- Cron diário (Vercel cron / pg_cron) recalcula a cada noite
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT profile_id FROM employee_details WHERE is_active LOOP
    PERFORM public.compute_monthly_score(r.profile_id, to_char(now(), 'YYYY-MM'));
  END LOOP;
END $$;
```

Quando `total_score` >= 70, função grava `premio_centavos` automaticamente. Pra pagar o prêmio, criar `loyalty_transactions` apontando pra `profile_score_monthly.id` via outro job.

---

## Checklist de validação pós-deploy

Após aplicar 00158-00162 + mergear telas, validar em dev:

- [ ] Criar 1 cliente teste no Belle
- [ ] Agendar Design de Sobrancelha pra essa cliente com employee de teste
- [ ] Marcar appointment como `completed`
- [ ] Confirmar que `client_protocol_progress` foi criado (1 row)
- [ ] Confirmar que `protocol-progress.tsx` mostra as `daily_actions` D+1
- [ ] Em D+8 simulado (UPDATE appointments SET date = CURRENT_DATE - 8), rodar cron do decision-engine
- [ ] Confirmar que aparece ação `dispatch_courtesy` em `decision_actions_queue` com payload da Tintura
- [ ] Login como employee → ver ação no Briefing Hoje
- [ ] Confirmar Pipeline mostra a cliente na coluna "Janela Mágica"
- [ ] Rodar `compute_monthly_score()` pra esse employee
- [ ] Confirmar Score chip mostra valor não-zero

---

## Pendências conhecidas

- [ ] `04-multi-store-sync.ts` precisa ser escrito (sync de appointments/vendas com token POR LOJA)
- [ ] Cron job de decision-engine ainda não existe — escrever em `apps/web/app/api/cron/`
- [ ] `compute_monthly_score` tem placeholder para Vendas (75 hardcoded) — precisa de cohort SQL real de recompra 90d
- [ ] `compute_monthly_score` precisa rodar diariamente — agendar no Vercel
- [ ] Trigger de `quality_stars` por gerente ainda manual (ele audita observações e insere em `profile_score_audit`)
- [ ] RLS de eventos diário usa `tier_rank_of_profile()` que precisa verificar formato real do nome do tier (Início, Caminho, Trilha, Constelação) vs lowercase keys

---

## Suporte

Para dúvidas sobre integração Belle, consultar:
- `scripts/belle-etl/README.md` (sync existente)
- `packages/decision-engine/README.md` (regras R1-R6)
- `packages/supabase/migrations/00001_v2_complete_schema.sql` (schema base)
- `docs/INTEGRACAO_CLIENTE_2026-05-29.md` (commit c859bcf — última grande integração)
