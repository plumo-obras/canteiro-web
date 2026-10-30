---
name: Plumo
description: Landing da lista de espera do Plumo. A cidade de obras dormindo como uma colcha costurada; a página é uma noite que amanhece.
colors:
  ouro: "#e8b04a"
  ouro-hi: "#f2c56b"
  ouro-ink: "#7a5410"
  falta: "#d0654c"
  caminho: "#5b8fc4"
  emdia: "#4fa37a"
  noite: "#0f1a2e"
  noite-2: "#16243d"
  noite-3: "#1e2f4d"
  fio: "rgba(232,226,210,.42)"
  fio-hi: "rgba(240,234,218,.78)"
  tinta-noite: "#eef1f6"
  mudo-noite: "#aab5c8"
  lead-noite: "#cfd6e2"
  apagado-noite: "#8f9bb1"
  manha: "#eef1ee"
  manha-2: "#e3e8e4"
  papel: "#fbfcfb"
  tinta: "#15201c"
  mudo: "#4c5753"
  linha-manha: "#cfd6d2"
  costura-manha: "#b9c2bd"
  borda-campo: "#c2cac6"
  erro-manha: "#a33a28"
  ok-manha: "#1f6b45"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(42px, 5vw, 72px)"
    fontWeight: 750
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(36px, 4.6vw, 64px)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.03em"
  lead:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(18px, 1.5vw, 20px)"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "tnum"
  label:
    fontFamily: "Figtree, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 650
  bordado:
    fontFamily: "Nunito, Figtree, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 800
    letterSpacing: "0.1em"
rounded:
  campo: "14px"
  bloco: "16px"
  r: "20px"
  briefing: "24px"
  ficha: "28px"
  fone: "36px"
  pill: "999px"
spacing:
  gut: "clamp(16px, 4vw, 40px)"
  sec: "clamp(96px, 12vw, 160px)"
  coluna: "1180px"
components:
  button-primary:
    backgroundColor: "{colors.ouro}"
    textColor: "{colors.noite}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ouro-hi}"
    textColor: "{colors.noite}"
  button-primary-sm:
    backgroundColor: "{colors.ouro}"
    textColor: "{colors.noite}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "40px"
  button-linha:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-noite}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  input-inscricao:
    textColor: "{colors.tinta-noite}"
    rounded: "{rounded.pill}"
    padding: "6px"
  input-campo:
    backgroundColor: "#ffffff"
    textColor: "{colors.tinta}"
    rounded: "{rounded.campo}"
    padding: "0 14px"
    height: "50px"
  chip-papel:
    backgroundColor: "#ffffff"
    textColor: "{colors.tinta}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "42px"
  chip-papel-selected:
    backgroundColor: "{colors.tinta}"
    textColor: "#ffffff"
  card-bilhete:
    backgroundColor: "{colors.noite-2}"
    textColor: "{colors.tinta-noite}"
    rounded: "{rounded.r}"
    padding: "22px 22px 18px"
  card-briefing:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.briefing}"
  card-ficha:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.ficha}"
    padding: "clamp(26px, 3vw, 38px)"
---

# Design System: Plumo

Este documento descreve o mundo visual da **landing do Plumo** (`apps/site/`: `modelo.html` + `i18n/*.json` → `gerar.py` → `index.html`, `es/`, `en/`; `styles.css`, `app.js`, `logo.svg`). Plumo é o nome de divulgação do produto que o PRODUCT.md ainda chama de Canteiro. Os tokens acima foram extraídos de `apps/site/styles.css`; quando o CSS e este texto divergirem, o CSS vence e este arquivo deve ser corrigido.

## Overview

**Creative North Star: "A Cidade Costurada"**

De noite as obras dormem e o Plumo trabalha. A página é uma noite que amanhece: o hero e a madrugada ficam no azul-noite, o canteiro atravessa a aurora, e a decisão chega de manhã, em chão claro e tinta escura. O scroll é o relógio; cada trecho está numa hora do dia, e a cor de fundo diz que hora é.

