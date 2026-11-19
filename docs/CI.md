# Antes de enviar a web

Use o Node de `.node-version`, o pnpm declarado no package.json e Python 3 para a landing. Rode `pnpm install --frozen-lockfile` no clone. A instalação ativa o pre-push em `.githooks`. Prefira um clone independente quando outros worktrees compartilham configuração Git.

| Proteção | Reprodução |
|---|---|
| Ambiente reproduzível e HTML publicado nos três idiomas | `scripts/check-ambiente.sh` compara runtime e lock instalado, valida o manifesto e confere o gerador. |
| Tipos de rotas, componentes, regras de hooks e comportamento | `pnpm verify` gera os tipos do Next, roda TypeScript, ESLint e Vitest. |
| O produto pode ser empacotado | `CANTEIRO_DEMO=1 pnpm build` e `scripts/check-imagem.sh` (Docker local). |
| Todo job obrigatório passou | `scripts/check-gate.sh success success`. Troque um resultado por skipped para reproduzir a recusa. |

O hook verifica a árvore que será enviada. Use checkout limpo para fazer push. Rode `pnpm verify:pr` antes de marcar o PR pronto. O único check a exigir na principal é `gate`.
