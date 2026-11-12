---
name: ux-fluxo
description: Use ao desenhar ou mudar um fluxo de tela do canteiro-web — botão que grava, formulário, modal, aprovação de proposta do agente, lista com estado vazio, mensagem de erro, texto de interface, navegação entre obra/sessão/tela — e quando o pedido falar em "fluxo", "UX", "texto do botão", "confirmação", "desfazer", "aviso/toast", "estado vazio", "carregando", "papel/viewer" ou "o agente deveria fazer X sozinho".
---

# UX e fluxo no Plumo

Quem usa: **engenheiro/gerente de obra** (escritório ou carro, decide o dia e volta para aprovar) e **mestre de obras**
(celular, mão suja, pouco tempo). Precisa entender cada tela em segundos, sem explicação. Leia `PRODUCT.md`
(princípios) e `FLUXOS.md` (os fluxos e o roteiro de validação) antes de inventar um fluxo novo.

## Linguagem

- Português do Brasil, vocabulário de obra: Insumos, Almoxarifado, Orçamento/verba, Pedidos, RDO, medição,
  empreiteiro, etapa, NF. Nada de "registro criado", "payload", "status 409", "sync", "entidade".
- Botão diz a **consequência**: "Aprovar R$ 1.326,00", "Lançar saída de 12 sc", "Registrar entrega", "Conferir NF" —
  não "OK", "Enviar", "Salvar". Veja `acoesDe()` em `componentes/suprimentos/Pedidos.tsx` e `rotuloAprovar()` em
  `componentes/CartaoProposta.tsx`.
- Toda sugestão mostra **a conta e a fonte** ("precisa 200 sc − saldo 46 − a caminho 120 = falta 34"). A conta vem
  pronta da API; a tela só formata (`lib/formato.ts`). Nunca recalcule regra de negócio na tela.
- Erro em linguagem de gente, com o que fazer: "Sua sessão acabou. Entre de novo.", "Seu papel não permite esta
  ação." (`MENSAGEM_PADRAO` em `lib/cliente.ts`). Mostre `mensagemDe(e)` de `componentes/contexto.tsx`.
- Sem emoji. Ícone só via `Icone`.

## O agente só PROPÕE

- Escrita vinda da conversa vira `Proposta` (pendente). Só `aprovar()` do `useCasca()` executa — por clique de uma
  pessoa, em `CartaoProposta` (na conversa e nas Aprovações, o mesmo estado em `cartoes`).
- O agente nunca abre aba sozinho, nunca grava, nunca "auto-aprova". Se o pedido for "o agente faz X direto", a
  resposta é: o agente prepara a proposta, a pessoa aprova.
- Recusar pede motivo (`ModalRecusar`) e fica à vista, ao lado do Aprovar e como botão secundário (no "⋯" o
  testador não achava). O "⋯" do cartão guarda só o "Ajustar e aprovar…".

## Toda escrita: aviso + Desfazer

- Depois de gravar: `mudou()` (as telas recarregam pela `versao`) e `avisarFeito(texto, r.registro_id)`. Com
  `registro_id`, o toast ganha "Desfazer" (chama `api.desfazerRegistro`); sem, vira aviso simples. Texto no passado e
  concreto: "Saída de 12 sc de Cimento CP-II lançada." (veja `ModalMovimento.tsx`).
- A rota nova da API precisa devolver `ComRegistro<T>` (`registro_id`) — se não devolve, peça no canteiro-api.
- POST que pode ser repetido leva `chave_idempotencia: uuid7()` (`lib/ids.ts`), renovada se der erro.
- Aprovação feita fica **no lugar**: "Aprovado HH:MM por Fulano · Desfazer", com o foco movido para o Desfazer.

## Confirmação antes de destruir ou pesar

- Ação que pesa ou não volta fácil (aprovar orçamento, desfazer versão, encerrar pedido, medição) usa `Confirmar` de
  `componentes/Dialogo.tsx`: título em pergunta ("Aprovar o orçamento?"), corpo dizendo o que vai acontecer, botão com o
  verbo ("Aprovar orçamento"), "Voltar" do lado. O erro aparece dentro do diálogo.
- **Modal grava** (clicar fora não fecha, para não perder o digitado); **Drawer consulta** (clicar fora fecha).

## Estados de toda tela que busca dado

Use `useCarregar(buscar, [deps..., versao])` e cubra os três:

- **Carregando** (só sem dado anterior): `<div className="carregando" role="status"><Icone nome="loader" className="spin"/>Carregando …</div>`.
  Com dado anterior, mantenha-o na tela (a lista não pisca).
- **Erro**: `<div className="aviso-erro" role="alert"><Icone nome="alert"/>{erro}</div>`.
- **Vazio**: `.card.vazio` com ícone, `h3` dizendo o estado em linguagem de obra e `p` dizendo o que vai aparecer ali
  e como ("Nada esperando você nesta obra" / "Quando o agente preparar uma compra…", em `Aprovacoes.tsx`).
- Botão ocupado: `disabled` + `aria-busy` + `Icone nome="loader" className="spin"`.

## Foco e diálogos

- Diálogo é sempre `Modal`, `Drawer` ou `Confirmar` (`componentes/Dialogo.tsx`): `role=dialog`, X, Esc, foco preso e
  devolvido. A ordem do Tab vem de `componentes/foco.ts` (`paradasDoTab`) — não confie no navegador (o Safari pula
  botões). Use `focoInicial` para mandar o foco ao campo/botão certo.
- Menu de ações secundárias: `MenuMais` (uma ação à vista por linha; o resto no "⋯").
- Quando o botão clicado some (Aprovar → Aprovado), mova o foco para o que entrou no lugar.

## Obra, sessão e tela na URL

`Casca.tsx` mantém `?obra=&sessao=&tela=` com `history.replaceState`: recarregar volta ao mesmo lugar (abrir outra
obra em silêncio leva a lançar na obra errada). Tela nova entra em `TELAS_VALIDAS`/`telaDe()` em
`componentes/sessoes.ts`; nome antigo de tela mapeia para o novo (`pedidos` → `suprimentos`). Tela que só existe com a
API real entra em `SO_COM_API`.

## Papéis

`viewer` só lê; `admin` opera e troca a chave própria; `master` também. Na tela, `const { podeOperar } = useCasca()`
esconde os botões de escrita (`podeOperar && …`). Isso é só cortesia: **quem barra é a API**. Não mostre botão
desabilitado sem explicação para viewer — esconda.

## Checklist

- [ ] Texto em português de obra; botão com a consequência; nenhum jargão técnico
- [ ] Nada grava sem clique de uma pessoa; proposta do agente passa por `aprovar()`
- [ ] Escrita chama `mudou()` + `avisarFeito(texto, registro_id)` e oferece Desfazer
- [ ] Ação que pesa passa por `Confirmar`; Modal para gravar, Drawer para consultar
- [ ] Carregando / erro / vazio cobertos, com `role=status` / `role=alert`
- [ ] Foco certo ao abrir, ao fechar e quando o botão clicado some
- [ ] Obra/sessão/tela continuam na URL; tela nova em `sessoes.ts`
- [ ] Botões de escrita atrás de `podeOperar`; a conta vem pronta da API
- [ ] Fluxo novo coerente com `FLUXOS.md` e os princípios de `PRODUCT.md`