As obras são retalhos de uma colcha vista de cima, presos por costura tracejada em linha clara. As janelas acesas são o ouro, bordado em traço curto. Cada obra se tinge com o clima do seu estado (falta, a caminho, em dia) e o nome dela é bordado em caixa alta ao longo da costura de cima do retalho. A costura é a única ornamentação do mundo: ela contorna a navbar, o bilhete do agente, a ficha de inscrição, os eixos de tempo e os separadores. O resto é tipografia grande e texto curto.

A densidade é de página de divulgação, não de ferramenta: poucos blocos, muito ar, uma ideia por seção. A prova vem do mesmo princípio do produto, mostrar a conta e a fonte, e todo exemplo é rotulado como fictício.

**Key Characteristics:**
- Fundo que muda com a hora: noite (`noite`), aurora (degradê da noite até a manhã), manhã (`manha`).
- Costura tracejada (`stroke-dasharray` 6 5 ou 7 6; `outline` dashed com `outline-offset` negativo) como o único ornamento.
- Ouro é luz: janela acesa, ação principal, passo concluído. Nunca enfeite.
- Três climas de obra (falta, caminho, em dia) para estado, e só para estado.
- Títulos em Bricolage Grotesque pesada e apertada; corpo em Figtree com algarismos tabulares; nomes de obra bordados em Nunito 800.
- Formas redondas e macias: pílula para ação e entrada, cantos de 14 a 36px para superfícies.

## Colors

Uma noite azul fria com uma única luz quente, que vira uma manhã verde-acinzentada clara sem perder a mesma luz.

### Primary
- **Ouro de Janela** (`ouro`): a única cor quente. Janelas acesas na colcha, botão principal, nó aceso dos eixos, preenchimento do fio do ciclo, linha que costura a sobra de uma obra na falta da outra, opção destacada no WhatsApp, seleção de texto. **Ouro Aceso** (`ouro-hi`) é o hover do botão, o anel de foco na noite e o horário dos eixos. **Ouro Tinta** (`ouro-ink`) é o ouro legível sobre a manhã: anel de foco e cursor dos campos claros.

### Secondary
- **Clima das obras**, sempre como estado, nunca como decoração: **Vermelho Queimado** (`falta`) para falta prevista, **Azul de Caminho** (`caminho`) para material a caminho, **Verde em Dia** (`emdia`) para obra em dia. Na colcha eles aparecem diluídos no fundo do retalho e num halo radial; no bilhete, como um ponto de 10px.

### Neutral
- **Azul-Noite** (`noite`): o chão do mundo. Fundo do body, hero, madrugada e rodapé; tinta do botão ouro. `noite-2` e `noite-3` são retalhos e superfícies um degrau acima.
- **Fio** (`fio`) e **Fio Claro** (`fio-hi`): a linha da costura na noite. `fio-hi` também é o nome bordado.
- **Tinta da Noite** (`tinta-noite`): texto principal sobre a noite. **Mudo da Noite** (`mudo-noite`) é o texto secundário; **Lead da Noite** (`lead-noite`) os parágrafos de abertura; **Apagado da Noite** (`apagado-noite`) só para nota de rodapé, fonte e o aviso de exemplo fictício, a 13px.
- **Manhã** (`manha`, `manha-2`): o chão claro das seções da manhã. **Papel** (`papel`): o briefing e a ficha, as superfícies que se lêem de perto.
- **Tinta** (`tinta`) e **Mudo** (`mudo`): texto principal e secundário na manhã. **Linha da Manhã** (`linha-manha`) separa as linhas do briefing; **Costura da Manhã** (`costura-manha`) é a costura tracejada no claro (eixo do ciclo, promessas, FAQ); **Borda do Campo** (`borda-campo`) contorna input e chip.
- **Erro da Manhã** (`erro-manha`) e **Ok da Manhã** (`ok-manha`): mensagens de formulário, prazo urgente e a linha de "feito" no claro. Na noite, a mensagem usa as versões claras (`#ffb3a3`, `#9fd8b5`).

Os tokens de `lead-noite` a `ok-manha` (exceto `manha`, `papel`, `tinta`, `mudo`, `linha-manha`) estão no CSS como valores literais repetidos, ainda não promovidos a propriedades em `:root`. Promover é bem-vindo; mudar o valor não.

### Named Rules
**A Regra da Luz Única.** Ouro é a única cor quente e significa luz ou ação. Se uma tela tem dois ouros disputando o olhar, um deles está errado.

