-- 00168_instituto_seed.sql
-- ============================================================================
-- SEED DRAFT do Instituto Estúdio Mais
-- ============================================================================
--
-- ATENÇÃO · LEIA ANTES DE APLICAR:
--
-- Os valores nesta migration são PLACEHOLDER baseados em estimativas que
-- discutimos. SUBSTITUA pelos números reais antes de aplicar em produção.
--
-- Campos pra confirmar com o time do Instituto:
--   · total_alunas_formadas → quantas alunas já saíram do programa
--   · total_doado_centavos  → valor acumulado destinado ao Instituto desde início
--   · current_turma_size    → tamanho da turma em formação agora
--   · next_turma_starts_at  → data da próxima turma
--
-- Depoimentos: troque nomes, idades, frases, fotos pelas alunas reais.
-- Se preferir manter anonimato, use primeiro nome + inicial do sobrenome
-- (ex: "Renata S."). Vídeos opcionais.
--
-- Esta migration é IDEMPOTENTE: pode rodar várias vezes sem duplicar.
-- ============================================================================


-- ============================================================================
-- 1. MÉTRICAS · update os valores das 4 métricas existentes
-- ============================================================================

UPDATE public.instituto_metrics
   SET current_value = 127,                          -- TODO: confirmar nº real
       updated_at = now()
 WHERE metric_key = 'total_alunas_formadas';

UPDATE public.instituto_metrics
   SET current_value = 240000000,                    -- TODO: R$ 2.400.000 em centavos · confirmar valor real
       updated_at = now()
 WHERE metric_key = 'total_doado_centavos';

UPDATE public.instituto_metrics
   SET current_value = 40,                           -- TODO: confirmar turma atual
       updated_at = now()
 WHERE metric_key = 'current_turma_size';

UPDATE public.instituto_metrics
   SET current_value = EXTRACT(EPOCH FROM '2026-09-01'::timestamptz)::numeric,  -- TODO: confirmar data
       updated_at = now()
 WHERE metric_key = 'next_turma_starts_at_ts';


-- ============================================================================
-- 2. DEPOIMENTOS · 5 alunas formadas (placeholder · trocar pelos reais)
-- ============================================================================
--
-- Pra rodar de novo após editar, dropa primeiro:
--   DELETE FROM instituto_depoimentos WHERE full_name IN ('Renata Silva','Camila Andrade','Beatriz Lima','Priscila Costa','Adriana Souza');
-- ----------------------------------------------------------------------------

INSERT INTO public.instituto_depoimentos
  (full_name, age, city, professional_area, graduation_year, current_status,
   short_quote, full_story, photo_url, video_url, is_published, display_order)
VALUES

-- ─────────────────────────────────────────────────────────────────────────
-- DEPOIMENTO 1 · Renata Silva
-- TODO: substituir pelos dados de uma aluna real
-- ─────────────────────────────────────────────────────────────────────────
('Renata Silva', 26, 'São Paulo', 'esteticista', 2024,
 'Esteticista titular · Center Norte · salário R$ 4.200 + comissão',
 'Vim do abrigo. Hoje sou esteticista no Center Norte.',
 'Conheci o Instituto quando ainda morava em casa de passagem. Disseram que tinha um curso técnico, gratuito, com bolsa-auxílio. Achei mentira. Fui ver, era verdade. Os 12 meses foram intensos — sala de aula de manhã, prática na clínica à tarde, e à noite eu estudava conteúdo extra que as professoras passavam. No 6º mês comecei a atender clientes do Estúdio Mais com supervisão. No 11º mês recebi convite formal pra entrar no quadro. Hoje pago meu apê, tenho carteira assinada, e estou no 2º semestre de fisioterapia. Minha mãe ainda não acredita.',
 NULL,                                              -- photo_url · TODO: subir foto
 NULL,                                              -- video_url · TODO: opcional
 true, 1),

