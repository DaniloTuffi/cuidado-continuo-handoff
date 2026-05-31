# Belle Readiness · Clube das Madrinhas

Auditoria honesta de quais tabelas do schema `00166_clube_madrinhas_schema.sql`
são populadas automaticamente pelo Belle ETL existente, quais dependem do app
em tempo real, e quais precisam de admin manual.

Esta tabela vale tanto pra produção (depois de aplicar a migration) quanto pra
revisão do Steinhauser antes do merge.

---

## Status por tabela

| Tabela | Como é populada | Belle ETL faz? | O que falta |
|---|---|---|---|
| `clube_madrinhas_membership` | (a) trigger automático em `client_packages` quando ≥ R$ 10k → `auto_high_value` · (b) upsert pela tela `liberar-madrinha.tsx` → `manual_professional` · (c) cliente entra na fila pelo app e admin promove → `waitlist_promoted` | ✓ indireto · Belle popula `client_packages` via ETL `10-client-packages.ts` (lê de `dbo.sv_cliente_servico`), o trigger reage | Nada — funciona out-of-the-box |
| `clube_madrinhas_waitlist` | Cliente entra sozinha pelo botão "Entrar na fila" na tela `clube-madrinhas/index.tsx` | ✗ não aplica | Nada — populado em tempo real |
| `clube_high_value_benefits` | Trigger automático no `client_packages` calcula valor via `unit_prices.custom_price` → `packages.price` → `payments.amount` (fallback chain) | ✓ indireto · depende do Belle popular `client_packages` + ETL que linka `unit_prices` (não verificado se existe) | **Validar com Steinhauser**: confirma se `unit_prices` está populado pra Center Norte. Se não, fallback pra `packages.price` funciona |
| `clube_stock_visibility` | Admin do Estúdio popula manualmente por mês via SQL ou dashboard admin | ✗ não aplica | **Criar tela admin** ou popular via SQL: `INSERT INTO clube_stock_visibility (unit_id, service_id, year_month, monthly_capacity, visibility_label) VALUES (...)` |
| `instituto_depoimentos` | Admin sobe 5-10 depoimentos via dashboard admin ou Supabase Studio | ✗ não aplica | **Seed manual** — recomendado 5+ depoimentos antes do lançamento (Renata, Camila, etc) com foto, vídeo, story |
| `instituto_metrics` | Admin atualiza trimestralmente | ✗ migration cria com valor 0 | **Update inicial** dos 4 metrics: `total_alunas_formadas`, `total_doado_centavos`, `current_turma_size`, `next_turma_starts_at_ts` |

---

## Trigger automático de High Value · como funciona

```sql
-- Quando Belle ETL insere em client_packages (via 10-client-packages.ts):
INSERT INTO client_packages (client_id, package_id, unit_id, total_sessions, expiry_date, ...)
VALUES (...);

-- Trigger dispara AUTOMATICAMENTE:
-- 1. Busca preço (unit_prices.custom_price → packages.price → payments.amount)
-- 2. Se ≥ R$ 10k:
--    a. INSERT em clube_high_value_benefits com 1 médica + 12 nutri + 52 photo reviews
--       e vigência = client_packages.expiry_date
--    b. UPSERT em clube_madrinhas_membership com status=active, entry_type=auto_high_value
```

Ou seja: **quando o Belle ETL roda o batch de `client_packages`, qualquer pacote
≥ R$ 10k automaticamente vira Madrinha + libera os benefícios. Sem código extra
no app, sem job paralelo.**

---

## Backfill histórico (importante)

A migration cria o trigger com `AFTER INSERT`. **Não roda em registros já
existentes.** Para promover Madrinhas que já compraram pacotes ≥ R$ 10k antes
da migration, rodar uma vez:

```sql
-- Backfill: gera benefits + membership pra pacotes históricos ≥ R$ 10k
INSERT INTO clube_high_value_benefits (
  client_id, triggering_package_id, triggering_purchase_centavos, starts_at, ends_at
)
SELECT
  cp.client_id,
  cp.id,
  (COALESCE(up.custom_price, p.price) * 100)::integer,
  cp.created_at,
  cp.expiry_date::timestamptz
FROM client_packages cp
JOIN packages p ON p.id = cp.package_id
LEFT JOIN unit_prices up ON up.package_id = cp.package_id AND up.unit_id = cp.unit_id
WHERE COALESCE(up.custom_price, p.price) >= 10000
  AND cp.status = 'active'
  AND cp.expiry_date > CURRENT_DATE
ON CONFLICT DO NOTHING;

-- Membership correspondente
INSERT INTO clube_madrinhas_membership (
  client_id, status, entry_type, activated_at, expires_at
)
SELECT DISTINCT
  cp.client_id, 'active', 'auto_high_value', cp.created_at, cp.expiry_date::timestamptz
FROM client_packages cp
JOIN packages p ON p.id = cp.package_id
LEFT JOIN unit_prices up ON up.package_id = cp.package_id AND up.unit_id = cp.unit_id
WHERE COALESCE(up.custom_price, p.price) >= 10000
  AND cp.status = 'active'
  AND cp.expiry_date > CURRENT_DATE
ON CONFLICT (client_id) DO UPDATE SET
  status = 'active',
  expires_at = GREATEST(clube_madrinhas_membership.expires_at, EXCLUDED.expires_at);
```

