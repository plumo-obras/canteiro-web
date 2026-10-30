# Canteiro · web (MVP-0)

Next.js (App Router) + TypeScript. O navegador fala só com o próprio Next (`/srv/*`), que repassa para a API e o
agente ou responde no modo de demonstração.

```bash
pnpm install
cp .env.exemplo .env.local          # CANTEIRO_DEMO=1 já vem ligado
pnpm dev                            # http://localhost:3000 (qualquer e-mail/senha; "leitura@…" entra como viewer)
pnpm test && pnpm tipos             # vitest (jsdom) e tsc
```

Com os serviços de verdade: `CANTEIRO_DEMO=` (vazio), `API_URL=http://localhost:8000`, `AGENTE_URL=http://localhost:8100`.
A API precisa ter o IP deste Next em `TRUSTED_PROXIES` (local: 127.0.0.1) para o limite por IP do login.
No modo de demonstração, a pergunta `/sem-creditos` simula o erro de créditos do agente.

- `lib/contrato.ts` tipos do docs/contrato.md · `lib/cliente.ts` cliente tipado · `lib/sse.ts` leitor SSE
- `lib/historico.ts` formatador puro do histórico da sessão (mensagens da API → bolhas, chips e cartões)
- `lib/sessao.ts` acesso só em memória; renovação em cookie httpOnly (`/srv/auth/*`, SameSite=Strict, header `x-canteiro`)
- `lib/demo/` a Casa Vila Nova em memória (espelho das regras só para a demonstração; a conta de verdade é da API)
- `app/globals.css` porta do visual do protótipo (`css/app.css` + `css/motion.css`)
