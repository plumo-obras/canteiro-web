#!/usr/bin/env bash
set -euo pipefail
# A chave inclui a instalação, o runtime e a base do grafo. Uma troca de base pode ampliar os testes afetados.
acao=${1:?}
tipo=${2:?}
arvore=$(git rev-parse "${3:-HEAD}^{tree}")
base=$(git merge-base HEAD "${VERIFY_BASE:-origin/main}" 2>/dev/null || echo completa)
dir=$(git rev-parse --git-path recibos-web)
ambiente=$(node -p '[process.platform,process.arch,process.versions.node].join("-")')
marca="$dir/$arvore-$ambiente-$base"
case "$acao" in
  tem) [[ -f "$marca-pr" || ( "$tipo" == rapido && -f "$marca-rapido" ) ]] ;;
  grava) [[ -z $(git status --porcelain) ]] && mkdir -p "$dir" && touch "$marca-$tipo" ;;
  *) exit 2 ;;
esac