-- ─────────────────────────────────────────────────────────────────────────
-- DEPOIMENTO 2 · Camila Andrade
-- ─────────────────────────────────────────────────────────────────────────
('Camila Andrade', 31, 'Guarulhos', 'biomédica', 2025,
 'Clínica própria · Guarulhos · 40 atendimentos por semana',
 'Abri minha clínica em 6 meses depois de formar.',
 'Eu já tinha 2 filhos quando soube do Instituto pelo grupo da igreja. Trabalhava como diarista de manhã. O programa era 8h/dia — tive que fazer malabarismo, mas a bolsa-auxílio cobria a creche das crianças. A formação em biomedicina estética me deu CRBM ativo e portfólio prático de 200+ atendimentos supervisionados. Hoje minha clínica atende 40 mulheres por semana no bairro. O Estúdio Mais não cobrou nada de mim. Sei que cada cliente do Clube que passou aqui no Center Norte ajudou a pagar isso.',
 NULL, NULL, true, 2),

-- ─────────────────────────────────────────────────────────────────────────
-- DEPOIMENTO 3 · Beatriz Lima
-- ─────────────────────────────────────────────────────────────────────────
('Beatriz Lima', 23, 'Osasco', 'nutricionista', 2025,
 'Nutricionista no Estúdio Mais · atende Madrinhas High Value',
 'Sou eu que cuido das dietas das clientes que vocês veem aqui.',
 'Cresci com a mãe trabalhando triplo turno pra manter a casa. Quando vi a divulgação do Instituto na unidade de Osasco, pensei: ou agora ou nunca. O processo seletivo foi longo — entrevista, prova de português, redação sobre vocação. Entrei com 19 anos, formei com 22. Hoje sou nutricionista responsável pelo acompanhamento das clientes High Value do Clube. Acompanho elas semanalmente pelas fotos de prato que vocês mandam pelo app. É surreal pensar que um dia eu era a que precisava do programa, e agora sou eu que entrego ele de volta.',
 NULL, NULL, true, 3),

-- ─────────────────────────────────────────────────────────────────────────
-- DEPOIMENTO 4 · Priscila Costa
-- ─────────────────────────────────────────────────────────────────────────
('Priscila Costa', 29, 'Santo André', 'esteticista', 2023,
 'Esteticista de Sobrancelha · unidade Santo André',
 'O Instituto me ensinou ofício. O Estúdio me deu casa.',
 'Eu trabalhava como auxiliar de cozinha em padaria quando vi um cartaz do processo seletivo. Tinha 26 anos, sentia que tinha perdido o tempo de estudar. As professoras me disseram no primeiro mês: nunca é tarde. Formei com 27. Hoje sou referência em Brow Design Premium na unidade de Santo André. Tenho fila de espera de 3 semanas. Meu salário triplicou em relação ao que eu ganhava antes.',
 NULL, NULL, true, 4),

-- ─────────────────────────────────────────────────────────────────────────
-- DEPOIMENTO 5 · Adriana Souza
-- ─────────────────────────────────────────────────────────────────────────
('Adriana Souza', 34, 'São Bernardo', 'esteticista', 2022,
 'Gerente da unidade Vila Mariana · liderança feminina',
 'Comecei como aluna. Hoje comando uma unidade inteira.',
 'Fui da primeira turma de 2021. Tinha 30 anos, 2 filhos, e nenhuma formação técnica. Hoje sou gerente da unidade Vila Mariana — comando 14 esteticistas, 2 biomédicas, 1 nutri e 1 dermato. Já indiquei 7 mulheres pro Instituto desde que formei. 4 entraram. Esse é o ciclo que a gente quer manter. Quando uma cliente do Clube me pergunta por que o Estúdio doa pro Instituto, eu mostro a minha história. Não tem resposta melhor.',
 NULL, NULL, true, 5)

ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. VALIDAÇÃO PÓS-SEED
-- ============================================================================
-- Rodar manualmente depois de aplicar pra confirmar:
--
--   SELECT metric_key, current_value, label FROM instituto_metrics ORDER BY metric_key;
--   SELECT full_name, professional_area, graduation_year FROM instituto_depoimentos WHERE is_published ORDER BY display_order;
--
-- Esperado:
--   · 4 linhas em instituto_metrics, todas com current_value > 0
--   · 5 linhas em instituto_depoimentos, todas com is_published = true
