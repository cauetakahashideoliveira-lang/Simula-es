#!/usr/bin/env bash
# Prepara uma máquina (ou um container novo do Claude Code na nuvem) para trabalhar no estúdio.
# Rode a partir da pasta que contém o repositório:  bash Simula-es/scripts/ambiente.sh
# ou de dentro dele:                                bash scripts/ambiente.sh
set -euo pipefail

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. dependências do projeto, nas versões de package-lock.json
(cd "$raiz" && npm ci --no-audit --no-fund)

# 2. graphify (mapa do código, sem LLM) num ambiente Python isolado:
#    o Python do sistema é "externally managed" e recusa pip install global
if ! command -v graphify >/dev/null 2>&1; then
  destino="${GRAPHIFY_VENV:-$HOME/.local/share/graphify-venv}"
  python3 -m venv "$destino"
  "$destino/bin/pip" install -q graphifyy==0.9.105
  mkdir -p "$HOME/.local/bin"
  ln -sf "$destino/bin/graphify" "$HOME/.local/bin/graphify"
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "acrescente \$HOME/.local/bin ao PATH para usar o comando graphify";; esac
fi

# 3. navegador para os testes: usa o Chromium já instalado, se houver (containers do Claude Code)
if [ -d /opt/pw-browsers ]; then
  echo "Chromium pré-instalado encontrado em /opt/pw-browsers (não rode playwright install)"
else
  (cd "$raiz" && npx playwright install chromium)
fi

echo "pronto: npm run dev | npm test | npm run test:e2e | npm run grafo"
