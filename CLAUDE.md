# canteiro-web

A aplicação web do Canteiro (agente de IA para gestão de obras), em Next.js, e a landing da Plumo (`site/`, estática,
gerada por `site/build.py`). O navegador fala só com o próprio Next (`/srv/*`), que repassa para a
[canteiro-api](https://github.com/plumo-obras/canteiro-api) e o [canteiro-agente](https://github.com/plumo-obras/canteiro-agente)
ou responde no modo de demonstração (`CANTEIRO_DEMO=1`).

Leia antes de codar: `PRODUCT.md`, `DESIGN.md`, `FLUXOS.md` e, no canteiro-api, `docs/contrato.md` (o contrato que
`lib/contrato.ts` espelha). Veja também `AGENTS.md`: esta versão do Next tem mudanças que quebram o que você conhece.

## Regras da casa

**O repositório é PÚBLICO.** Nada de segredo em arquivo, teste ou log: `.env.local` fica fora do git (há
`.env.exemplo`). Só o servidor do Next lê `API_URL`, `AGENTE_URL` e `PROXY_SEGREDO`; nada disso vai para o navegador.

**A conta é da API, nunca da tela.** Falta, saldo, % e valores vêm prontos da API; a web formata. O modo de
demonstração (`lib/demo/`) espelha as regras só para a demo.

**O agente só propõe.** A tela mostra a proposta e só a aprovação de uma pessoa executa. Toda escrita aparece no
Histórico com Desfazer.

**Papel no servidor.** A interface esconde o botão, mas quem barra é a API.

**Landing gerada.** Os três idiomas de `site/public/` saem de `site/template.html` + `site/i18n/*.json`; HTML editado
à mão se perde. Rode `python3 site/build.py` (o CI confere com `--conferir`). Sem nome de concorrente em arquivo público.

**Comentário explica por quê, não o quê.** Português do Brasil no código e nas mensagens.

## Comandos

```bash
pnpm install
cp .env.exemplo .env.local                  # CANTEIRO_DEMO=1 já vem ligado
pnpm dev                                    # http://localhost:3000
pnpm test && pnpm tipos && pnpm lint         # vitest (jsdom), tsc e as regras dos hooks
python3 site/build.py                       # regenera a landing
docker build -t canteiro-web . && docker run --env-file .env.local -p 3000:3000 canteiro-web
```

O produto inteiro em contêineres sobe pelo `docker-compose.completo.yml` do canteiro-api (os três repos lado a lado).