**A Regra do Clima.** Vermelho, azul e verde só aparecem como estado de uma obra ou de uma mensagem. Nunca como cor de seção, ícone decorativo ou destaque de título.

**A Regra da Hora.** O fundo diz a hora. Conteúdo da noite (o agente trabalhando) fica no azul-noite; a decisão humana fica na manhã. Não coloque a decisão no escuro nem a vigília no claro.

## Typography

**Display Font:** Bricolage Grotesque (com system-ui, sans-serif)
**Body Font:** Figtree (com system-ui, -apple-system, Segoe UI)
**Bordado:** Nunito 800 (com Figtree)

**Character:** Uma grotesca de cartaz, pesada e apertada, para dizer a ideia de uma vez; uma sans calma de vigília para explicar. O bordado arredondado em caixa alta é a letra da colcha, não da página.

### Hierarchy
- **Display** (750, clamp(42px, 5vw, 72px), 1.04, -0.03em): só o h1 do hero. A palavra que troca ("confere") vai em ouro.
- **Headline** (700, clamp(36px, 4.6vw, 64px), 1.04, -0.03em): um h2 por seção, frase completa com ponto final.
- **Title** (700, 24px): passos do eixo da madrugada. Os títulos das promessas usam a display a 19px, -0.01em.
- **Lead** (400, clamp(18px, 1.5vw, 20px), 1.6, máx. 36ch no hero; 17 a 19px e 46ch nas seções).
- **Body** (400, 17px, 1.6; 16px abaixo de 560px): algarismos tabulares no body inteiro, para que conta e hora alinhem.
- **Label** (650, 14px): horários do eixo, prazos do briefing, rótulos de campo (15px). O topo do bilhete usa 700, 14px, 0.08em, caixa alta, porque é o nome da obra.
- **Bordado** (Nunito 800, 14px na colcha, 11.5px nos retalhos da seção entre obras, 0.06 a 0.1em, caixa alta): nomes de obra ao longo da costura, em `fio-hi`. Só dentro da colcha.

### Named Rules
**A Regra do Título que Fala.** Todo título é uma frase com verbo e ponto final ("De manhã, a decisão já vem pronta."). Sem rótulo solto acima do título.

**A Regra do Bordado.** Caixa alta espaçada é exclusiva do nome de obra (na colcha e no topo do bilhete). Em qualquer outro lugar, texto corrido em caixa normal.

## Layout

Coluna central de até 1180px (`coluna`), com calha lateral fluida (`gut`, de 16 a 40px). Seções com respiro vertical grande (`sec`, de 96 a 160px); as seções da manhã encurtam esse respiro (64 a 96px) para ler como um bloco só. O hero ocupa a altura da tela (100svh) e é dividido em duas colunas assimétricas (1.15fr / 0.85fr): título e inscrição à esquerda, bilhete à direita, sobre a colcha que ocupa o fundo inteiro. Um véu escuro da esquerda para a direita garante contraste do texto sobre a colcha.

Seções de conteúdo usam duas colunas iguais (`dois`) com espaço de 40 a 96px. Sequências no tempo usam um fio horizontal com nós: quatro passos na madrugada, sete etapas no ciclo.

Responsivo: abaixo de 980px tudo vira uma coluna, o bilhete encosta à esquerda, o véu do hero passa a ser de cima para baixo, e os fios horizontais viram verticais à esquerda (recuo de 34px). Abaixo de 760px os links da navbar somem. Abaixo de 560px a inscrição empilha (campo sobre botão, canto de 22px), o briefing vira uma coluna e o corpo cai para 16px. A página não tem rolagem horizontal em 390px.

## Elevation & Depth

Profundidade vem de vidro e camada tonal, não de sombra dura. Na noite, as superfícies flutuantes (navbar, bilhete) são vidro azul-noite translúcido com desfoque e uma sombra longa e difusa; os retalhos sobem um degrau de tom (`noite` → `noite-2` → `noite-3`). Na manhã, papel claro sobre chão claro com sombra muito suave e longa. Não há sombra deslocada sólida.

