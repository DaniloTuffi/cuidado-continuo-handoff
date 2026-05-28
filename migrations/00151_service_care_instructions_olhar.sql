-- 00151_service_care_instructions_olhar.sql
-- Popula services.pre_care_instructions e services.post_care_instructions
-- pros 7 procedimentos do Bloco Beleza do Olhar (Lote 3 Sobrancelha).
--
-- Conteúdo extraído de: Beneficios_Procedimentos_Lote3_Sobrancelha.md (Obsidian)
-- Status: AGUARDA REVISÃO CLÍNICA pela designer sênior + enfermeira do Estúdio.
--
-- Pré-requisito: o service.procedure_key deve estar alinhado com protocol_definitions
-- aplicado na migration 00150. Se as keys forem diferentes no catálogo atual, ajustar
-- o WHERE de cada UPDATE.

-- ---------------------------------------------------------------------------
-- 1. Design de Sobrancelha
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Evite arrancar pelos nos 7 dias anteriores (a designer precisa ver tudo que cresceu)
Não faça peeling, ácido ou microagulhamento na área 7 dias antes
Chegue sem maquiagem nos olhos',
    post_care_instructions = 'Primeiras 24h:
Evite água quente direta na área por 6h
Não passe maquiagem nos olhos por 4h (poro aberto)
Sem exposição solar prolongada nas próximas 24h
Hidrate a região com soro fisiológico se houver vermelhidão

Cuidados contínuos:
D+1 a D+3: crescer alguns pelos finos é normal — não arranque
D+5 a D+10: óleo de rícino com pincel limpo (3× semana) — estimula crescimento
D+10 a D+20: escovação diária com escovinha (no sentido natural) mantém o formato
D+21 a D+30: primeira manutenção — agendar próxima visita'
WHERE LOWER(name) LIKE '%design%sobrancelha%' OR LOWER(name) LIKE '%design de sobrancelhas%';

-- ---------------------------------------------------------------------------
-- 2. Brow Lamination
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Sobrancelhas limpas, sem maquiagem
Não fazer peeling ou microagulhamento na área 7 dias antes
Suspender ácidos (retinoico, glicólico) 3 dias antes na região',
    post_care_instructions = 'PRIMEIRAS 24H (CRÍTICO):
NÃO MOLHAR a área por 24h (água, suor, vapor)
Sem maquiagem na sobrancelha por 24h
Sem sauna, sol direto ou exercício pesado por 24h
Pode dar coceira leve — não esfregue

Cuidados contínuos (D+1 a D+45):
D+1 em diante: hidratar com óleo de rícino 2-3× por semana (essencial pra durabilidade)
D+3 a D+7: escovar diariamente pela manhã (mantém alinhamento)
D+30: primeira percepção de queda do efeito — agendar retorno em D+45
Evite produtos com álcool na região (desfaz a laminação mais cedo)'
WHERE LOWER(name) LIKE '%brow%lamination%' OR LOWER(name) LIKE '%laminação%sobrancelha%';

-- ---------------------------------------------------------------------------
-- 3. Lash Lifting
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Cílios limpos, sem rímel, removedor, óleo
Suspender lentes de contato no dia (usar óculos)
Avisar se usa isotretinoína ou ácido oral',
    post_care_instructions = 'PRIMEIRAS 24H (CRÍTICO):
NÃO MOLHAR os cílios por 24h (água, suor, lágrima excessiva, vapor)
Sem rímel, removedor ou maquiagem nos olhos por 24h
Não esfregar os olhos
Dormir de barriga pra cima na primeira noite (protege a curvatura)

Cuidados contínuos (D+1 a D+45):
D+1: retomar maquiagem normal — evite rímel oleoso
D+7 a D+30: hidratar diariamente com soro fisiológico ou hialurônico
D+30: começa a perceber crescimento de cílios novos (sem o lift)
D+45 a D+60: agendar próxima sessão'
WHERE LOWER(name) LIKE '%lash%lifting%';

-- ---------------------------------------------------------------------------
-- 4. Tintura de Sobrancelha
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Sem ácido ou peeling na área 5 dias antes
Avisar se já teve alergia a tintura capilar antes (teste 48h antes recomendado)
Sobrancelhas limpas, sem óleo ou produto',
    post_care_instructions = 'Primeiras 24h:
