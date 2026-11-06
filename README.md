# canteiro-web

A web do **Plumo** — o app de gestão de obra com um agente de IA que prevê o que vai faltar, traz a ação pronta e só
grava com o OK de uma pessoa. Aqui moram o app em Next.js (as telas que o engenheiro de obra usa) e a landing pública
da Plumo (`site/`, estática).

## Onde este repositório entra

O produto são três repositórios lado a lado:

| Repositório | O que faz |
|---|---|
| [canteiro-api](https://github.com/plumo-obras/canteiro-api) | FastAPI. Dono dos dados, das regras (falta, saldo, %, valores), dos papéis e do registro com Desfazer. Publica o contrato em `docs/contrato.md`. |
| [canteiro-agente](https://github.com/plumo-obras/canteiro-agente) | O agente (Claude). Conversa em SSE, lê comprovantes e **propõe**; quem grava é a API, depois da aprovação. |
| **canteiro-web** (este) | Next.js. As telas, o login e o repasse `/srv/*`. Não faz conta: formata o que a API devolve. |

O navegador fala **só com o próprio Next**, nas rotas `/srv/*`. O servidor do Next repassa para a API e o agente — ou
responde sozinho, no modo de demonstração. Assim a API fica sem CORS, o cookie de renovação fica longe do JavaScript e
nenhuma URL interna chega ao navegador.

```
navegador ──► Next (/srv/api/*, /srv/agente/*, /srv/auth/*) ──► canteiro-api
                                                          └──► canteiro-agente (SSE)
```

## Stack

- Next.js 16 (App Router), React 19, TypeScript. **Esta versão do Next muda APIs que você conhece** — leia
  [`AGENTS.md`](AGENTS.md) antes de codar.
- CSS próprio, sem biblioteca de UI: tokens e classes em `app/globals.css`, a casca em `app/casca.css`, CSS Modules
  por componente (`componentes/**/*.module.css`). Fontes Figtree, Bricolage Grotesque e Geist Mono via `next/font`.
- `react-markdown` + `remark-gfm` + `remark-breaks` para as mensagens do agente.
- Testes: Vitest (jsdom) + Testing Library. Lint: ESLint só com as regras dos hooks do React.
- Node ≥ 22, pnpm 10.

## Rodar local

```bash
pnpm install
cp .env.exemplo .env.local      # CANTEIRO_DEMO=1 já vem ligado
pnpm dev                        # http://localhost:3000
```

### Modo de demonstração

Com `CANTEIRO_DEMO=1`, o próprio Next se passa pela API e pelo agente, com a obra fictícia Casa Vila Nova em memória
(`lib/demo/`). Os dados somem quando o servidor reinicia.

- Qualquer e-mail e senha entram. E-mail começando com `leitura` entra como **viewer** (só lê); com `master`, como
  **master** (o único papel que troca a chave própria da Anthropic). Os demais entram como admin.
- Na conversa, `/sem-creditos` simula o erro de créditos do agente.
- A aba Gastos só existe com a API de verdade (`SO_COM_API` em `componentes/sessoes.ts`); na demonstração, um link
  com `?tela=gastos` cai na conversa.
- `lib/demo/regras-espelho.ts` espelha as regras da API **só** para a demonstração. Fora dela, quem faz a conta é a API.

### Com os serviços de verdade

```bash
# .env.local
CANTEIRO_DEMO=
API_URL=http://localhost:8000
AGENTE_URL=http://localhost:8100
```

- A API precisa ter o IP deste Next em `TRUSTED_PROXIES` (local: `127.0.0.1`) para o limite de tentativas por IP do login.
- O IP do visitante só segue para a API na Vercel (que sobrescreve o `X-Forwarded-For`) ou com `CONFIAR_XFF=1`, que se
  liga **apenas** quando há na frente um proxy de confiança que sobrescreve o cabeçalho. Sem isso (a imagem Docker
  exposta direto), o visitante poderia forjá-lo para fugir do limite; então nenhum IP vai e a API usa o endereço da
  conexão.
- Na Vercel não há IP fixo para a API listar: o Next se identifica pelo segredo compartilhado `PROXY_SEGREDO`
  (cabeçalho `x-canteiro-proxy`). Ele só existe no ambiente; nunca em arquivo.
- Só o servidor do Next lê `API_URL`, `AGENTE_URL`, `PROXY_SEGREDO` e `CONFIAR_XFF` (`lib/servidor/config.ts`, com
  `server-only`). Nada disso vai para o navegador.

O produto inteiro em contêineres sobe pelo `docker-compose.completo.yml` do canteiro-api, com os três repositórios lado
a lado. Só a web:

```bash
docker build -t canteiro-web . && docker run --env-file .env.local -p 3000:3000 canteiro-web
```

A imagem roda o servidor standalone do Next, como usuário `node`, com healthcheck em `GET /srv/saude` (não chama a API).

## Testes, tipos e lint

```bash
pnpm test           # vitest run (jsdom; as rotas /srv/* rodam no ambiente node)
pnpm test:watch     # vitest em modo observação
pnpm tipos          # tsc --noEmit
pnpm lint           # eslint --max-warnings 0 (regras dos hooks do React)
pnpm build          # next build (o CI roda com CANTEIRO_DEMO=1)
python3 site/build.py --conferir   # a landing gerada está em dia?
```

O CI (`.github/workflows/ci.yml`) roda tipos, lint, testes e build da web, confere a landing e constrói a imagem
Docker. Os testes de componente usam `testes/rede.ts` (`criarRede`), um `fetch` falso por rota.

## O repasse `/srv/*`

| Rota | Arquivo | O que faz |
|---|---|---|
| `/srv/api/*` | `app/srv/api/[...caminho]/route.ts` | Repassa para a API **só** o que está na allowlist. |
| `/srv/agente/conversa` | `app/srv/agente/conversa/route.ts` | `POST` em SSE, sem bufferizar, com o token de quem pergunta. |
| `/srv/agente/leitura` | `app/srv/agente/leitura/route.ts` | Leitura de comprovante pelo agente. |
| `/srv/auth/[acao]` | `app/srv/auth/[acao]/route.ts` | Entrar, renovar, sair, trocar senha. Guarda a renovação em cookie httpOnly. |
| `/srv/saude` | `app/srv/saude/route.ts` | Healthcheck do contêiner. |

A **allowlist** fica em `caminhoPermitido()` (`lib/servidor/repasse.ts`): prefixos de dados do contrato liberados para
`GET`/`POST`, `PATCH` só em `/{recurso}/{id}` de uma lista fechada, `PUT`/`DELETE` só onde o contrato pede. Caminho com
`..`, barra codificada ou segmento vazio é recusado. Rota nova do contrato só passa depois de entrar ali — com teste
positivo e negativo em `lib/servidor/repasse.test.ts`. O pedido que segue para a API leva só `authorization`,
`content-type` e `accept` (`headersDeRepasse()`), nunca o cookie, e redirecionamento não é seguido.

A sessão (`lib/sessao.ts`): o token de acesso vive só na memória da aba; a renovação fica num cookie httpOnly,
`SameSite=Strict`, restrito a `/srv/auth`, que exige o header `x-canteiro: 1`. Duas abas não renovam ao mesmo tempo
(lock `canteiro-renovacao` em `navigator.locks`).

## Deploy

- **App**: Vercel, pela integração com o Git (a `main` publica). O `next build` da Vercel falha em erro de tipo; o CI
  roda os testes antes do merge. As variáveis (`API_URL`, `AGENTE_URL`, `PROXY_SEGREDO`) ficam no painel da Vercel.
  `next.config.ts` põe os cabeçalhos de segurança (sem iframe: com a sessão voltando pelo cookie, um clique induzido
  aprovaria uma proposta).
- **Landing (`site/`)**: projeto separado na Vercel (plumo-site), com `site/` como raiz e só `site/public/` publicado.
  Os três idiomas saem de `site/template.html` + `site/i18n/{pt,es,en}.json`: rode `python3 site/build.py` e
  versione o HTML gerado. HTML editado à mão se perde na próxima geração (o CI confere com `--conferir`).
- **Contêiner**: `Dockerfile` multi-estágio, base fixada por digest. É o caminho do `docker-compose.completo.yml`.

## Estrutura

```
app/
  layout.tsx, globals.css, casca.css   fontes, tema antes da 1ª pintura, tokens e a casca
  page.tsx, inicio/, entrar/, conta/, obras/nova/
  srv/                                  o repasse (api, agente, auth, saude)
componentes/
  Casca.tsx, contexto.tsx               a casca do workspace e o estado compartilhado (aviso, propostas, papel)
  Dialogo.tsx, foco.ts                  Modal, Drawer, Confirmar; ordem do Tab
  Icone.tsx                             ícones de traço inline (sem CDN)
  Conversa.tsx, CartaoProposta.tsx, Aprovacoes.tsx, Historico.tsx
  Orcamento.tsx, Suprimentos.tsx, Gastos.tsx, cronograma/, gastos/, suprimentos/, orcamento/, obra/, conta/, inicio/
lib/
  contrato.ts      tipos do docs/contrato.md (canteiro-api)
  cliente.ts       cliente tipado (sempre /srv/api e /srv/agente)
  sessao.ts        acesso em memória, renovação, lock entre abas
  sse.ts           leitor de SSE
  historico.ts     mensagens da API → bolhas, chips e cartões
  formato.ts       centavos e milésimos → texto
  servidor/        config e repasse (server-only)
  demo/            a Casa Vila Nova em memória
testes/            rede.ts (fetch falso) e vazio.ts (stub de server-only)
site/              landing da Plumo (gerada por build.py)
public/            fundos do tema claro e escuro
```

## Leia também

- [`CLAUDE.md`](CLAUDE.md) — as regras da casa (repositório público, a conta é da API, o agente só propõe).
- [`AGENTS.md`](AGENTS.md) — o aviso sobre esta versão do Next.
- [`PRODUCT.md`](PRODUCT.md) — para quem é, o que resolve, princípios e acessibilidade.
- [`DESIGN.md`](DESIGN.md) — a direção visual da marca (noite, ocre, costura).
- [`FLUXOS.md`](FLUXOS.md) — os fluxos do produto e o roteiro de validação.
- `.claude/skills/` — guias para o Claude Code (responsividade, UX, aparência, acessibilidade, testes, contrato,
  sessão e demonstração).
- No canteiro-api, `docs/contrato.md` — o contrato que `lib/contrato.ts` espelha.
