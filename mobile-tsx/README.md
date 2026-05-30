# Telas mobile prontas para integração

Estas telas TSX foram preparadas seguindo os padrões do código do Steinhauser
(theming via `useTheme()`, `useAuth()`, `expo-router`, supabase client). Pronto
para code review e merge.

## Estrutura

```
mobile-tsx/
├── components/
│   └── score-chip.tsx           → apps/mobile/components/score-chip.tsx
├── employee/
│   ├── briefing.tsx             → apps/mobile/app/(employee)/briefing.tsx
│   ├── pipeline.tsx             → apps/mobile/app/(employee)/pipeline.tsx
│   └── score.tsx                → apps/mobile/app/(employee)/score.tsx
└── README.md                    (este arquivo)
```

## Pré-requisitos

Antes do merge, **aplicar a migration nova:**

```bash
# Em packages/supabase/migrations/
00158_pipeline_functions.sql      # cria next_best_actions_log + 2 functions
```

Sem essa migration, `briefing.tsx` e `pipeline.tsx` não conseguem ler dados.

## Como integrar

1. **Copiar componente compartilhado**
   ```bash
   cp mobile-tsx/components/score-chip.tsx apps/mobile/components/
   ```

2. **Copiar telas (employee)**
   ```bash
   cp mobile-tsx/employee/{briefing,pipeline,score}.tsx apps/mobile/app/\(employee\)/
   ```

3. **Atualizar `apps/mobile/app/(employee)/_layout.tsx`** adicionando as novas rotas no Stack
   (briefing como tela inicial após login, pipeline e score como rotas push).

4. **Aplicar migration 00158** via MCP Supabase.

5. **Testar**
   - Login como profissional → tela inicial deve ser Briefing Hoje
   - Tap no Score Chip → popover abre com breakdown
   - Tap em "Pipeline" → kanban com tabs por etapa
   - Tap em "Score" → tela completa com hero + prêmios + ranking + co-criação

## Padrões respeitados

- ✅ `useTheme()` para light/dark
- ✅ `useAuth()` do `../../lib/auth-context`
- ✅ `supabase` do `../../lib/supabase`
- ✅ `SafeAreaView` do `react-native-safe-area-context`
- ✅ `Stack.Screen` para header (consistente com outras telas)
- ✅ TypeScript interfaces explícitas
- ✅ RPC do Supabase com guards `auth.uid()` (SECURITY DEFINER nas functions)
- ✅ Cores: cream + ink + gold da paleta existente

## Decisões de design

### Briefing Diário
- Header com `ScoreChip` (componente compartilhado)
- 3 stats compactos (Score · Ações hoje · Recompras)
- Briefing card com 5 ações priorizadas
- Memória das clientes do dia
- Nav rápida pra Pipeline e Score

### Pipeline kanban
- Em mobile vira **tabs horizontais swipáveis** (UX melhor que kanban em telinha)
- 6 colunas: 1ª Visita · Janela Mágica · Em Pacote · Meio · Penúltima · Constelação
- Cada card mostra: avatar, nome, procedimento, D+X, memória snippet, próxima ação, context tag, prioridade
- Tap no card abre `client-file.tsx` existente

### Score completo
- Hero dark com score gigante + prêmio
- 4 KPI cards com barras
- Escala de prêmios em scroll horizontal
- Ranking da unidade (até 5 entries) com destaque pra você
- Histórico 6 meses em gráfico de barras
- Co-Criação: bugs e ideias com prêmio visível

## Pendências (não estão neste pacote)

- [ ] Telas de submissão de bug e ideia (`bug-report.tsx`, `idea-submit.tsx`)
- [ ] Telas do Diário Estúdio Mais (`diario/`) — próxima entrega
- [ ] Expansão do `client-file.tsx` pra Perfil 360°
- [ ] Telas web equivalentes em `apps/web/app/(dashboard)/score-de-cuidado/`

## Suporte

Dúvidas? Consultar:
- `docs 42, 43, 44` no Obsidian para a tese e padrões
- `protótipos HTML` em `/Users/danilo/Documents/cuidado-continuo-design/`
- Pacote completo no GitHub: `github.com/DaniloTuffi/cuidado-continuo-handoff`
