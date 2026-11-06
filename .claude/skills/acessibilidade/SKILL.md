---
name: acessibilidade
description: Use ao criar ou mudar componente interativo do canteiro-web — botão só com ícone, menu, abas, segmentado, combobox, lista de opções, diálogo, aviso, campo de formulário, região que atualiza sozinha — e quando o pedido citar acessibilidade, a11y, ARIA, leitor de tela, VoiceOver, teclado, Tab, foco, contraste ou "não dá para usar sem mouse".
---

# Acessibilidade no Plumo

Meta de `PRODUCT.md`: WCAG AA (4,5:1 no corpo, nos dois temas), foco visível pelo teclado, tudo operável sem arrastar,
`prefers-reduced-motion` respeitado, alto contraste para uso no sol. Os testes já consultam a tela **por papel ARIA**
(`getByRole("button", { name: … })`, `"dialog"`, `"menu"`, `"tab"`, `"radio"`, `"combobox"`, `"alert"`, `"log"`) —
se o papel ou o nome acessível estiver errado, o teste quebra. Use isso a seu favor.

## Padrões que já existem (reaproveite)

| Peça | Onde | O que garante |
|---|---|---|
| `Modal`, `Drawer`, `Confirmar` | `componentes/Dialogo.tsx` | `role=dialog`, `aria-modal`, `aria-labelledby` no título, X com `aria-label="Fechar"`, Esc, foco preso e devolvido; pilha (só o de cima ouve o teclado) |
| Ordem do Tab | `componentes/foco.ts` | `paradasDoTab`/`proximaParada`: todo navegador para nos mesmos lugares (o Safari pula botões); grupo de rádios = uma parada, setas dentro (`setaNoRadio`) |
| `MenuMais` | `componentes/MenuMais.tsx` | `menu`/`menuitem`, Enter/Espaço/↓ abre no 1º, ↑ no último, Home/End, Esc devolve o foco ao botão |
| `CampoInsumo` | `componentes/formularios/CampoInsumo.tsx` | Combobox ARIA 1.2: ↑↓, Enter, Esc, foco sempre no campo |
| `.seg` com `role="tablist"` | `Suprimentos.tsx`, `Gastos.tsx` | Abas da tela, com `aria-label` no grupo e `role="tabpanel"` no conteúdo |
| Aviso | `contexto.tsx` | Toast dentro de `role="status" aria-live="polite"`; não some com ponteiro ou foco em cima |
| Conversa | `Conversa.tsx` | `role="log"` nas mensagens + anúncio `sr-only` em `role="status"` |
| Proposta | `CartaoProposta.tsx` | `role="group"` com nome = título da proposta |
| Barra inferior | `Casca.tsx` | `nav aria-label`, `aria-current="page"` no item ativo, rótulo no `aria-label` quando compacta |

## Regras

- Botão é `<button type="button">` (nunca `div onClick`). Link que navega é `<a>`/`Link`.
- Botão só com ícone tem `aria-label`; o `Icone` é decorativo. Contador visual (`.bi-n`) é `aria-hidden` e o número vai
  no `aria-label` ("Mais (3 aprovações pendentes)").
- Campo tem `<label>` associado (os testes usam `getByLabelText`); senha com `autocomplete` certo.
- Erro de formulário em `role="alert"`; carregando em `role="status"`; ocupado com `aria-busy`.
- Estado em atributo, não só em cor: `aria-expanded`, `aria-current`, `aria-checked`/`checked`, `aria-selected`,
  `aria-haspopup`.
- Quando o elemento focado some (Aprovar → "Aprovado · Desfazer"), mova o foco para o substituto.
- Painel/gaveta escondido fica `hidden`/`inert` (sai da árvore de foco). Use `inert`, não só `display` via CSS.
- Foco visível: `:focus-visible` global usa `--accentInk`; não ponha `outline:none` sem substituto.
- Nada de ação só por arrastar ou só por hover.
- Texto ≥ 13 px no desktop e ≥ 15 px no celular para corpo; nada abaixo de 12.

## Como testar

- Teste de componente: consulte por papel e nome (`screen.getByRole("button", { name: "Aprovar R$ 1.326,00" })`),
  verifique foco (`expect(el).toHaveFocus()`), e use `userEvent.tab()` / `userEvent.keyboard("{Escape}")`.
- À mão: só teclado do início ao fim do fluxo (Tab, Shift+Tab, Enter, Espaço, Esc, setas), no Chrome **e** no Safari.
- VoiceOver (Cmd+F5) numa ação principal: o nome lido diz a consequência?
- Contraste nos dois temas (DevTools → Accessibility → contrast).

## Checklist

- [ ] Elementos nativos (`button`, `a`, `input` com `label`)
- [ ] Ícone sozinho tem `aria-label`; decorativo fica `aria-hidden`
- [ ] Diálogo via `Dialogo.tsx`; menu via `MenuMais`; Tab segue `foco.ts`
- [ ] Estados expostos em atributos ARIA, não só em cor
- [ ] Erro `role=alert`, progresso `role=status`/`aria-busy`
- [ ] Foco nunca se perde (abre, fecha, botão que some)
- [ ] Teste consulta por papel e nome; fluxo feito só no teclado
- [ ] Contraste AA nos dois temas; `prefers-reduced-motion` respeitado