### Shadow Vocabulary
- **Faixa** (`box-shadow: 0 2px 6px rgba(4,8,18,.25), 0 18px 48px -16px rgba(4,8,18,.6)`): navbar na noite, com `backdrop-filter: blur(18px) saturate(160%)`.
- **Bilhete** (`box-shadow: 0 30px 80px -30px rgba(0,0,0,.7)`): a nota do agente sobre a colcha, com `backdrop-filter: blur(14px)`.
- **Botão ouro** (`box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 4px 12px -4px rgba(4,8,18,.45)`): brilho de borda em cima, sombra curta embaixo. Na manhã a sombra esquenta: `0 4px 14px -6px rgba(160,106,22,.6)`.
- **Papel** (`box-shadow: 0 1px 2px rgba(20,36,30,.05), 0 24px 60px -30px rgba(20,36,30,.3)`): briefing; a ficha usa `0 30px 70px -40px rgba(20,36,30,.4)`.

### Named Rules
**A Regra do Vidro Noturno.** O que flutua sobre a colcha é vidro azul-noite com costura por dentro, nunca um cartão opaco.

## Shapes

Tudo é macio e arredondado, como tecido. Ação e entrada são pílulas (999px). Superfícies crescem de canto conforme crescem de tamanho: campo 14px, proposta 16px, bilhete 20px (`r`), briefing 24px, ficha 28px, celular 36px. Os retalhos da colcha são quadriláteros irregulares, recuados do vizinho e com junta arredondada, nunca grade reta.

A costura é a forma assinatura: tracejado claro em `stroke-dasharray` 6 5 (colcha) ou 7 6 (retalhos maiores), e nas superfícies um `outline` tracejado de 1px com `outline-offset` negativo (−6px na navbar, −8px no bilhete, −10px na ficha), desenhando uma linha de costura por dentro da borda. Separadores e fios de tempo são bordas tracejadas de 1 a 1.5px.

A marca (`logo.svg`) é um quadrado ouro de canto 16/64, com um P em azul-noite: a barriga em traço grosso e a haste fina como o fio de um prumo, terminando no peso. O nome Plumo carrega a mesma raiz em português (prumo), espanhol (plomo, plomada) e inglês (plumb).

## Components

### Buttons
- **Shape:** pílula (999px), altura mínima de 48px, peso 650.
- **Primary (ouro):** fundo `ouro`, tinta `noite`, padding horizontal de 22px. Variantes de tamanho: pequena (40px, 15px) na navbar; grande (54px, 17px, largura total) na ficha.
- **Hover / Focus / Active:** hover clareia para `ouro-hi` (só em dispositivos com hover); pressionado encolhe para 0.97; foco com anel de 2px `ouro-hi` (na manhã, `ouro-ink`) e respiro de 3px. Ocupado (`aria-busy`) mostra um anel girando ao lado do texto.
- **Linha:** transparente, tinta clara, borda tracejada de 1px em `fio-hi`. É o botão secundário da noite, costurado em vez de preenchido.
- **Desfazer:** texto sublinhado em `tinta`, sem fundo, logo depois de uma decisão aprovada.

### Chips
- **Papel (escolha de função na ficha):** pílula de 42px, fundo branco, borda `borda-campo`. Selecionado inverte para fundo `tinta` com texto branco. O rádio fica invisível por cima do chip; o foco aparece no chip com anel `ouro-ink`.

### Cards / Containers
- **Bilhete (noite):** canto 20px, vidro `rgba(22,36,61,.78)` com desfoque, borda de 1px branca a 10%, costura interna a −8px. Topo com o ponto de clima, o nome da obra em caixa alta e a hora. As linhas entram uma a uma, como escritas pelo agente; a conta fica numa faixa levemente clara, e a fonte fecha embaixo, depois de um tracejado.
- **Briefing (manhã):** canto 24px, `papel`, borda `linha-manha`, sombra Papel. Cada decisão é uma linha de três colunas (prazo de 88px, texto, botão). Aprovada, a linha fica verde-clara e mostra "feito" com desfazer.
- **Ficha (inscrição):** canto 28px, `papel`, costura interna a −10px, sem borda sólida.
- **Proposta:** canto 16px, fundo branco a 6% na noite, borda ouro a 45%, sobe com desfoque ao aparecer.

