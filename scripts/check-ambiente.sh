#!/usr/bin/env bash
set -euo pipefail
esperado=$(cat .node-version)
[[ $(node -p 'process.versions.node') == "$esperado" ]] || { echo "Use Node $esperado."; exit 1; }
[[ pnpm@$(pnpm --version) == "$(node -p "require('./package.json').packageManager")" ]] || { echo "Confira a versão do pnpm."; exit 1; }
cmp -s pnpm-lock.yaml node_modules/.pnpm/lock.yaml || { echo "Dependências divergentes. Rode pnpm install --frozen-lockfile."; exit 1; }
pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts >/dev/null
python3 site/build.py --conferir
