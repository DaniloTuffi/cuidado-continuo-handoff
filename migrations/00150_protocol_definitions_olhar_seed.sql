-- 00150_protocol_definitions_olhar_seed.sql
-- Seeds dos 5 protocolos pós-procedimento do Bloco Beleza do Olhar.
-- Carro-chefe comercial do Estúdio Mais (faixa ≤R$ 163 representa 8,7% da base histórica).
--
-- Schema referência: migration 00007_motor_decisao_tables.sql
-- Documentação clínica: Beneficios_Procedimentos_Lote3_Sobrancelha.md (Obsidian)
-- Decisões: Doc 42 (Programa de Acompanhamento - Produto Âncora)
--
-- Aplicar via MCP Supabase em ambiente de dev primeiro. Validar com 1 cliente teste antes de production.

INSERT INTO public.protocol_definitions
  (procedure_name, procedure_key, duration_days,
   daily_actions, risk_rules, emotional_logic, ui_behavior,
   version, is_active)
VALUES

-- ---------------------------------------------------------------------------
-- 1. DESIGN DE SOBRANCELHA — porta de entrada estatística (R$ 82-163,48)
-- 30 dias · Janela Mágica D+8 dispara cortesia automática (Tintura)
-- ---------------------------------------------------------------------------
(
  'Design de Sobrancelha',
  'design_sobrancelha',
  30,

  '[
    {
      "id": "evitar_agua_quente",
      "day_range": [1, 1],
      "action": "Evitar água quente direta na área por 6h",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "sem_maquiagem_olhos",
      "day_range": [1, 1],
      "action": "Sem maquiagem nos olhos por 4h (poro aberto)",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "hidratar_soro",
      "day_range": [1, 3],
      "action": "Hidratar com soro fisiológico se houver vermelhidão",
      "frequency_per_day": 2,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "nao_arrancar",
      "day_range": [1, 5],
      "action": "Crescer alguns pelos finos é normal — não arranque",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "emotional"
    },
    {
      "id": "oleo_ricino",
      "day_range": [5, 25],
      "action": "Aplicar óleo de rícino com pincel limpo — estimula crescimento",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    },
    {
      "id": "foto_evolucao",
      "day_range": [8, 8],
      "action": "Tirar foto para comparar com o dia 0 — sua designer vê na próxima visita",
      "frequency_per_day": 1,
      "tracking_type": "photo",
      "feedback_type": "emotional"
    },
    {
      "id": "escovacao_diaria",
      "day_range": [10, 30],
      "action": "Escovação diária com escovinha (no sentido natural) mantém o formato",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    },
    {
      "id": "agendar_proxima",
      "day_range": [21, 30],
      "action": "Hora de agendar próxima manutenção (ciclo de 21-30 dias)",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    }
  ]'::jsonb,

  '{
    "low_adherence_threshold": 40,
    "trigger_team_alert_day": 7,
    "magic_window_day": 8,
    "magic_window_courtesy_procedure_key": "tintura_sobrancelha",
    "critical_actions": ["evitar_agua_quente", "sem_maquiagem_olhos"]
  }'::jsonb,

  '{
    "reinforcement_message": "Você está cuidando do seu formato — continue assim, faz diferença.",
    "reward_message": "Sua sobrancelha está fixando bonita! Você merece a próxima visita relaxada.",
    "warning_message": "Sentiu falta de uns dias? Sem culpa — retomar agora ainda dá resultado.",
    "completion_message": "Você completou o cuidado do seu Design. A Lene te espera pra próxima."
  }'::jsonb,

  '{
    "show_progress": true,
    "show_streak": true,
    "show_daily_card": true,
    "progress_style": "circles",
    "highlight_magic_window": true
  }'::jsonb,

  1, true
),

