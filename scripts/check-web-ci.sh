#!/usr/bin/env bash
set -euo pipefail
opcoes=()
if [[ ${GITHUB_EVENT_NAME:-} == push ]]; then opcoes+=(--todos); fi
scripts/verify.sh "${opcoes[@]}"
scripts/check-segredos.sh
scripts/check-dependencias.sh
CANTEIRO_DEMO=1 pnpm build
