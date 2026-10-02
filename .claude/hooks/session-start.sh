#!/bin/bash
# SessionStart hook for Claude Code cloud sessions: Node.js from .node-version,
# pnpm through Corepack, workspace dependencies, local .env and Playwright Chromium.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"
ENV_FILE="${CLAUDE_ENV_FILE:-/dev/null}"

NODE_VERSION="$(tr -d '[:space:]' < .node-version)"
NODE_DIR="$HOME/.local/node-v${NODE_VERSION}"

if [ ! -x "$NODE_DIR/bin/node" ]; then
  mkdir -p "$HOME/.local"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C "$HOME/.local"
  mv "$HOME/.local/node-v${NODE_VERSION}-linux-x64" "$NODE_DIR"
fi

export PATH="$NODE_DIR/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable --install-directory "$NODE_DIR/bin"

{
  echo "export PATH=\"$NODE_DIR/bin:\$PATH\""
  echo "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
  echo "export NEXT_TELEMETRY_DISABLED=1"
  echo "export TURBO_TELEMETRY_DISABLED=1"
} >> "$ENV_FILE"

# Preinstalled Chromium for Playwright (avoids `playwright install`).
CHROMIUM="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$CHROMIUM" ]; then
  echo "export PW_CHROMIUM_PATH=\"$CHROMIUM\"" >> "$ENV_FILE"
fi

pnpm install

if [ ! -f .env ]; then
  cp .env.example .env
fi