Evite molhar diretamente nas primeiras 12h (fixa a cor)
Sem produtos com álcool ou ácido na área por 48h
Sem exposição solar direta intensa nas primeiras 24h

Cuidados contínuos (D+1 a D+30):
D+1 a D+15: cor intensa — usar protetor solar facial cobre a área
D+15 a D+25: cor começa a clarear naturalmente
D+25 a D+30: agendar próxima tintura junto com o Design'
WHERE LOWER(name) LIKE '%tintura%sobrancelha%';

-- ---------------------------------------------------------------------------
-- 5. Henna Degradê
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Mesma orientação da tintura: sem ácido/peeling, área limpa
Teste 48h antes na primeira vez (alergia rara mas existe)',
    post_care_instructions = 'PRIMEIRAS 24H (mais rigoroso que tintura):
NÃO MOLHAR a área por 12h (pigmento ainda fixando na pele)
Sem maquiagem na área por 12h
Sem sauna, piscina ou suor intenso por 24h

Cuidados contínuos:
D+1 a D+7: efeito sombra na pele intenso — pode achar "marcado demais", normaliza
D+7 a D+12: sombra clareia naturalmente na pele — pigmento nos fios permanece
D+15: sombra desaparece, só fios continuam coloridos por mais 2-3 semanas'
WHERE LOWER(name) LIKE '%henna%';

-- ---------------------------------------------------------------------------
-- 6. Permanente de Cílios (idêntico ao Lash Lifting)
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Cílios limpos, sem rímel, removedor, óleo
Suspender lentes de contato no dia',
    post_care_instructions = 'PRIMEIRAS 24H (CRÍTICO):
NÃO MOLHAR os cílios por 24h
Sem rímel ou maquiagem nos olhos por 24h
Dormir de barriga pra cima na primeira noite

Cuidados contínuos: idem Lash Lifting (rímel não oleoso, hidratar diariamente, agendar retorno D+45-60)'
WHERE LOWER(name) LIKE '%permanente%cílios%' OR LOWER(name) LIKE '%permanente%cilios%';

-- ---------------------------------------------------------------------------
-- 7. Micropigmentação Sobrancelha 3D
-- ---------------------------------------------------------------------------
UPDATE public.services
SET pre_care_instructions = 'Suspender ácidos e peeling 15 dias antes
Sem botox de testa 15 dias antes (a pele precisa estar neutra)
Sem álcool por 48h antes
Evitar exposição solar intensa 15 dias antes
Trazer foto da forma desejada (referência visual ajuda)',
    post_care_instructions = 'PRIMEIROS 7-10 DIAS (CRÍTICO):
D+1 a D+3: crosta natural e sensibilidade — NÃO arranque
D+1 a D+10: lavar com sabonete neutro 2× ao dia, secar com gaze sem esfregar
D+1 a D+30: aplicar pomada cicatrizante (Bepantol/Cicaplast) 3× ao dia

PROIBIDO por 30 dias:
piscina, sauna, sol direto, água do mar, exercício pesado (suor)
maquiagem na área

Evolução normal:
D+7 a D+15: descamação visual (perde cor) é normal — pigmento se acomoda
D+15 a D+30: cor real começa a aparecer
D+30: RETOQUE OBRIGATÓRIO (já incluso no valor)

Cuidados contínuos pós cicatrização (D+45+):
FPS 50+ diário na área (UV degrada pigmento)
Hidratante facial pode passar normalmente
Evitar peelings agressivos diretamente na área
Manutenção anual (12 meses) para reforçar cor'
WHERE LOWER(name) LIKE '%micropig%sobrancelha%' OR LOWER(name) LIKE '%sobrancelha%3d%' OR LOWER(name) LIKE '%microblading%';

-- ---------------------------------------------------------------------------
-- Validação rápida — após apply
-- SELECT id, name, LEFT(pre_care_instructions, 80) AS pre, LEFT(post_care_instructions, 80) AS post
-- FROM public.services
-- WHERE LOWER(name) ~ 'design|brow|lash|tintura|henna|permanente|micropig'
-- ORDER BY name;
-- ---------------------------------------------------------------------------
