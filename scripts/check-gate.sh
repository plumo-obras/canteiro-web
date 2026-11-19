#!/usr/bin/env bash
set -euo pipefail
[[ $# -gt 0 ]] || exit 1
for resultado in "$@"; do
  [[ $resultado == success ]] || { echo "Gate obrigatório terminou com $resultado."; exit 1; }
done
