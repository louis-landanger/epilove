#!/usr/bin/env bash
# Shared development server (ADR 0014): deploys the latest `main`. Run as root:
#   sudo bash infra/dev-host/update.sh [branch]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
HOST_DIR="$REPO_DIR/infra/dev-host"
RUN_USER=epilove
BRANCH="${1:-main}"

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash infra/dev-host/update.sh" >&2; exit 1; }
[ -f "$HOST_DIR/generated/services.env" ] || { echo "Run infra/dev-host/setup.sh first." >&2; exit 1; }
as_user() {
  sudo -u "$RUN_USER" -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 PATH="/home/$RUN_USER/.local/bin:$PATH" "$@"
}

# Git as root: the clone uses root's deploy key (README); files go back to the service user.
git_root() { git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" "$@"; }
git_root fetch --quiet origin "$BRANCH"
git_root checkout --quiet "$BRANCH"
git_root merge --ff-only --quiet "origin/$BRANCH"
chown -R "$RUN_USER:$RUN_USER" "$REPO_DIR"
echo "Deploying $(git_root log -1 --format='%h %s')"

docker compose -f "$REPO_DIR/infra/compose/compose.yaml" -f "$HOST_DIR/compose.yaml" \
  --env-file "$HOST_DIR/generated/services.env" up -d --wait
as_user bash -c "cd '$REPO_DIR' && pnpm install --frozen-lockfile && pnpm build && pnpm db:migrate && pnpm db:seed"
systemctl restart epilove-web epilove-admin epilove-worker
echo "Deployed."
