---
name: testes-componente
description: Use ao escrever ou consertar teste no canteiro-web — componente React, hook, rota /srv/*, função pura de lib/ — e quando o pedido disser "adiciona teste", "cobre com teste", "teste quebrando", "vitest", "testing-library", "mock do fetch" ou ao terminar qualquer mudança de comportamento que ainda não tenha teste.
---

# Testes no canteiro-web

Vitest 5 + jsdom + Testing Library (`@testing-library/react`, `user-event`, `jest-dom`). Configuração em
`vitest.config.ts` (alias `@` → raiz; `server-only` → `testes/vazio.ts`) e `vitest.setup.ts` (jest-dom, `cleanup`,
`scrollIntoView` falso). Arquivo `*.test.ts(x)` ao lado do código.

```bash
pnpm test                                   # tudo
pnpm vitest run componentes/gastos          # uma pasta
pnpm test:watch
```

## A rede falsa: `testes/rede.ts`

Nunca mocke `api` nem `lib/cliente`. Simule o **HTTP** que o navegador faria para o Next:

```ts
import { criarRede, json, renovarOk, USUARIO } from "@/testes/rede";

const rede = criarRede({
  "POST /srv/auth/renovar": renovarOk,                         // a sessão nasce pela renovação
  "POST /srv/api/propostas/p1/aprovar": () => json({ proposta: APROVADA, registro: { id: "r1", criado_em: "…" } }),
  "GET /srv/api/obras/o1/gastos": ({ url }) => json(url.searchParams.get("antes_de") ? pagina2 : pagina1),
});
// …
expect(rede.chamadas.filter((c) => c.caminho.endsWith("/aprovar"))).toHaveLength(1);
expect(rede.chamadas.at(-1)!.corpo).toMatchObject({ motivo: "…" });
```

- Chave = `"MÉTODO /caminho"` sem query; rota não simulada devolve 404 com a mensagem — leia-a quando falhar.
- `sse(texto, tamanho)` entrega SSE em pedaços (prova que o leitor não depende de o evento chegar inteiro).
- `beforeEach/afterEach(() => limparSessao())` de `@/lib/sessao` (o acesso vive em memória de módulo);
  `afterEach(() => vi.unstubAllGlobals())` quando usar `vi.stubGlobal`.

## Montar componente

Componente que usa `useCasca()` precisa do provedor:

```tsx
render(
  <ProvedorCasca usuario={USUARIO} demo={false}>
    <MeuComponente … />
  </ProvedorCasca>,
);
```

- Viewer: `usuario={{ ...USUARIO, papel: "viewer" }}` e confira que o botão de escrita **não** aparece.
- Proposta no estado compartilhado: um componente-semente chama `receberPropostas([p])` (veja
  `componentes/CartaoProposta.test.tsx`).
- URL: `window.history.replaceState(null, "", "/?obra=o-emei&tela=orcamento")` antes de montar (`CascaObra.test.tsx`).
- Tempo do aviso: `vi.useFakeTimers()` + `DURA_COM_ACAO` exportado de `contexto.tsx`.

## Consultar como o usuário

- Por papel e nome: `getByRole("button", { name: "Aprovar R$ 1.326,00" })`, `within(linha)`, `findBy…` para o que
  chega depois. `getByLabelText` para campos. Evite `querySelector` e `data-testid`.
- Interaja com `userEvent` (não `fireEvent`, salvo evento sem equivalente).
- Verifique o efeito visível **e** a chamada de rede (método, caminho, corpo) — inclusive que algo **não** foi chamado.
- Foco: `expect(el).toHaveFocus()` depois de aprovar, fechar diálogo, etc.

## Rotas `/srv/*`

Comece o arquivo com `// @vitest-environment node`, chame os handlers exportados (`GET`, `POST`…) com um `Request` e
`{ params: Promise.resolve({ caminho }) }`, e use `vi.stubEnv` para `CANTEIRO_DEMO`, `API_URL`, `PROXY_SEGREDO`,
`VERCEL`, `CONFIAR_XFF` (`afterEach(() => vi.unstubAllEnvs())`). Modelo: `app/srv/api/[...caminho]/route.test.ts`.

## Dados de teste

Repositório **público**: nomes, CNPJs e e-mails fictícios ("Madeireira Inventada", `eu@obra.com`), nunca dado real,
token real ou URL interna. Valores em centavos/milésimos como na API.

## Checklist

- [ ] Rede simulada com `criarRede` (sem mock de `api`/`cliente`)
- [ ] Sessão limpa entre testes; globals e envs desfeitos
- [ ] Consultas por papel/nome/rótulo; interação com `userEvent`
- [ ] Caminho feliz, erro da API (mensagem na tela) e papel viewer quando houver escrita
- [ ] Chamadas de rede conferidas (e as que não podem acontecer)
- [ ] Dados fictícios
- [ ] `pnpm test && pnpm tipos && pnpm lint` passando