Rodar uma vez em produção, depois da migration. **Estimativa Center Norte**:
provavelmente 40-100 clientes com pacote ≥ R$ 10k ativo. Confirmar com query
de pré-validação:

```sql
SELECT count(*) FROM client_packages cp
JOIN packages p ON p.id = cp.package_id
LEFT JOIN unit_prices up ON up.package_id = cp.package_id AND up.unit_id = cp.unit_id
WHERE COALESCE(up.custom_price, p.price) >= 10000
  AND cp.status = 'active';
```

---

## Seed inicial do Instituto

Recomendado antes do lançamento, via Supabase Studio ou SQL:

```sql
-- Metrics
UPDATE instituto_metrics SET current_value = 127 WHERE metric_key = 'total_alunas_formadas';
UPDATE instituto_metrics SET current_value = 240000000 WHERE metric_key = 'total_doado_centavos'; -- R$ 2,4M em centavos
UPDATE instituto_metrics SET current_value = 40 WHERE metric_key = 'current_turma_size';
UPDATE instituto_metrics SET current_value = EXTRACT(EPOCH FROM '2026-09-01'::timestamptz) WHERE metric_key = 'next_turma_starts_at_ts';

-- Depoimentos (mínimo 3 pra UI ficar respirando)
INSERT INTO instituto_depoimentos
  (full_name, age, city, professional_area, graduation_year, current_status,
   short_quote, full_story, photo_url, is_published, display_order)
VALUES
  ('Renata Silva', 26, 'São Paulo', 'esteticista', 2024,
   'Esteticista titular · Center Norte · Salário R$ 4.200 + comissão',
   'Vim do abrigo. Hoje sou esteticista no Center Norte.',
   'Conheci o Instituto quando ainda morava em casa de passagem...',
   null, true, 1),
  -- ... mais 2-4
;
```

---

## Painel das Madrinhas (WebView) · dependência separada

A tela `painel.tsx` abre o Flask existente via WebView com JWT pass-through. Pra
isso funcionar, precisa também:

1. **Edge Function `issue-painel-jwt`** (Deno, em `supabase/functions/issue-painel-jwt/index.ts`) — emite JWT assinado com claim `{ profile_id, scope: 'madrinha', exp: now+30min }`
2. **Endpoint Flask** `/madrinha/auto-login?jwt=...` — valida JWT, cria sessão, redireciona pro Painel logado
3. **Secret compartilhado** Supabase ↔ Flask para HMAC do JWT

A edge function ainda **não está escrita** neste repo. Especificação está em
`doc 37 - Conexão App → Painel das Madrinhas via WebView` no Obsidian.

---

## Resumo · o que precisa rodar antes do "go live"

Ordem de execução em produção:

1. ✅ **Aplicar migrations 00166 + 00167** (idempotentes, safe)
2. ⚠️ **Drop opcional da migration 00163** se já foi aplicada — `DROP TABLE client_cc_subscriptions, cuidado_continuo_tiers CASCADE`
3. ⏳ **Rodar backfill histórico** (SQL acima) → promove clientes ≥ R$ 10k existentes
4. ⏳ **Seed do Instituto** (metrics + 3-5 depoimentos)
5. ⏳ **Popular `clube_stock_visibility`** pra Center Norte mês corrente (3-5 procedimentos)
6. ⏳ **Escrever edge function `issue-painel-jwt`** + endpoint Flask `/madrinha/auto-login`
7. ⏳ **Deploy das telas TSX** + Casa do Cuidado atualizada
8. ⏳ **Verificar Belle ETL roda diariamente** (`10-client-packages.ts`) — confirmar com Steinhauser

Itens ✅ = já feito no repo. ⚠️ = decisão sua. ⏳ = pra produção, fora do escopo do schema.

---

## Schema integration map (resumo visual)

```
                    ┌─────────────────┐
                    │   Belle SaaS    │
                    └────────┬────────┘
                             │ ETL daily
                             ▼
        ┌─────────────────────────────────────────────┐
        │ client_details   appointments   packages    │
        │ profiles         employee_details services  │
        │ units                            unit_prices│
        │ client_packages ◄───────────────────────────│  ← key trigger source
        └─────────────────────────────────────────────┘
                             │
                             ▼ trigger AFTER INSERT
        ┌─────────────────────────────────────────────┐
        │ clube_high_value_benefits  (auto)            │
        │ clube_madrinhas_membership (auto)            │
        └─────────────────────────────────────────────┘

        ┌─────────────────────────────────────────────┐
        │ App em tempo real:                          │
        │  · clube_madrinhas_waitlist  (cliente)      │
        │  · clube_madrinhas_membership (profissional)│
        └─────────────────────────────────────────────┘

        ┌─────────────────────────────────────────────┐
        │ Admin manual:                               │
        │  · clube_stock_visibility                   │
        │  · instituto_depoimentos                    │
        │  · instituto_metrics                        │
        └─────────────────────────────────────────────┘
```
