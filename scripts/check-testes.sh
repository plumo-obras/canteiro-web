#!/usr/bin/env bash
set -euo pipefail
ref=${VERIFY_BASE:-origin/main}
if [[ ${1:-} == --todos ]] || ! base=$(git merge-base HEAD "$ref"); then
  exec pnpm test
fi
# Exclusões e entradas que o grafo do Vite não enxerga invalidam a seleção.
if ! git diff --quiet --no-renames --diff-filter=D "$base" --; then exec pnpm test; fi
while IFS= read -r -d '' arquivo; do
  case "$arquivo" in
    *.config.*|*.setup.*|*.d.ts|testes/*) exec pnpm test ;;
    *.ts|*.tsx|README.md|CLAUDE.md|AGENTS.md|docs/*.md) ;;
    *) exec pnpm test ;;
  esac
done < <(git diff --name-only -z "$base" -- && git ls-files -z --others --exclude-standard)
exec pnpm exec vitest run --changed "$base" --passWithNoTests
