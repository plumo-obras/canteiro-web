---
name: modo-demo
description: Use ao mexer no modo de demonstração do canteiro-web (CANTEIRO_DEMO=1, lib/demo/) — dados da Casa Vila Nova, roteiro do agente fictício, rota que precisa responder na demo, login de viewer/master de teste — e quando o pedido disser "na demo não funciona", "rota não simulada", "preparar a demo", "dados fictícios", "roteiro da conversa" ou "simular erro".
---

# Modo de demonstração

Com `CANTEIRO_DEMO=1` (`modoDemo()` em `lib/servidor/config.ts`), o próprio Next responde no lugar da API e do agente,
com a obra fictícia **Casa Vila Nova** em memória. Serve para trabalhar na web sem os outros serviços e para a demo de
validação com um gerente de obra. Os dados somem quando o servidor reinicia.

## Peças

| Arquivo | Papel |
|---|---|
| `lib/demo/gastos.ts` | Gastos da obra: árvore (orçamento ou lista padrão + extras e tópicos), comprovantes com o arquivo, leitura simulada, revisão, confirmar/descartar, mudar etapa e o Desfazer deles |
| `lib/demo/erros.ts` | Os erros da demo (404, 409, 403, 413, 422, inclusive `RegraViolada`) que `responder()` traduz em status |
| `lib/demo/loja.ts` | Estado em memória (`estado()`, `reiniciarDemo()`), login (`entrarDemo`, `renovarDemo`, `sairDemo`, `trocarSenhaDemo`, `usuarioDoAcesso`), fornecedores, aprovar/recusar/desfazer, e `responder(metodo, caminho, params, corpo, u)` — o "servidor" de `/srv/api/*` |
| `lib/demo/agente.ts` | `roteiroDemo()`: respostas do agente por padrão de texto (orçamento, gastos, cronograma), em eventos SSE |
| `lib/demo/orcamento.ts` | Leitura/prévia de planilha CSV na demo |
| `app/srv/*/route.ts` | Cada rota checa `modoDemo()` antes de repassar |

## Regras

- **Siga o contrato ao pé da letra**: mesmas rotas, códigos de status, formatos e mensagens de `docs/contrato.md`
  (canteiro-api). A tela não pode saber se está na demo.
- **O agente só propõe também aqui**: escrita vinda da conversa vira `Proposta`; só `aprovar()` executa, com registro e
  Desfazer.
- **A tela nunca importa `lib/demo/`** — tudo lá é `server-only`. A conta de verdade é da API; o espelho existe só para
  a demo parecer real.
- Dados **fictícios e coerentes entre as telas** (o mesmo gasto no Orçamento, em Gastos, no Cronograma e na conversa).
  Sem cliente, depoimento, preço de mercado ou nome de concorrente reais (repositório público).
- Tela que depende de rota que a demo não tem: ponha em `SO_COM_API` (`componentes/sessoes.ts`) — hoje, `tributos`.

## O que a demo tem

- `semear()` monta a Casa Vila Nova: orçamento de 12 etapas, cronograma de 12 meses, 13 gastos com comprovante em PDF
  (a Fundação passou do orçado, um sem etapa) e 2 comprovantes na fila. A vitrine (Residencial Alto Padrão) está em
  orçamento, sem cronograma, para o Gerar com IA.
- Não há pedido, insumo, estoque nem compra (o produto não tem Compras): essas rotas caem no 404 de rota fora do
  contrato. Fornecedores existem (lista, cadastro e edição), para a gaveta de Gastos.
- A leitura de comprovante (`/srv/agente/leitura`) é simulada pela legenda; o roteiro do Plumo responde orçamento,
  gastos e cronograma e nunca propõe compra.

## Atalhos úteis

- Login: qualquer e-mail/senha; e-mail começando com `leitura` → viewer; com `master` → master; o resto → admin.
- Na conversa, `/sem-creditos` simula o erro de créditos do agente.
- Comprovante novo aceita foto (JPG, PNG, WEBP) ou PDF, pelos bytes; a leitura simulada escolhe pela legenda
  ("cimento", "fio", "pedreiro"…) e uma em cada três vem com dúvida.
- O roteiro do agente responde pelo assunto: uma etapa pelo nome ("quanto já gastei na fundação?"), estouro de
  orçamento, prazo e cronograma; pergunta de compra recebe o que o Plumo faz no lugar.

## Rota nova na demo

1. Implemente o ramo em `responder()` devolvendo `{ status, corpo }` igual à API (inclusive erros: 404 `NaoEncontrado`,
   409 `Conflito`, 403 `Proibido` para viewer).
2. Escrita gera registro com `registro_id` para o Desfazer, e `desfazer()` sabe voltar.
3. Teste em `lib/demo/loja.test.ts` (gastos em `lib/demo/gastos.test.ts`).
4. Confira à mão: `pnpm dev` com `CANTEIRO_DEMO=1`, faça o fluxo como admin e como `leitura@…`.

## Checklist

- [ ] Resposta idêntica ao contrato (status, formato, mensagem)
- [ ] Escrita só por aprovação; registro com Desfazer
- [ ] Viewer barrado no servidor da demo (403), não só escondido na tela
- [ ] Nada de `lib/demo/` importado por componente
- [ ] Dados fictícios e coerentes entre telas
- [ ] Teste em `lib/demo/loja.test.ts`; `pnpm build` com `CANTEIRO_DEMO=1` passa
