#!/usr/bin/env bash
set -euo pipefail
[[ -z $(git status --porcelain) ]] || { echo "Faça commit das alterações para verificar a árvore do PR."; exit 1; }
arvore=$(git rev-parse 'HEAD^{tree}')
scripts/verify.sh --todos
scripts/check-segredos.sh
scripts/check-dependencias.sh
CANTEIRO_DEMO=1 pnpm build
scripts/check-imagem.sh
[[ $(git rev-parse 'HEAD^{tree}') == "$arvore" ]]
scripts/recibo-local.sh grava pr
