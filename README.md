# canteiro-web

Next.js (App Router) + TypeScript. O navegador fala só com o próprio Next (`/srv/*`), que repassa para a API e o
agente ou responde no modo de demonstração.

```bash
pnpm install
cp .env.exemplo .env.local          # CANTEIRO_DEMO=1 já vem ligado
pnpm dev                            # http://localhost:3000 (qualquer e-mail/senha; "leitura@…" entra como viewer)
pnpm test && pnpm tipos             # vitest (jsdom) e tsc
```

Em contêiner: `docker build -t canteiro-web . && docker run --env-file .env.local -p 3000:3000 canteiro-web`. O
produto inteiro (web + [canteiro-api](https://github.com/plumo-obras/canteiro-api) + [canteiro-agente](https://github.com/plumo-obras/canteiro-agente))
sobe pelo `docker-compose.completo.yml` do canteiro-api.

Com os serviços de verdade: `CANTEIRO_DEMO=` (vazio), `API_URL=http://localhost:8000`, `AGENTE_URL=http://localhost:8100`.
A API precisa ter o IP deste Next em `TRUSTED_PROXIES` (local: 127.0.0.1) para o limite por IP do login.
O IP do visitante só segue para a API na Vercel (que sobrescreve o `X-Forwarded-For`) ou com `CONFIAR_XFF=1`, que se
liga apenas quando há um proxy de confiança na frente que sobrescreve o cabeçalho; sem isso (a imagem Docker exposta
direto), o visitante poderia forjá-lo para fugir do limite, então nenhum IP vai e a API usa o endereço da conexão.
No modo de demonstração, a pergunta `/sem-creditos` simula o erro de créditos do agente.

- `lib/contrato.ts` tipos do docs/contrato.md (no canteiro-api) · `lib/cliente.ts` cliente tipado · `lib/sse.ts` leitor SSE
- `lib/historico.ts` formatador puro do histórico da sessão (mensagens da API → bolhas, chips e cartões)
- `lib/sessao.ts` acesso só em memória; renovação em cookie httpOnly (`/srv/auth/*`, SameSite=Strict, header `x-canteiro`)
- `lib/demo/` a Casa Vila Nova em memória (espelho das regras só para a demonstração; a conta de verdade é da API)
- `app/globals.css` o visual (nasceu do protótipo do monorepo antigo)
