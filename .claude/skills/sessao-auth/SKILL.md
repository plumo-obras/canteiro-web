---
name: sessao-auth
description: Use antes de mexer em login, logout, renovação de token, troca de senha, cookies, headers do repasse ou qualquer arquivo entre lib/sessao.ts, app/srv/auth/[acao]/route.ts, lib/servidor/repasse.ts, lib/servidor/config.ts e componentes/useSessaoGarantida.ts — e quando o pedido falar em "sessão caiu", "deslogou sozinho", "401", "409 na renovação", "guardar o token", "localStorage", "cookie", "CSRF" ou "várias abas".
---

# Sessão e autenticação

Este código já levou várias correções de corrida. Leia os comentários de `lib/sessao.ts` inteiros antes de mudar algo;
cada desvio estranho ali tem um motivo escrito.

## O desenho (não quebre)

- **Acesso só em memória** (`estado` em `lib/sessao.ts`). Nunca em `localStorage`, `sessionStorage`, cookie legível ou
  estado global persistido: qualquer script injetado leria. Recarregou a página, a memória some e a sessão volta pela
  renovação.
- **Renovação em cookie httpOnly** `canteiro_renovacao` (`COOKIE_RENOVACAO`), `SameSite=Strict`, `secure` em produção,
  `path=/srv/auth` (`CAMINHO_COOKIE`): as chamadas de dados nem carregam o cookie. Só `app/srv/auth/[acao]/route.ts`
  (`entrar`, `renovar`, `senha`, `sair`) lê e grava.
- **CSRF**: toda chamada a `/srv/auth/*` manda `CABECALHO_CSRF` (`x-canteiro: 1`) e o servidor confere com
  `origemConfiavel()` (header próprio + mesma origem). Não remova nenhum dos dois.
- **Uma renovação por vez**: na aba (`renovando` compartilhada) e entre abas (`navigator.locks.request("canteiro-renovacao")`).
  Duas abas renovando com o mesmo cookie fazem a API ver token reusado e derrubar a sessão. A troca de senha roda no
  mesmo lock (`LOCK_COOKIE`), porque também troca o cookie.
- **409 da renovação** = outra renovação acabou de trocar o cookie; espera `ESPERA_RENOVACAO_EM_ANDAMENTO_MS` e tenta
  uma vez. Não é sessão acabada. Só 401/403 limpam a sessão; rede/5xx viram `"falha"` e mantêm o estado.
- **`keepalive: true`** na renovação: a que começou logo antes de uma recarga termina e o `Set-Cookie` chega.
- **Aba oculta não renova pelo relógio**; renova ao voltar a ficar visível (`aoMudarVisibilidade`). O 401 de uma
  chamada também renova.
- **`comAcesso()`**: num 401, se outra chamada já renovou, só repete; senão renova uma vez e repete.
- **`trocarSenha()` não usa `comAcesso`**: repetir uma senha atual errada gastaria duas tentativas do limite. Só
  repete quando o Next marca `sessao_expirada`.
- **Papel**: `usuario.papel` serve para esconder botão (`podeOperar`); autorização é sempre da API. `segundosAteVencer()`
  lê o `exp` do JWT **só** para agendar a renovação.
- **IP do visitante** (`headersDeRepasse`): só com `VERCEL` ou `CONFIAR_XFF=1`; `PROXY_SEGREDO` só do ambiente, e um
  `x-canteiro-proxy` vindo do navegador nunca passa. O cookie nunca segue para a API.
- `next.config.ts` proíbe iframe (`frame-ancestors 'none'`, `X-Frame-Options: DENY`): com a sessão voltando pelo cookie,
  um clique induzido aprovaria uma proposta.

## Antes de mudar

1. Rode e leia `lib/sessao.test.ts`, `app/srv/auth/[acao]/route.test.ts`, `lib/servidor/repasse.test.ts`,
   `app/srv/api/[...caminho]/route.test.ts` e `componentes/useSessaoGarantida.test.tsx`.
2. Escreva primeiro o teste da corrida/caso que você quer tratar (fake timers, `navigator.locks` simulado como em
   `lib/sessao.test.ts`).
3. Na demonstração o login é `entrarDemo`/`renovarDemo` (`lib/demo/loja.ts`) — a renovação também troca a cada uso;
   mantenha o comportamento igual ao da API.

## Checklist

- [ ] Acesso continua só em memória; nada em storage do navegador
- [ ] Cookie httpOnly, Strict, `path=/srv/auth`; CSRF (`x-canteiro` + origem) intacto
- [ ] Lock entre abas em toda operação que troca o cookie
- [ ] 409 ≠ sessão acabada; só 401/403 limpam
- [ ] Nenhum header novo do navegador vai para a API; segredo só do ambiente
- [ ] Testes de sessão, auth e repasse passando, com o caso novo coberto
