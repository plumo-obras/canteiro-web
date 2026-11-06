---
name: contrato-api
description: Use ao consumir uma rota nova ou alterada do canteiro-api (ou do canteiro-agente) no canteiro-web — tipo novo em lib/contrato.ts, método novo em lib/cliente.ts, rota que precisa passar pelo repasse /srv/api — e quando aparecer "Rota fora do contrato." (404 do repasse), "o contrato mudou", "nova rota da API", "PATCH/PUT/DELETE em …", "allowlist" ou mudança em docs/contrato.md do canteiro-api.
---

# Contrato com a API

A fonte da verdade é `docs/contrato.md` no **canteiro-api**. A web espelha, nunca inventa: se a rota ou o campo não está
lá, combine no canteiro-api primeiro.

O caminho de uma chamada: componente → `api.metodo()` (`lib/cliente.ts`) → `comAcesso("/srv/api/…")`
(`lib/sessao.ts`) → `app/srv/api/[...caminho]/route.ts` → `caminhoPermitido()` (`lib/servidor/repasse.ts`) →
`API_URL` (ou `responder()` de `lib/demo/loja.ts` no modo de demonstração).

## Passo a passo para uma rota nova

1. **Tipos** em `lib/contrato.ts`, espelhando os modelos da API: dinheiro em **centavos** (`Centavos`), quantidade em
   **milésimos** (`Milesimos`), datas como texto ISO (`DataISO`). Escrita que gera registro devolve
   `ComRegistro<T>` (`registro_id` para o Desfazer). Nenhum `any`.
2. **Cliente** em `lib/cliente.ts`, dentro de `api`: `chamar<T>(metodo, caminho, corpo?)`. Segmento variável sempre com
   `seg()` (`encodeURIComponent`); query com `q({...})` (ignora vazio). Arquivo vai como `FormData` (o `chamar` não põe
   content-type). Comente o que não é óbvio (quem pode, se é prévia ou grava, idempotência).
3. **Allowlist** em `caminhoPermitido()` — sem isso o repasse responde 404 "Rota fora do contrato.":
   - `GET`/`POST`: o 1º segmento precisa estar em `PREFIXOS`.
   - `PATCH`: só `/{recurso}/{id}` (2 segmentos) com o recurso em `EDITAVEIS`.
   - `PUT`/`DELETE`: casos nomeados (`conta/chave-anthropic`, `obras/{id}/cronograma`). Abra exceção explícita, nunca
     um prefixo inteiro.
   - Só leitura (`conta`, `uso`…): `SO_LEITURA`.
   - Rota interna (`/interno/...`) e `/auth` **nunca** passam por aqui.
   - Atualize o comentário acima de `PREFIXOS` dizendo o que passou a ser permitido.
4. **Teste positivo e negativo** em `lib/servidor/repasse.test.ts`: o método/caminho novo passa **e** os vizinhos não
   (outro método, um segmento a mais, o recurso sem id). Veja o bloco de `gastos` como modelo.
5. **Demonstração**: se a tela aparece no modo demo, implemente a rota em `responder()` (`lib/demo/loja.ts`) seguindo o
   contrato ao pé da letra; se não fizer sentido, ponha a tela em `SO_COM_API` (`componentes/sessoes.ts`).
6. **Compatibilidade de deploy**: a web pode ir ao ar antes da API. Se a rota pode ainda não existir, trate 404/405 como
   `RotaAusente` com mensagem para a pessoa (modelo: `mudarEtapaGasto`).
7. Teste do componente que usa a rota com `criarRede` (skill `testes-componente`).

## O que não fazer

- Não fazer conta de regra de negócio na tela (falta, saldo, %, total a receber): a API devolve pronto; a web formata
  com `lib/formato.ts`. O espelho de regras em `lib/demo/regras-espelho.ts` é **só** da demonstração.
- Não chamar `fetch` direto para a API nem para `/srv/api` fora do `cliente.ts`.
- Não repassar header do navegador além dos de `headersDeRepasse()` (authorization, content-type, accept); nada de
  cookie para a API.
- Não pôr URL de serviço, segredo ou `PROXY_SEGREDO` em arquivo: só ambiente, lido em `lib/servidor/config.ts`.

## Agente

A conversa vai por `conversar()` (SSE, `/srv/agente/conversa`, lido por `lib/sse.ts`) e a leitura de comprovante por
`lerComprovante()` (`/srv/agente/leitura`). Evento novo do agente entra em `EventoConversa` (`lib/contrato.ts`) e em
`interpretarEvento` (`lib/sse.ts`), com teste.

## Checklist

- [ ] Rota e campos existem em `docs/contrato.md` do canteiro-api
- [ ] Tipos em `lib/contrato.ts` (centavos, milésimos, ISO, `ComRegistro`)
- [ ] Método em `api` com `seg()`/`q()`
- [ ] `caminhoPermitido()` liberando só o necessário, comentário atualizado
- [ ] Teste positivo **e** negativo em `repasse.test.ts`
- [ ] Demo implementada em `responder()` ou tela em `SO_COM_API`
- [ ] 404/405 tratado se a API pode estar atrás
- [ ] `pnpm test && pnpm tipos && pnpm lint`