-- ---------------------------------------------------------------------------
-- 2. BROW LAMINATION (R$ 219-414,80) — cortesia D+30 escalonada do Design
-- 45 dias · regra clínica crítica: NÃO MOLHAR 24h
-- ---------------------------------------------------------------------------
(
  'Brow Lamination',
  'brow_lamination',
  45,

  '[
    {
      "id": "nao_molhar_24h",
      "day_range": [1, 1],
      "action": "🚫 NÃO MOLHAR a área por 24h — água, suor, vapor. Crítico!",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "sem_maquiagem_24h",
      "day_range": [1, 1],
      "action": "Sem maquiagem na sobrancelha por 24h",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "sem_calor_24h",
      "day_range": [1, 1],
      "action": "Sem sauna, sol direto ou exercício pesado por 24h",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "escovar_alinhamento",
      "day_range": [2, 45],
      "action": "Escovar pela manhã (mantém o alinhamento da laminação)",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    },
    {
      "id": "hidratar_ricino_lam",
      "day_range": [2, 45],
      "action": "Hidratar com óleo de rícino 2-3× semana (essencial pra durabilidade)",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    },
    {
      "id": "foto_resultado",
      "day_range": [3, 3],
      "action": "Tirar foto do resultado — mostre como ficou!",
      "frequency_per_day": 1,
      "tracking_type": "photo",
      "feedback_type": "emotional"
    },
    {
      "id": "evitar_alcool_produto",
      "day_range": [1, 45],
      "action": "Evite produtos com álcool na região (desfaz a laminação mais cedo)",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "clinical"
    },
    {
      "id": "agendar_retorno",
      "day_range": [40, 45],
      "action": "Hora de agendar próxima laminação (efeito está saindo)",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    }
  ]'::jsonb,

  '{
    "low_adherence_threshold": 50,
    "trigger_team_alert_day": 1,
    "magic_window_day": 30,
    "magic_window_courtesy_procedure_key": "lash_lifting",
    "critical_actions": ["nao_molhar_24h", "sem_maquiagem_24h", "sem_calor_24h"]
  }'::jsonb,

  '{
    "reinforcement_message": "Os fios alinhados refletem seu cuidado diário — continue escovando.",
    "reward_message": "Sua laminação está intacta na semana 3 — virou rotina!",
    "warning_message": "A laminação responde melhor com hidratação. Vamos retomar.",
    "completion_message": "8 semanas com a sobrancelha alinhada. A Lene preparou a próxima."
  }'::jsonb,

  '{
    "show_progress": true,
    "show_streak": true,
    "show_daily_card": true,
    "progress_style": "bar",
    "highlight_critical_first_24h": true
  }'::jsonb,

  1, true
),

-- ---------------------------------------------------------------------------
-- 3. LASH LIFTING (R$ 285-414) — cortesia D+90 escalonada
-- 45 dias · regra clínica: NÃO MOLHAR 24h + dormir barriga pra cima 1ª noite
-- ---------------------------------------------------------------------------
(
  'Lash Lifting',
  'lash_lifting',
  45,

  '[
    {
      "id": "nao_molhar_24h_cilios",
      "day_range": [1, 1],
      "action": "🚫 NÃO MOLHAR os cílios por 24h — água, suor, vapor",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "sem_rimel_24h",
      "day_range": [1, 1],
      "action": "Sem rímel, removedor ou maquiagem nos olhos por 24h",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "dormir_barriga_cima",
      "day_range": [1, 1],
      "action": "Dormir de barriga pra cima (protege a curvatura nova)",
      "frequency_per_day": 1,
      "time_of_day": "noite",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "nao_esfregar",
      "day_range": [1, 7],
      "action": "Não esfregar os olhos (pode tirar a curvatura)",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "clinical"
    },
    {
      "id": "hidratar_serum",
      "day_range": [2, 45],
      "action": "Hidratar com soro fisiológico ou hialurônico diariamente",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    },
    {
      "id": "rimel_nao_oleoso",
      "day_range": [2, 45],
      "action": "Pode usar rímel — evite os oleosos (degradam o lifting)",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "neutral"
    },
    {
      "id": "agendar_proxima_lash",
      "day_range": [40, 45],
      "action": "Crescimento de cílios novos visível — hora da próxima sessão",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    }
  ]'::jsonb,

  '{
    "low_adherence_threshold": 50,
    "trigger_team_alert_day": 1,
    "critical_actions": ["nao_molhar_24h_cilios", "dormir_barriga_cima", "nao_esfregar"]
  }'::jsonb,

  '{
    "reinforcement_message": "Olhar curvado naturalmente — você simplesmente acordando bonita.",
    "reward_message": "Seu lash está perfeito! Imagine quando combinar com Brow Lamination.",
    "warning_message": "Esfregar reduz a durabilidade. Hidratar ajuda a recuperar.",
    "completion_message": "Você cuidou bem dos seus cílios. A Lene te espera pra renovar."
  }'::jsonb,

  '{
    "show_progress": true,
    "show_streak": true,
    "show_daily_card": true,
    "progress_style": "bar",
    "highlight_critical_first_24h": true
  }'::jsonb,

  1, true
),

-- ---------------------------------------------------------------------------
-- 4. TINTURA DE SOBRANCELHA (R$ 79-219) — cortesia padrão D+15 do Design
-- 30 dias · custo R$ 3,55 / ROI 63× como cortesia
-- ---------------------------------------------------------------------------
(
  'Tintura de Sobrancelha',
  'tintura_sobrancelha',
  30,

  '[
    {
      "id": "evitar_molhar_12h",
      "day_range": [1, 1],
      "action": "Evite molhar diretamente nas primeiras 12h (fixa a cor)",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "sem_alcool_acido_48h",
      "day_range": [1, 2],
      "action": "Sem produtos com álcool ou ácido na área por 48h",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "fps_facial",
      "day_range": [1, 15],
      "action": "Protetor solar facial cobre a área (UV degrada o pigmento)",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "agendar_proxima_tintura",
      "day_range": [25, 30],
      "action": "Cor começa a clarear — agendar próxima tintura junto com o Design",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    }
  ]'::jsonb,

  '{
    "low_adherence_threshold": 30,
    "trigger_team_alert_day": 7,
    "critical_actions": ["evitar_molhar_12h"]
  }'::jsonb,

  '{
    "reinforcement_message": "Cobrir fios brancos com elegância. Sua sobrancelha agora completa o olhar.",
    "reward_message": "Cor uniforme e bonita — manutenção simples vale o resultado.",
    "warning_message": "Sol degrada cor antes da hora. Vamos com FPS firme.",
    "completion_message": "Cor saiu naturalmente — momento certo pra renovar."
  }'::jsonb,

  '{
    "show_progress": true,
    "show_streak": false,
    "show_daily_card": true,
    "progress_style": "bar"
  }'::jsonb,

  1, true
),

