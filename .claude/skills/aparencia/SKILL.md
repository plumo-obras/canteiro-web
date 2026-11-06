---
name: aparencia
description: Use ao criar ou mudar o visual de qualquer coisa no app canteiro-web — cor, fonte, espaçamento, cartão, botão, pílula, ícone, sombra, vidro, tema claro/escuro, CSS Module novo — e quando o pedido disser "deixa mais bonito", "redesign", "ajusta o estilo", "nova tela", "ícone", "cor", "tema", "dark mode", ou sugerir instalar Tailwind/shadcn/MUI/biblioteca de ícones. Não é para a landing (site/), que segue o DESIGN.md e o build.py.
---

# Aparência do Plumo (app)

A identidade já existe e está aprovada: vidro escuro sobre foto de obra, **ocre** para ação, azul-noite, Figtree no
corpo, Bricolage nos títulos, Geist Mono para números/código. O trabalho é **manter**, não reinventar. A direção da
marca está em `DESIGN.md` (noite + ocre; nada de cara de desenho animado nem de banco privado) e em `PRODUCT.md`
(nada de "IA genérica": gradiente, brilho, card com ícone em cima de tudo).

## De onde vem cada coisa

- **Tokens**: topo de `app/globals.css`. Nunca escreva cor fixa no CSS de componente — use os tokens:
  - texto `--ink`, `--ink2`, `--muted`, `--faint`; superfícies `--card`, `--cardSolido`, `--cardForte`, `--sunk`,
    `--campo`, `--hover`, `--ativo`; bordas `--line`, `--line2`, `--edge`, `--edgeHi`; vidro `--glass`,
    `--glassStrong`, `--blur`; sombras `--hl`, `--shadow`, `--shadowLeve`, `--shadowUp`; véu `--veu`.
  - ação: `--accent`, `--accentHi`, `--accentSoft`, `--accentInk`, `--onAccent`, gradientes `--ocre`/`--ocreHi`.
  - semântica (cada uma com `X`, `XSoft`, `XInk`): `--amber` pede você · `--red` perda/bloqueio · `--blue` a caminho
    · `--green` resolvido · `--gray` informação. **A cor tem significado fixo** — não use verde "porque fica bonito".
  - tipografia: `--sans`, `--serif` (Bricolage, em `h1–h3`), `--mono`; tamanhos `--t-meta` 13 · `--t-body` 14 ·
    `--t-sec` 16 · `--t-bloco` 22 · `--t-h1` 28 · `--t-pagina` 40 (nada abaixo de 12).
  - espaço `--s1`…`--s6` (4–32); raios `--r` 24 (cartão) · `--ri` 16 (caixa interna) · `--rc` 14 (campo) · `--rp`
    pílula; movimento `--ease`, `--mv-rapido`, `--mv-base`.
- **Temas**: escuro é o padrão (`:root,[data-tema=escuro]`), claro em `[data-tema=claro]`. Todo token tem valor nos
  dois. Token novo? Defina **nos dois blocos**. A troca é `trocarTema()` em `componentes/tema.tsx`; o script em
  `lib/tema.ts` aplica antes da 1ª pintura.
- **Classes utilitárias** (`globals.css`): `.card`, `.card.lista`, `.card.vazio`, `.page`, `.sectit`, `.btn`
  (+ `.amb` ocre = ação principal, `.pri` tinta, `.sm`), `.iconbtn`, `.link`, `.pill` com `.ok`/`.warn`/`.bad`/`.info`,
  `.seg` (segmentado, `button.on`), `.chip`, `.num`, `.mut`, `.sm`, `.row`, `.sp`, `.sr-only`, `.carregando`,
  `.aviso-erro`, `.ld*` (linha de decisão), `.lc*` (linha de conta), `.modal`/`.drawer`, `.toast`, `.mm-b` ("⋯").
- **Componentes de cabeçalho**: `CabecalhoPagina`, `FaixaNumeros`, `BarraFiltros` (`componentes/CabecalhoPagina.tsx`) —
  o padrão aprovado no Orçamento. Tela nova usa eles.
- **Casca** (topo, trilho, painel, barra inferior): só em `app/casca.css`.
- **Ícones**: `<Icone nome="..." tam={16} />` de `componentes/Icone.tsx` (traço estilo Lucide, inline, sem CDN). Ícone
  novo = acrescentar o caminho SVG em `CAMINHOS`, no mesmo traço. `Logo` é o prumo da marca.

## Regras

- **Nenhuma biblioteca de UI ou de ícones nova** (Tailwind, shadcn, MUI, Chakra, lucide-react, styled-components…).
  `package.json` não ganha dependência de estilo.
- CSS de componente novo: **CSS Module** ao lado dele (`componentes/<area>/<area>.module.css`, `import s from …`),
  usando os tokens. Classe compartilhada por várias telas vai para a seção certa de `globals.css`, depois das regras
  que ela sobrescreve.
- **Ocre só para ação e luz**: uma `.btn.amb` por linha/lista (a primeira pendente nas Aprovações); o resto é `.btn`.
- **Um nível de caixa**: página → cartão. Não aninhe `.card` em `.card`. **Vidro só no que flutua** (casca, cartão,
  menu, toast); menu sobre vidro usa `--cardSolido`.
- Números com `font-variant-numeric:tabular-nums` (já no `body`); valores/códigos em `--mono` quando são registro.
- Movimento curto (150–250 ms, `--ease`, só transform/opacity) e coberto pelo bloco de `prefers-reduced-motion` no fim
  de `globals.css`. Nada de blur animado, brilho, gradiente decorativo.
- Todo `backdrop-filter` tem fallback em `@supports not (...)` com `--cardSolido`.
- Sem emoji na interface.

## Como checar que não divergiu

1. `grep -nE '#[0-9a-fA-F]{3,6}\b|rgba?\(' <seu arquivo>` — cor literal fora dos blocos de token é suspeita (exceções
   existentes: o gradiente do `.logo`/`.av` e o `.toast`).
2. Abra a tela nos **dois temas** (menu da conta → tema) e compare com uma tela vizinha (Orçamento, Suprimentos): mesmo
   raio, mesma sombra, mesmo peso de título, mesma cor de botão.
3. `git diff package.json` vazio.
4. Contraste AA (4,5:1 no corpo) nos dois temas, especialmente texto `--muted` sobre vidro.

## Checklist

- [ ] Só tokens; token novo definido no escuro **e** no claro
- [ ] Classes existentes reaproveitadas; CSS novo em módulo do componente
- [ ] Ícones via `Icone` (caminho novo em `CAMINHOS` se preciso)
- [ ] Nenhuma dependência de UI/ícone/CSS-in-JS nova
- [ ] Cor com a semântica certa; uma ação ocre por lista
- [ ] Um nível de caixa; vidro só no que flutua, com fallback
- [ ] Movimento curto e respeitando `prefers-reduced-motion`
- [ ] Conferido nos dois temas, ao lado de uma tela existente
