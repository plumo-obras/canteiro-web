#!/usr/bin/env bash
set -euo pipefail
[[ $# == 7 && $1 == success ]] || { echo "Plano ausente ou incompleto."; exit 1; }
shift
while [[ $# -gt 0 ]]; do
  case "$1/$2" in
    true/success|false/skipped) ;;
    *) echo "Plano=$1, resultado=$2. Merge bloqueado."; exit 1 ;;
  esac
  shift 2
done
