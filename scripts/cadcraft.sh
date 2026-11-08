#!/usr/bin/env bash
# Compila o CADCraft (editor CAD open source, MIT/Apache-2.0) para o navegador, a partir do código, e o põe em
# public/cadcraft/, de onde a tela Projeto 3D o embute (modo hospedeiro: abrir e salvar o DXF pelo Prumo).
# O binário (~13 MB) não vai para o git: este repositório é público e o build sai sempre do código fixado abaixo.
#
# Uso: scripts/cadcraft.sh [pasta-do-codigo]     (padrão: ../cadcraft, clonado na versão fixada se não existir)
# Precisa: Rust >= 1.95 com o alvo wasm32-unknown-unknown e o trunk (https://trunkrs.dev).
set -euo pipefail
VERSAO="v0.18.0"          # versão do CADCraft que o Prumo usa; mudar aqui e rodar de novo para atualizar
REPO="https://github.com/storytold/cadcraft.git"
WEB="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$WEB/../cadcraft}"

command -v trunk >/dev/null || { echo "erro: trunk não encontrado (veja https://trunkrs.dev)" >&2; exit 1; }
rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown \
  || { echo "erro: falta o alvo wasm (rustup target add wasm32-unknown-unknown)" >&2; exit 1; }
if [[ ! -d "$SRC/.git" ]]; then
  git clone --depth 1 --branch "$VERSAO" "$REPO" "$SRC"
fi
(cd "$SRC" && git describe --tags --exact-match 2>/dev/null | grep -qx "$VERSAO") \
  || echo "aviso: $SRC não está na tag $VERSAO (build do código como está)" >&2

# O patch do Prumo (scripts/cadcraft-prumo.patch): a mensagem cadcraft:execute, que deixa a tela Projeto 3D pedir
# comandos ao CAD (ir até o elemento escolhido no 3D). Aplicado uma vez; sem ele o CAD abre e salva, só sem o zoom.
PATCH="$WEB/scripts/cadcraft-prumo.patch"
if (cd "$SRC" && git apply --check "$PATCH" 2>/dev/null); then
  (cd "$SRC" && git apply "$PATCH")
  echo "patch do Prumo aplicado"
elif (cd "$SRC" && git apply --reverse --check "$PATCH" 2>/dev/null); then
  echo "patch do Prumo já estava aplicado"
else
  echo "erro: o patch do Prumo não casa com o código em $SRC (versão diferente de $VERSAO?)" >&2
  exit 1
fi

(cd "$SRC/apps/cadcraft-web" && trunk build --release)

DEST="$WEB/public/cadcraft"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/dist/web/." "$DEST/"
# a licença do CADCraft acompanha o binário onde quer que ele seja servido
cp "$SRC/LICENSE-MIT" "$SRC/LICENSE-APACHE" "$SRC/NOTICE" "$SRC/ATTRIBUTION.md" "$DEST/"
echo "CADCraft $VERSAO em $DEST"
