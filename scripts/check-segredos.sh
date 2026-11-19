#!/usr/bin/env bash
set -euo pipefail
versao=8.30.1
case "$(uname -s)/$(uname -m)" in
  Darwin/arm64) plataforma=darwin_arm64 ;;
  Darwin/x86_64) plataforma=darwin_x64 ;;
  Linux/aarch64|Linux/arm64) plataforma=linux_arm64 ;;
  Linux/x86_64) plataforma=linux_x64 ;;
  *) echo "Plataforma sem binário homologado."; exit 1 ;;
esac
pacote="gitleaks_${versao}_${plataforma}.tar.gz"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/canteiro-web/$versao"
mkdir -p "$cache"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if [[ ! -f "$cache/$pacote" ]]; then
  curl --retry 2 -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v$versao/$pacote" -o "$tmp/download"
  mv "$tmp/download" "$cache/$pacote"
fi
soma=$(awk -v p="$pacote" '$2 == p { print $1 }' scripts/gitleaks.sha256)
[[ -n "$soma" && $(shasum -a 256 "$cache/$pacote" | cut -d' ' -f1) == "$soma" ]] || { echo "Checksum inválido: $pacote"; exit 1; }
tar -xzf "$cache/$pacote" -C "$tmp" gitleaks
# O arquivo exportado é exatamente a árvore avaliada, inclusive os arquivos de documentação.
mkdir "$tmp/arvore"
git archive HEAD | tar -x -C "$tmp/arvore"
"$tmp/gitleaks" dir "$tmp/arvore" --redact --no-banner