-- ---------------------------------------------------------------------------
-- 5. MICROPIGMENTAÇÃO SOBRANCELHA 3D (R$ 494-2.806) — premium
-- 60 dias · RETOQUE OBRIGATÓRIO D+30 (já incluso no valor)
-- ---------------------------------------------------------------------------
(
  'Micropigmentação Sobrancelha 3D',
  'micropigmentacao_3d',
  60,

  '[
    {
      "id": "pomada_cicatrizante",
      "day_range": [1, 30],
      "action": "Aplicar pomada cicatrizante (Bepantol/Cicaplast) 3× ao dia",
      "frequency_per_day": 3,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "lavar_sabonete_neutro",
      "day_range": [1, 10],
      "action": "Lavar com sabonete neutro 2× ao dia, secar com gaze sem esfregar",
      "frequency_per_day": 2,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "crosta_natural",
      "day_range": [1, 3],
      "action": "Crosta natural e sensibilidade — NÃO ARRANQUE",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "emotional"
    },
    {
      "id": "proibido_piscina_sauna",
      "day_range": [1, 30],
      "action": "🚫 PROIBIDO: piscina, sauna, sol direto, água do mar, exercício pesado",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "clinical"
    },
    {
      "id": "proibido_maquiagem_30d",
      "day_range": [1, 30],
      "action": "🚫 PROIBIDO: maquiagem na área",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "clinical"
    },
    {
      "id": "descamacao_normal",
      "day_range": [7, 15],
      "action": "Descamação visual (perde cor) é normal — pigmento se acomoda",
      "frequency_per_day": 1,
      "tracking_type": "self_report",
      "feedback_type": "emotional"
    },
    {
      "id": "foto_evolucao_micro",
      "day_range": [15, 15],
      "action": "Tirar foto da evolução — cor começa a aparecer",
      "frequency_per_day": 1,
      "tracking_type": "photo",
      "feedback_type": "emotional"
    },
    {
      "id": "retoque_obrigatorio",
      "day_range": [28, 32],
      "action": "🎯 RETOQUE OBRIGATÓRIO entre D+30-45 (incluso no valor)",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "clinical"
    },
    {
      "id": "fps_50_diario",
      "day_range": [45, 60],
      "action": "FPS 50+ diário (degradação solar é a maior causa de perda de cor)",
      "frequency_per_day": 1,
      "time_of_day": "manha",
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    },
    {
      "id": "lembrete_manutencao_anual",
      "day_range": [55, 60],
      "action": "Marque lembrete pra manutenção anual (12 meses)",
      "frequency_per_day": 1,
      "tracking_type": "checkbox",
      "feedback_type": "neutral"
    }
  ]'::jsonb,

  '{
    "low_adherence_threshold": 60,
    "trigger_team_alert_day": 3,
    "critical_actions": ["pomada_cicatrizante", "proibido_piscina_sauna", "proibido_maquiagem_30d", "retoque_obrigatorio"],
    "auto_schedule_followup": {"day": 30, "procedure_key": "micropigmentacao_retoque"}
  }'::jsonb,

  '{
    "reinforcement_message": "Você está cuidando do investimento — cada dia conta pros 24 meses de durabilidade.",
    "reward_message": "Cor uniforme aos 30 dias = retoque vai ser leve e o resultado lindo.",
    "warning_message": "FPS é o que mais protege o pigmento. Sem isso a cor sai em meses.",
    "completion_message": "Procedimento concluído! Lembrete anual em 12 meses pra manutenção."
  }'::jsonb,

  '{
    "show_progress": true,
    "show_streak": true,
    "show_daily_card": true,
    "progress_style": "circles",
    "highlight_critical_phases": ["first_10d_cicatrization", "retoque_d30"],
    "show_premium_badge": true
  }'::jsonb,

  1, true
)

ON CONFLICT (procedure_key, version) DO UPDATE
  SET procedure_name = EXCLUDED.procedure_name,
      duration_days  = EXCLUDED.duration_days,
      daily_actions  = EXCLUDED.daily_actions,
      risk_rules     = EXCLUDED.risk_rules,
      emotional_logic = EXCLUDED.emotional_logic,
      ui_behavior    = EXCLUDED.ui_behavior;

-- Validação rápida — rodar após apply
-- SELECT procedure_key, duration_days, jsonb_array_length(daily_actions) AS n_acoes FROM public.protocol_definitions WHERE procedure_key LIKE '%sobrancelha%' OR procedure_key IN ('brow_lamination', 'lash_lifting', 'tintura_sobrancelha', 'micropigmentacao_3d');
