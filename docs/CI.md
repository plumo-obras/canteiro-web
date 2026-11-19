# Antes de enviar a web

Use o Node de `.node-version`, o pnpm declarado no package.json e Python 3 para a landing. Rode `pnpm install --frozen-lockfile` no clone. A instalação ativa o pre-push em `.githooks`. Prefira um clone independente quando outros worktrees compartilham configuração Git.

| Proteção | Reprodução |
|---|---|
| Ambiente reproduzível e HTML publicado nos três idiomas | `scripts/check-ambiente.sh` compara runtime e lock instalado, valida o manifesto e confere o gerador. |
| Tipos de rotas, componentes, regras de hooks e comportamento | `pnpm verify` gera os tipos do Next, roda TypeScript, ESLint e Vitest. |
| O produto pode ser empacotado | `CANTEIRO_DEMO=1 pnpm build` e `scripts/check-imagem.sh` (Docker local). |
| Todo job obrigatório passou | `scripts/check-gate.sh success success`. Troque um resultado por skipped para reproduzir a recusa. |

O hook verifica a árvore que será enviada. Use checkout limpo para fazer push. Rode `pnpm verify:pr` antes de marcar o PR pronto. O único check a exigir na principal é `gate`.
# Antes de enviar a web

Use o Node de `.node-version`, o pnpm declarado no package.json e Python 3 para a landing. Rode `pnpm install --frozen-lockfile` no clone. A instalação ativa o pre-push em `.githooks`. Prefira um clone independente quando outros worktrees compartilham configuração Git.

| Proteção | Reprodução |
|---|---|
| Ambiente reproduzível e HTML publicado nos três idiomas | `scripts/check-ambiente.sh` compara runtime e lock instalado, valida o manifesto e confere o gerador. |
| Tipos de rotas, componentes, regras de hooks e comportamento | `pnpm verify` gera os tipos do Next, roda TypeScript, ESLint e Vitest. |
| O produto pode ser empacotado | `CANTEIRO_DEMO=1 pnpm build` e `scripts/check-imagem.sh` (Docker local). |
| Todo job obrigatório passou | `scripts/check-gate.sh success success`. Troque um resultado por skipped para reproduzir a recusa. |

O hook verifica a árvore que será enviada. Use checkout limpo para fazer push. Rode `pnpm verify:pr` antes de marcar o PR pronto. O único check a exigir na principal é `gate`.

# Reaproveitar CI sem pular teste necessário

O PR em rascunho não inicia CI. Em PR pronto, o plano identifica a árvore testada, confere recibos de runs confiáveis recentes e seleciona as suítes afetadas pelo Vitest. Configuração, setup, tipos, exclusões e qualquer entrada não compreendida acionam a suíte toda. Push na main sempre roda a suíte inteira.

`scripts/verify-pr.sh` exige checkout limpo, roda a suíte inteira, segredos, auditoria, build e imagem. O recibo local registra árvore, base do grafo e runtime. A consulta no CI falha para o lado conservador. O agregador exige plano verde e permite skipped apenas quando o plano escolheu false.

Reproduza cada autorização e recusa com os exemplos dos scripts. O CI registra o nome da árvore do recibo no run; a lista de runs e seus jobs verdes é a fonte consultada pelo plano.
