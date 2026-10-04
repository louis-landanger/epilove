#!/usr/bin/env bash
# Shared development server (ADR 0014): installs the whole stack on one fresh
# Ubuntu 24.04 VM, the same way it runs on a laptop, behind Caddy (HTTPS) and a
# team password. Run as root from the cloned repository:
#
#   sudo TEAM_PASSWORD='…' bash infra/dev-host/setup.sh
#
# Options (environment): DOMAIN (default: <public IP>.sslip.io), TEAM_USER
# (default: epilove), TEAM_PASSWORD (asked if missing on the first run),
# SEED_DEV=0 to skip the fictional members. Safe to run again: secrets, .env and
# data are kept; see infra/dev-host/README.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
HOST_DIR="$REPO_DIR/infra/dev-host"
GENERATED="$HOST_DIR/generated"
RUN_USER=epilove
RUN_HOME="/home/$RUN_USER"
# @swc/core unpacks its native addon into a cache it refuses to use when a parent
# directory is group- or world-writable (some images ship /home that way).
SWC_CACHE=/var/cache/epilove-swc
COMPOSE=(docker compose -f "$REPO_DIR/infra/compose/compose.yaml" -f "$HOST_DIR/compose.yaml"
  --env-file "$GENERATED/services.env")

log() { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
as_user() {
  sudo -u "$RUN_USER" -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 SWC_NATIVE_BINDING_CACHE="$SWC_CACHE" \
    PATH="$RUN_HOME/.local/bin:$PATH" "$@"
}

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo bash infra/dev-host/setup.sh" >&2; exit 1; }
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "Warning: written for Ubuntu 24.04, found ${PRETTY_NAME:-unknown}." >&2

# --- Domain -----------------------------------------------------------------
mkdir -p "$GENERATED"
chmod 700 "$GENERATED"
if [ -z "${DOMAIN:-}" ] && [ -f "$GENERATED/domain" ]; then
  DOMAIN="$(cat "$GENERATED/domain")"
fi
if [ -z "${DOMAIN:-}" ]; then
  ip="$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me)"
  DOMAIN="${ip//./-}.sslip.io"
fi
echo "$DOMAIN" >"$GENERATED/domain"
log "Domain: $DOMAIN"

# --- System packages --------------------------------------------------------
log "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq ca-certificates curl git gnupg openssl python3 ufw debian-keyring \
  debian-archive-keyring apt-transport-https >/dev/null
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -yq nodejs >/dev/null
fi
corepack enable
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy >/dev/null
fi

# Next.js builds want a few gigabytes of memory.
if [ "$(awk '/MemTotal/ {print int($2 / 1024 / 1024)}' /proc/meminfo)" -lt 6 ] && ! swapon --show | grep -q .; then
  log "Swap (4 GB) for the builds"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

# --- Firewall: SSH and HTTPS only (every service port is bound to 127.0.0.1) --
log "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# --- Service user -------------------------------------------------------------
id "$RUN_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$RUN_USER"
usermod -aG docker "$RUN_USER"
install -d -o "$RUN_USER" -g "$RUN_USER" -m 700 "$SWC_CACHE"
chown -R "$RUN_USER:$RUN_USER" "$REPO_DIR"
# The checkout now belongs to the service user; let root keep running git in it
# (git pull, update.sh) without the "dubious ownership" refusal.
git config --system --get-all safe.directory 2>/dev/null | grep -qxF "$REPO_DIR" ||
  git config --system --add safe.directory "$REPO_DIR"
if [ ! -x "$RUN_HOME/.local/bin/uv" ]; then
  as_user sh -c 'curl -LsSf https://astral.sh/uv/install.sh | sh' >/dev/null
fi

# --- Secrets and .env (generated once, then kept) -----------------------------
log "Secrets and .env"
if [ ! -f "$GENERATED/services.env" ]; then
  hex() { openssl rand -hex "$1"; }
  cat >"$GENERATED/services.env" <<EOF
POSTGRES_PASSWORD=$(hex 24)
CENTRIFUGO_TOKEN_SECRET=$(hex 32)
CENTRIFUGO_HTTP_API_KEY=$(hex 24)
IMGPROXY_KEY=$(hex 32)
IMGPROXY_SALT=$(hex 32)
S3_ACCESS_KEY_ID=epilove
S3_SECRET_ACCESS_KEY=$(hex 24)
ENCRYPTION_KEY=$(openssl rand -base64 32)
EMAIL_HMAC_SECRET=$(hex 32)
BETTER_AUTH_SECRET=$(hex 32)
EOF
fi
# APP_URL follows the domain, even when the secrets already exist.
sed -i '/^APP_URL=/d' "$GENERATED/services.env"
echo "APP_URL=https://app.$DOMAIN" >>"$GENERATED/services.env"

DOMAIN="$DOMAIN" REPO_DIR="$REPO_DIR" GENERATED="$GENERATED" python3 - <<'PY'
import json, os, pathlib

domain, repo, generated = os.environ["DOMAIN"], pathlib.Path(os.environ["REPO_DIR"]), pathlib.Path(os.environ["GENERATED"])
secrets = dict(line.split("=", 1) for line in (generated / "services.env").read_text().splitlines() if "=" in line)

(generated / "s3.json").write_text(json.dumps({"identities": [{
    "name": "epilove",
    "credentials": [{"accessKey": secrets["S3_ACCESS_KEY_ID"], "secretKey": secrets["S3_SECRET_ACCESS_KEY"]}],
    "actions": ["Admin", "Read", "Write", "List", "Tagging"],
}]}, indent=2) + "\n")

env_path = repo / ".env"
if env_path.exists():
    print(".env kept as it is (delete it to regenerate)")
else:
    values = {
        "APP_ENV": "development",
        "DATABASE_URL": f"postgres://epilove:{secrets['POSTGRES_PASSWORD']}@127.0.0.1:5432/epilove",
        "CENTRIFUGO_HTTP_API_KEY": secrets["CENTRIFUGO_HTTP_API_KEY"],
        "CENTRIFUGO_TOKEN_SECRET": secrets["CENTRIFUGO_TOKEN_SECRET"],
        "CENTRIFUGO_WS_URL": f"wss://ws.{domain}/connection/websocket",
        "S3_ACCESS_KEY_ID": secrets["S3_ACCESS_KEY_ID"],
        "S3_SECRET_ACCESS_KEY": secrets["S3_SECRET_ACCESS_KEY"],
        "S3_PUBLIC_ENDPOINT": f"https://media.{domain}",
        "IMGPROXY_URL": f"https://img.{domain}",
        "IMGPROXY_KEY": secrets["IMGPROXY_KEY"],
        "IMGPROXY_SALT": secrets["IMGPROXY_SALT"],
        "ENCRYPTION_KEYS": f"dev1:{secrets['ENCRYPTION_KEY']}",
        "ENCRYPTION_CURRENT_KEY_ID": "dev1",
        "EMAIL_HMAC_SECRET": secrets["EMAIL_HMAC_SECRET"],
        # The whole site sits behind the team password (Caddy), so the /dev member picker can stay.
        "DEV_AUTH": "1",
        "EMAIL_FROM": f"Epilove <no-reply@{domain}>",
        "APP_URL": f"https://app.{domain}",
        "AUTH_TRUSTED_ORIGINS": f"https://admin.{domain}",
        "BETTER_AUTH_SECRET": secrets["BETTER_AUTH_SECRET"],
        "PASSKEY_RP_ID": f"app.{domain}",
        "AUTH_TRUSTED_PROXIES": "127.0.0.1,::1",
        "ADMIN_URL": f"https://admin.{domain}",
        "SITE_URL": f"https://app.{domain}",
    }
    lines, seen = [], set()
    for line in (repo / ".env.example").read_text().splitlines():
        key = line.split("=", 1)[0].lstrip("# ").strip()
        if key in values and "=" in line and key not in seen:
            lines.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            lines.append(line)
    lines += [f"{key}={value}" for key, value in values.items() if key not in seen]
    env_path.write_text("\n".join(lines) + "\n")
    env_path.chmod(0o600)
    print(".env written")
PY
chown -R "$RUN_USER:$RUN_USER" "$GENERATED" "$REPO_DIR/.env"

# --- Team password (Caddy basic auth) -----------------------------------------
TEAM_USER="${TEAM_USER:-$(cat "$GENERATED/team-user" 2>/dev/null || echo epilove)}"
if [ -n "${TEAM_PASSWORD:-}" ] || [ ! -f "$GENERATED/team-hash" ]; then
  if [ -z "${TEAM_PASSWORD:-}" ]; then
    read -r -s -p "Team password (shared by the whole team, 12 characters or more): " TEAM_PASSWORD
    echo
  fi
  [ "${#TEAM_PASSWORD}" -ge 12 ] || { echo "The team password needs 12 characters or more." >&2; exit 1; }
  caddy hash-password --plaintext "$TEAM_PASSWORD" >"$GENERATED/team-hash"
fi
echo "$TEAM_USER" >"$GENERATED/team-user"
TEAM_HASH="$(cat "$GENERATED/team-hash")"

# --- Services, build, database -------------------------------------------------
log "Services (PostgreSQL, Valkey, Centrifugo, SeaweedFS, imgproxy, Mailpit)"
"${COMPOSE[@]}" up -d --wait

log "Dependencies and production build (a few minutes)"
as_user bash -c "cd '$REPO_DIR' && pnpm install --frozen-lockfile && pnpm build"

log "Database"
as_user bash -c "cd '$REPO_DIR' && pnpm db:migrate && pnpm db:seed"
if [ "${SEED_DEV:-1}" = 1 ] && [ ! -f "$GENERATED/seeded" ]; then
  as_user bash -c "cd '$REPO_DIR' && pnpm db:seed:dev"
  touch "$GENERATED/seeded"
fi

# --- App processes (systemd) ----------------------------------------------------
log "App, back-office and worker"
unit() {
  cat >"/etc/systemd/system/epilove-$1.service" <<EOF
[Unit]
Description=Epilove $1
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$REPO_DIR/$2
EnvironmentFile=$REPO_DIR/.env
Environment=NODE_ENV=production COREPACK_ENABLE_DOWNLOAD_PROMPT=0 SWC_NATIVE_BINDING_CACHE=$SWC_CACHE PATH=$RUN_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/pnpm start $3
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
}
# Loopback only, but named `localhost`: with any other --hostname, Next.js 16.3 builds
# the proxy.ts URL and its own base URL from different hosts, then forwards the
# rewritten /en pages to itself over TLS (500 behind Caddy's X-Forwarded-Proto).
unit web apps/web "--hostname localhost"
unit admin apps/admin "--hostname localhost"
unit worker apps/worker ""
systemctl daemon-reload
systemctl enable epilove-web epilove-admin epilove-worker >/dev/null
systemctl restart epilove-web epilove-admin epilove-worker

# --- Caddy: HTTPS (Let's Encrypt) and the team password -------------------------
log "Caddy"
cat >/etc/caddy/Caddyfile <<EOF
# Generated by infra/dev-host/setup.sh: edit the script, not this file.
(team) {
	basic_auth {
		$TEAM_USER $TEAM_HASH
	}
}

app.$DOMAIN {
	encode zstd gzip
	# Browsers fetch the web app manifest without credentials.
	@manifest path /manifest.webmanifest
	handle @manifest {
		reverse_proxy localhost:3000
	}
	handle {
		import team
		reverse_proxy localhost:3000
	}
}

admin.$DOMAIN {
	encode zstd gzip
	import team
	reverse_proxy localhost:3001
}

mail.$DOMAIN {
	import team
	reverse_proxy 127.0.0.1:8025
}

# Realtime: WebSocket connections only (Centrifugo's HTTP API stays internal).
ws.$DOMAIN {
	handle /connection/* {
		reverse_proxy 127.0.0.1:8000
	}
	handle {
		respond 404
	}
}

# Photo and voice uploads: presigned, expiring S3 requests.
media.$DOMAIN {
	reverse_proxy 127.0.0.1:8333
}

# Photos: signed, expiring imgproxy URLs.
img.$DOMAIN {
	reverse_proxy 127.0.0.1:8080
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null
systemctl reload caddy 2>/dev/null || systemctl restart caddy

log "Done"
cat <<EOF

  App          https://app.$DOMAIN        (team login: $TEAM_USER)
  Back-office  https://admin.$DOMAIN
  E-mails      https://mail.$DOMAIN       (sign-in codes land here)
  Members      https://app.$DOMAIN/dev    (pick a fictional member)

  Logs: journalctl -fu epilove-web   (or epilove-admin, epilove-worker)
  Update: sudo bash infra/dev-host/update.sh
EOF
