#!/usr/bin/env bash
set -euo pipefail
scripts/check-ambiente.sh
pnpm exec next typegen
pnpm tipos
pnpm lint
pnpm test
