---
name: Plumo
description: Landing da lista de espera do Plumo. A cidade de obras de madrugada, desenhada com precisão de prancheta; a noite azul e o ocre são a marca, as telas do produto são o argumento.
colors:
  noite: "#0f1a2e"
  noite-2: "#16243d"
  linha-noite: "#25344f"
  tinta-noite: "#eef1f6"
  cinza-noite: "#aab5c8"
  ocre: "#e8b04a"
  ocre-tinta: "#94650f"
  costura: "rgba(232,226,210,.28)"
  dia: "#f1f3f0"
  dia-2: "#e4e8e4"
  branco: "#fbfcfb"
  tinta: "#13203a"
  cinza: "#56627a"
  linha: "#dce1e0"
  falta: "#b0472f"
  ok: "#25704c"
typography:
  display: { fontFamily: "Bricolage Grotesque, system-ui, sans-serif", fontSize: "clamp(42px, 5vw, 72px)", fontWeight: 650, lineHeight: 1.02, letterSpacing: "-0.03em" }
  headline: { fontFamily: "Bricolage Grotesque, system-ui, sans-serif", fontSize: "clamp(34px, 3.9vw, 56px)", fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.03em" }
  body: { fontFamily: "Figtree, system-ui, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: 1.6, fontFeature: "tnum" }
  registro: { fontFamily: "Geist Mono, ui-monospace, monospace", fontSize: "12px", fontWeight: 400, letterSpacing: "0.04em" }
rounded: { botao: "10px", cartao: "12px", janela: "16px", nav: "16px", palco: "24px", fone: "44px", escolha: "999px" }
spacing: { gut: "clamp(16px, 4vw, 48px)", sec: "clamp(96px, 11vw, 168px)", coluna: "1240px" }
---

# Plumo · landing

## Direção

O meio do caminho entre a primeira versão (a colcha da cidade, mais ilustrada) e uma versão sóbria de produto
financeiro. Da primeira fica a identidade: a noite azul que amanhece, o ocre da janela acesa, a colcha da cidade
no topo, a costura como ligação, a fonte com personalidade (Bricolage). Da versão sóbria ficam a disciplina e a prova:
telas do produto com borda fina e sombra longa, réguas, mono para números e registros, fotos de obra em duotone
azul-noite com o produto por cima.

Se ficar com cara de desenho animado (dobras, pontos-cruz grandes, pílulas em tudo, cor saturada em área grande) ou
com cara de cópia de banco privado (bege, serifa fina, foto sépia), saiu da direção.

## Regras

- **A noite é a marca.** Topo, madrugada, o palco do agente e a lista de espera são azul-noite; o produto e as
  decisões ficam no dia, claro e frio.
- **Ocre só para luz e ação**: a palavra que troca no título, o botão principal na noite, a fonte que o agente está
  consultando, a régua que acende. No dia o botão principal é azul-noite.
- **Costura fina** (tracejado 5/5, `costura`) só onde há ligação: os quarteirões da colcha, as réguas, os fios do
  palco. Nunca como moldura de cartão.
- **Mono** (Geist Mono) para hora, código, conta e fonte do dado.
- **Movimento curto**: entrada de 12px sem blur, o log do agente, a régua acendendo. `?static` desliga tudo.

## Fotos

Todas de domínio público (CC0), do Wikimedia Commons, tratadas em duotone azul-noite. Crédito no rodapé.

| Arquivo | Origem |
|---|---|
| `obra-estoque` | Construction workers in Iran 13 (Mostafameraji) |
| `obra-andaime` | Construction workers in Iran, Social documentary 02 (Mostafameraji) |
| `obra-noite` | Construction cranes on Toronto's skyline, at dusk, 2023 07 09 (Geo Swan) |