### Inputs / Fields
- **Inscrição do hero:** pílula de vidro claro (branco a 7%, borda a 14%) envolvendo campo e botão juntos. Em foco, a borda vira ouro a 70%; enviado, verde. A mensagem fica logo abaixo, fora do fluxo.
- **Campo da ficha:** 50px, canto 14px, fundo branco, borda `borda-campo`, cursor `ouro-ink`. Foco: borda `#a06a16` e halo ouro de 4px a 25%. Inválido: borda `erro-manha`.

### Navigation
- Faixa pílula de vidro azul-noite, solta 14px do topo, largura até 1040px, com borda branca a 9% e costura interna a −6px. Ao rolar, estreita para 880px e escurece. Sobre as seções da manhã, vira linho claro (branco a 78%) com a costura em `mudo`. Links de 15px/550 em `mudo-noite`, hover com fundo branco a 7%. Some abaixo de 760px, ficando marca e botão.

### Colcha (signature)
SVG gerado em `app.js`: retalhos irregulares em três tons de noite, cada um com costura tracejada; obras tingidas pelo clima com halo radial; janelas em traço ouro curto que piscam devagar e fora de fase; nome da obra bordado na costura de cima. No hero é o fundo inteiro; nas seções da madrugada e da manhã ela continua por baixo, só em costura (sem retalho preenchido), a 45% (noite) ou 70% (manhã), com máscara que some nas bordas.

### Fio do tempo (signature)
Um fio tracejado com nós redondos (16 a 18px). Nó apagado: centro no tom do fundo, aro em linha clara. Nó aceso: ouro. Os passos acendem em sequência com o scroll; no ciclo, uma barra ouro de 3px cresce sobre o tracejado até a etapa atual.

### Movimento
Easing de saída `cubic-bezier(.23,1,.32,1)` para quase tudo; `cubic-bezier(.77,0,.175,1)` só na saída da palavra que troca. Entradas sobem 6 a 14px saindo de um leve desfoque, de 260 a 600ms. Tudo que é contínuo ou entra com o scroll fica atrás de `prefers-reduced-motion: no-preference`.

## A aplicação do produto ainda não migrou

O app do produto (`apps/web`, em `apps/web/app/globals.css`) e o protótipo da raiz (`css/app.css`, `css/motion.css`) ainda rodam o sistema visual anterior do **Canteiro**: concreto claro, sidebar verde-grafite, acento ocre, IBM Plex Sans no corpo, densidade de ferramenta de trabalho. Este DESIGN.md não descreve esse sistema e não autoriza aplicar a colcha, a noite ou o ouro da landing dentro do app. A migração do app para o mundo Plumo é uma decisão em aberto.

## Do's and Don'ts

### Do:
- **Do** usar `ouro` apenas como luz e ação: janela, botão principal, nó aceso, linha de costura que resolve uma falta.
- **Do** desenhar costura com tracejado claro (6 5 ou 7 6) ou `outline` dashed de 1px com offset negativo; é a única ornamentação.
- **Do** escolher o fundo pela hora: trabalho do agente na noite (`noite`), decisão humana na manhã (`manha`), transição só no degradê da aurora.
- **Do** escrever títulos como frases com ponto final em Bricolage Grotesque, -0.03em.
- **Do** rotular todo exemplo como fictício ("Exemplo ilustrativo, com obras e números fictícios.") e mostrar a conta e a fonte em todo número.
- **Do** manter foco visível (2px `ouro-hi` na noite, `ouro-ink` na manhã) e todo movimento contínuo atrás de `prefers-reduced-motion`.

### Don't:
- **Don't** usar vermelho, azul ou verde fora de estado de obra ou mensagem de formulário.
- **Don't** usar degradê como enfeite. O único degradê de cor da página é a aurora, que é o relógio do mundo; os outros são véus de contraste e halos de clima na colcha.
- **Don't** pôr caixa alta espaçada fora do nome de obra, nem rótulo pequeno acima de título.
- **Don't** usar sombra sólida deslocada, cartão opaco sobre a colcha ou canto reto em superfície.
- **Don't** abrir com hero dividido de SaaS com print de painel; o hero é a colcha.
- **Don't** usar ícone de glifo ou emoji; quando precisar de ícone, traço em SVG inline.
- **Don't** inventar cliente, depoimento, preço ou número de mercado.
