---
name: responsividade
description: Use ao criar ou mexer em qualquer tela, componente, modal, tabela ou regra de CSS do canteiro-web que precise funcionar no celular — e sempre que o pedido citar celular, mobile, 390 px, iPhone, Safari, WebKit, zoom, "quebrou no celular", "vazou da tela", barra inferior, toast escondido, botão pequeno demais, tabela que não cabe, @media ou @container.
---

# Responsividade no Plumo

Alvo: **celular de 390 px** (iPhone) funcionando inteiro, sem rolagem horizontal, e o desktop de 1366 px sem cortar
as pílulas do topo. O texto no celular pode vir **maior que o desenhado** (tamanho mínimo de fonte do Safari e do
WebView): nada de largura fixa em px que o texto estoure.

## Os cortes que o projeto usa (não invente outros)

| Corte | Onde | O que muda |
|---|---|---|
| `max-width:760px` | `app/casca.css`, `app/globals.css`, `useCelular()` em `componentes/midia.ts` | Celular: some `.topo-nav`, entra a `.barra-inf` fixa embaixo; editor do cronograma em lista |
| `max-width:899px` / `min-width:900px` | `app/casca.css`, `app/globals.css` | Sem trilho, painel vira gaveta; `.card.lista` vira lista; `.btn` ganha `min-height:44px`; `.so-movel` só abaixo de 900 |
| `900–1180px`, `1181–1480px` | `app/casca.css` | Notebook: esconde `.topo-marca-t`, aperta `.pilula` e `.seletor-bt` |
| `(hover:hover)` | ambos | Todo `:hover` vai dentro dele (no toque, hover gruda) |
| `(pointer:coarse),(max-width:899px)` | `globals.css` | Área de acerto de 44 px via `::before` com `inset:min(0px,calc(50% - 22px))` |
| `prefers-reduced-motion` | ambos | Animação vira só opacidade |

Quando a decisão muda **o que renderiza** (não só o estilo), decida em JS com `useCelular()`/`useMidia()`: no WebKit com
texto ampliado as duas versões chegaram a aparecer juntas só com CSS.

## Armadilha: `@container` com zoom no WebKit

No Safari com zoom de página, `@container` mede a largura **multiplicada pelo zoom** (1162 px a 35% viraram ~400 px).
As Aprovações do desktop caíam no leiaute estreito e a área de clique do "⋯" ficava ~35 px curta — o clique não
chegava. Por isso a `.ld-lista` **não é contêiner**: as Aprovações usam `@media (max-width:899px)` e só o balão da
conversa (`.msg.ai .corpo{container-type:inline-size}`) usa `@container (max-width:760px)`. Leia o comentário antes de
`.ld-lista` em `globals.css`. Regra: prefira `@media`; `@container` só onde a largura do pai é a única coisa que importa
e o elemento não carrega alvo de clique crítico perto da borda.

## Barra inferior do celular

- `.barra-inf` é `display:grid; grid-template-columns:repeat(5,minmax(0,1fr))` — **5 colunas**: 4 telas (`BARRA` /
  `BARRA_DEMO` em `componentes/Casca.tsx`) + "Mais". Item novo na barra = mexer no número de colunas; senão, vá para a
  `FolhaMais`.
- Cada `.bi-item` tem `min-width:0;overflow:hidden`: o rótulo nunca invade o vizinho. Se algum `.bi-rot` estoura,
  `BarraInferior` mede com `ResizeObserver` e põe `.compacta` (só ícone; rótulo só no ativo; nome no `aria-label`).
- A barra some quando abre `.modal`, `.drawer` ou `.folha-fundo` (`html:has(...)`), e fica `inert` com a gaveta aberta.
- O `.app` reserva `padding-bottom:calc(66px + env(safe-area-inset-bottom))` para a barra não cobrir conteúdo.

## Toasts e coisas fixas

- O `.toast` sobe acima da barra: `bottom:calc(76px + env(safe-area-inset-bottom))` com `.barra-inf` presente, e
  `calc(88px + ...)` abaixo de 900 px. Elemento fixo novo embaixo? Some com essa conta, não sobreponha.
- Use sempre `env(safe-area-inset-*)` em fixo junto à borda (o viewport é `viewportFit:"cover"`).
- `100dvh`, não `100vh` sozinho (o teclado encolhe o dvh; `interactiveWidget:"resizes-content"`).

## Alvos de toque

- Mínimo **44 px** abaixo de 900 px (`.btn`, `.iconbtn`, `.mm-b`, `.av-bt`, `.painel-sess`); `.btn.sm` 36 px.
- Para não crescer o desenho, use o padrão do `::before`/`::after` com inset negativo (`.ajuda-b::after{inset:-12px}`).

## Tabelas e listas

- Tabela dentro de `.card.lista` vira lista abaixo de 900 px: uma linha por item, `thead` escondido, o 1º `td.num` à
  direita do nome e os demais descendo. Marque números com `class="num"`.
- Tabela larga de verdade (cronograma, prévia de planilha): rola dentro de `.tbl-rola`, nunca empurra a página.
- `.page` e `.palco-tela` têm `overflow-x:clip` no celular como rede de segurança — não conte com ela; conserte a causa.
- Botão com texto longo ("Aprovar R$ 1.360,00") quebra linha: `min-width:0;max-width:100%;white-space:normal`
  (veja `.ld-acts .btn` e `.modal .rodape .btn`).
- Diálogo largo (`.modal .box.largo`) precisa da regra do celular **com a mesma especificidade**, senão os 880 px
  vencem (já aconteceu).

## Onde pôr a regra

Na seção do componente em `globals.css` (ou no `.module.css` dele), **depois** da regra base que ela sobrescreve. Casca
só em `app/casca.css`.

## Como verificar

1. `pnpm dev` (demo) e DevTools em 390 × 844; repita em 360, 760, 899, 900, 1366.
2. Aumente o texto (Safari: Ajustes de texto / zoom 125–150%) e veja se algo vaza ou se a barra fica `.compacta`.
3. No Safari/WebKit, teste com zoom de página reduzido nas Aprovações e clique no "⋯".
4. Abra um modal e um toast com Desfazer: a barra some no modal e o toast fica acima dela.
5. Procure rolagem horizontal: `document.documentElement.scrollWidth > innerWidth` no console deve ser `false`.

## Checklist

- [ ] Funciona em 390 px sem rolagem horizontal, com texto ampliado
- [ ] Usei os cortes existentes (760 / 899–900 / 1180 / 1480), não um novo
- [ ] `@media` em vez de `@container`, salvo motivo escrito em comentário
- [ ] `:hover` dentro de `@media (hover:hover)`
- [ ] Alvos de toque ≥ 44 px no celular
- [ ] Nada fixo cobre a barra inferior; toast continua acima dela; `safe-area` respeitada
- [ ] Tabela em `.card.lista` (vira lista) ou rolando em `.tbl-rola`
- [ ] Regra do celular depois da base, com especificidade suficiente
