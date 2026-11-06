#!/usr/bin/env bash
# Shared development server (ADR 0014): installs the whole stack on one fresh
# Ubuntu 24.04 VM, the same way it runs on a laptop, behind Caddy (HTTPS) and a
# team password. Run as root from the cloned repository:
#
#   sudo TEAM_PASSWORD='…' bash infra/dev-host/setup.sh
#
# Options (environment): DOMAIN (default: <public IP>.sslip.io), TEAM_USER
# (default: atomes), TEAM_PASSWORD (asked if missing on the first run),
# SEED_DEV=0 to skip the fictional members, CERTS=duckdns for a machine the
# Internet cannot reach (behind Tailscale): DOMAIN is then a DuckDNS name pointing
# at its private address, and Caddy proves it owns the name through DuckDNS's API
# (DUCKDNS_TOKEN, asked if missing). CERTS=tunnel for a machine the Internet cannot
# reach that must still be public: DOMAIN is a domain whose DNS is on Cloudflare, and
# a Cloudflare Tunnel carries the traffic (a link to sign in to Cloudflare is shown
# on the first run). Safe to run again: secrets, .env and data are kept, the
# addresses in .env follow DOMAIN; see infra/dev-host/README.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
HOST_DIR="$REPO_DIR/infra/dev-host"
GENERATED="$HOST_DIR/generated"
RUN_USER=atomes
RUN_HOME="/home/$RUN_USER"
# @swc/core unpacks its native addon into a cache it refuses to use when a parent
# directory is group- or world-writable (some images ship /home that way).
SWC_CACHE=/var/cache/atomes-swc
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
# Certificates: Let's Encrypt reaches the machine over HTTP by default. With
# CERTS=duckdns (a machine behind Tailscale, which Let's Encrypt cannot reach), it
# checks a TXT record that Caddy writes through DuckDNS's API instead. With
# CERTS=tunnel, Cloudflare holds the certificates and reaches Caddy through a tunnel
# that the machine opens itself.
CERTS="${CERTS:-$(cat "$GENERATED/certs" 2>/dev/null || echo http)}"
case "$CERTS" in
  http | duckdns | tunnel) ;;
  *) echo "CERTS is http (default), duckdns or tunnel, not '$CERTS'." >&2; exit 1 ;;
esac
if [ "$CERTS" = duckdns ] && [ -z "${DOMAIN:-}" ]; then
  echo "CERTS=duckdns needs DOMAIN, the DuckDNS name (for example atomes.duckdns.org)." >&2
  exit 1
fi
if [ "$CERTS" = tunnel ] && [ -z "${DOMAIN:-}" ]; then
  echo "CERTS=tunnel needs DOMAIN, a domain whose DNS is on Cloudflare (for example example.com)." >&2
  exit 1
fi
if [ -z "${DOMAIN:-}" ]; then
  ip="$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me)"
  DOMAIN="${ip//./-}.sslip.io"
fi
echo "$DOMAIN" >"$GENERATED/domain"
echo "$CERTS" >"$GENERATED/certs"
log "Domain: $DOMAIN (certificates: $CERTS)"
if [ "$CERTS" = duckdns ]; then
  if [ -n "${DUCKDNS_TOKEN:-}" ] || [ ! -s "$GENERATED/duckdns-token" ]; then
    if [ -z "${DUCKDNS_TOKEN:-}" ]; then
      read -r -s -p "DuckDNS token (duckdns.org, at the top of your account page): " DUCKDNS_TOKEN
      echo
    fi
    [ -n "$DUCKDNS_TOKEN" ] || { echo "The DuckDNS token is required with CERTS=duckdns." >&2; exit 1; }
    (umask 077 && printf 'DUCKDNS_TOKEN=%s\n' "$DUCKDNS_TOKEN" >"$GENERATED/duckdns-token")
  fi
fi

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
if [ "$CERTS" = duckdns ] && ! caddy list-modules 2>/dev/null | grep -qx 'dns.providers.duckdns'; then
  # Caddy's own build server adds the DuckDNS module to the binary; held, so that an
  # upgrade from the package does not swap it for one without the module.
  caddy add-package github.com/caddy-dns/duckdns >/dev/null
  apt-mark hold caddy >/dev/null
fi
if [ "$CERTS" = tunnel ] && ! command -v cloudflared >/dev/null; then
  install -d -m 755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg >/usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    >/etc/apt/sources.list.d/cloudflared.list
  apt-get update -q
  apt-get install -yq cloudflared >/dev/null
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
if [ "$CERTS" != tunnel ]; then
  # Through a tunnel, nothing comes in: cloudflared opens the connections itself.
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
fi
ufw --force enable >/dev/null

# --- Cloudflare Tunnel: sign-in, tunnel and DNS records (CERTS=tunnel) ---------
# Done early, while whoever runs the script is still watching: the first run shows a
# link to open in any browser. The sign-in (cert.pem) and the tunnel's credentials
# stay with root, out of the checkout.
TUNNEL_NAME=atomes
TUNNEL_CREDENTIALS=/etc/cloudflared/tunnel.json
# The names Caddy serves (the `site` calls below), routed to the tunnel.
NAMES=(app admin mail ws media img)
if [ "$CERTS" = tunnel ]; then
  log "Cloudflare Tunnel"
  install -d -m 700 /etc/cloudflared
  # `login` writes to $HOME/.cloudflared, which `sudo -E` would leave elsewhere.
  export TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem
  if [ ! -s "$TUNNEL_ORIGIN_CERT" ]; then
    echo "Open the link below, sign in to Cloudflare and choose $DOMAIN:"
    HOME=/root cloudflared tunnel login
  fi
  if [ ! -s "$TUNNEL_CREDENTIALS" ]; then
    if cloudflared tunnel list --name "$TUNNEL_NAME" --output json | python3 -c 'import json, sys; sys.exit(0 if json.load(sys.stdin) else 1)'; then
      # The tunnel exists (another install): fetch its credentials again.
      cloudflared tunnel token --cred-file "$TUNNEL_CREDENTIALS" "$TUNNEL_NAME"
    else
      cloudflared tunnel create --cred-file "$TUNNEL_CREDENTIALS" "$TUNNEL_NAME"
    fi
    chmod 600 "$TUNNEL_CREDENTIALS"
  fi
  TUNNEL_ID="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["TunnelID"])' "$TUNNEL_CREDENTIALS")"
  for name in "${NAMES[@]}"; do
    # Never overwrites a record: a name already in use stops the script.
    cloudflared tunnel route dns "$TUNNEL_ID" "$name.$DOMAIN" || {
      echo "Could not route $name.$DOMAIN to the tunnel (see above). Usually a DNS record already" \
        "uses the name: delete it on Cloudflare, or choose another DOMAIN." >&2
      exit 1
    }
  done
fi

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
S3_ACCESS_KEY_ID=atomes
S3_SECRET_ACCESS_KEY=$(hex 24)
ENCRYPTION_KEY=$(openssl rand -base64 32)
EMAIL_HMAC_SECRET=$(hex 32)
BETTER_AUTH_SECRET=$(hex 32)
EOF
fi
# APP_URL follows the domain, even when the secrets already exist.
sed -i '/^APP_URL=/d' "$GENERATED/services.env"
echo "APP_URL=https://app.$DOMAIN" >>"$GENERATED/services.env"

DOMAIN="$DOMAIN" CERTS="$CERTS" REPO_DIR="$REPO_DIR" GENERATED="$GENERATED" python3 - <<'PY'
import json, os, pathlib

domain, repo, generated = os.environ["DOMAIN"], pathlib.Path(os.environ["REPO_DIR"]), pathlib.Path(os.environ["GENERATED"])
secrets = dict(line.split("=", 1) for line in (generated / "services.env").read_text().splitlines() if "=" in line)
# Through the tunnel, every request reaches Caddy from cloudflared: the visitor's
# address is in the header Cloudflare sets, not in X-Forwarded-For.
ip_headers = "cf-connecting-ip" if os.environ["CERTS"] == "tunnel" else "x-forwarded-for"
# What follows the domain and the mode, rewritten on every run; the rest of .env is kept.
addresses = {
    "CENTRIFUGO_WS_URL": f"wss://ws.{domain}/connection/websocket",
    "S3_PUBLIC_ENDPOINT": f"https://media.{domain}",
    "IMGPROXY_URL": f"https://img.{domain}",
    "EMAIL_FROM": f"Atomes <no-reply@{domain}>",
    "APP_URL": f"https://app.{domain}",
    "AUTH_TRUSTED_ORIGINS": f"https://admin.{domain}",
    "PASSKEY_RP_ID": f"app.{domain}",
    "AUTH_IP_HEADERS": ip_headers,
    "API_IP_HEADERS": ip_headers,
    "ADMIN_URL": f"https://admin.{domain}",
    "SITE_URL": f"https://app.{domain}",
}

(generated / "s3.json").write_text(json.dumps({"identities": [{
    "name": "atomes",
    "credentials": [{"accessKey": secrets["S3_ACCESS_KEY_ID"], "secretKey": secrets["S3_SECRET_ACCESS_KEY"]}],
    "actions": ["Admin", "Read", "Write", "List", "Tagging"],
}]}, indent=2) + "\n")

env_path = repo / ".env"
if env_path.exists():
    lines, changed = env_path.read_text().splitlines(), []
    for index, line in enumerate(lines):
        key = line.split("=", 1)[0]
        if key in addresses and "=" in line and line != f"{key}={addresses[key]}":
            lines[index] = f"{key}={addresses[key]}"
            changed.append(key)
    present = {line.split("=", 1)[0] for line in lines if "=" in line}
    missing = [key for key in addresses if key not in present]
    lines += [f"{key}={addresses[key]}" for key in missing]
    changed += missing
    if changed:
        env_path.write_text("\n".join(lines) + "\n")
        print(f".env kept, addresses updated: {', '.join(changed)}")
    else:
        print(".env kept as it is (delete it to regenerate)")
else:
    values = {
        "APP_ENV": "development",
        "DATABASE_URL": f"postgres://atomes:{secrets['POSTGRES_PASSWORD']}@127.0.0.1:5432/atomes",
        "CENTRIFUGO_HTTP_API_KEY": secrets["CENTRIFUGO_HTTP_API_KEY"],
        "CENTRIFUGO_TOKEN_SECRET": secrets["CENTRIFUGO_TOKEN_SECRET"],
        "S3_ACCESS_KEY_ID": secrets["S3_ACCESS_KEY_ID"],
        "S3_SECRET_ACCESS_KEY": secrets["S3_SECRET_ACCESS_KEY"],
        "IMGPROXY_KEY": secrets["IMGPROXY_KEY"],
        "IMGPROXY_SALT": secrets["IMGPROXY_SALT"],
        "ENCRYPTION_KEYS": f"dev1:{secrets['ENCRYPTION_KEY']}",
        "ENCRYPTION_CURRENT_KEY_ID": "dev1",
        "EMAIL_HMAC_SECRET": secrets["EMAIL_HMAC_SECRET"],
        # The whole site sits behind the team password (Caddy), so the /dev member picker can stay.
        "DEV_AUTH": "1",
        "BETTER_AUTH_SECRET": secrets["BETTER_AUTH_SECRET"],
        "AUTH_TRUSTED_PROXIES": "127.0.0.1,::1",
        **addresses,
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
TEAM_USER="${TEAM_USER:-$(cat "$GENERATED/team-user" 2>/dev/null || echo atomes)}"
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
  cat >"/etc/systemd/system/atomes-$1.service" <<EOF
[Unit]
Description=Atomes $1
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
systemctl enable atomes-web atomes-admin atomes-worker >/dev/null
systemctl restart atomes-web atomes-admin atomes-worker

# --- Caddy: HTTPS (Let's Encrypt) and the team password -------------------------
log "Caddy"
if [ "$CERTS" = duckdns ]; then
  # The token reaches Caddy from systemd, kept out of the Caddyfile (readable by all).
  install -m 600 "$GENERATED/duckdns-token" /etc/caddy/duckdns.env
  mkdir -p /etc/systemd/system/caddy.service.d
  printf '[Service]\nEnvironmentFile=/etc/caddy/duckdns.env\n' >/etc/systemd/system/caddy.service.d/duckdns.conf
  systemctl daemon-reload
elif [ -f /etc/systemd/system/caddy.service.d/duckdns.conf ]; then
  # Left by an earlier run with CERTS=duckdns.
  rm -f /etc/systemd/system/caddy.service.d/duckdns.conf /etc/caddy/duckdns.env
  systemctl daemon-reload
fi

# What each name serves, whatever the certificates.
route_app='encode zstd gzip
# Browsers fetch the web app manifest without credentials.
@manifest path /manifest.webmanifest
handle @manifest {
	reverse_proxy localhost:3000
}
handle {
	import team
	reverse_proxy localhost:3000
}'
route_admin='encode zstd gzip
import team
reverse_proxy localhost:3001'
route_mail='import team
reverse_proxy 127.0.0.1:8025'
route_ws='handle /connection/* {
	reverse_proxy 127.0.0.1:8000
}
handle {
	respond 404
}'
route_media='reverse_proxy 127.0.0.1:8333'
route_img='reverse_proxy 127.0.0.1:8080'

# A site per name with certificates over HTTP; with DuckDNS, one wildcard site whose
# certificate covers them all: DuckDNS keeps a single TXT record per domain, so a
# certificate asked for each name at once would overwrite the others' records.
# Through the tunnel, a plain HTTP site per name: Cloudflare holds the certificates.
site() {
  local name="$1" comment="$2" body="$3"
  if [ "$CERTS" = duckdns ]; then
    [ -z "$comment" ] || printf '\t# %s\n' "$comment"
    printf '\t@%s host %s.%s\n\thandle @%s {\n' "$name" "$name" "$DOMAIN" "$name"
    printf '%s\n' "$body" | sed 's/^/\t\t/'
    printf '\t}\n\n'
  else
    [ -z "$comment" ] || printf '# %s\n' "$comment"
    if [ "$CERTS" = tunnel ]; then
      printf 'http://%s.%s {\n\timport https_only\n' "$name" "$DOMAIN"
    else
      printf '%s.%s {\n' "$name" "$DOMAIN"
    fi
    printf '%s\n' "$body" | sed 's/^/\t/'
    printf '}\n\n'
  fi
}
# A Caddyfile written by hand (other sites on the machine) is kept aside, not lost.
if [ -f /etc/caddy/Caddyfile ]; then
  first_line=""
  IFS= read -r first_line </etc/caddy/Caddyfile || true
  case "$first_line" in
    "# Generated by infra/dev-host/setup.sh"* | "# The Caddyfile is an easy way to configure"*) ;;
    *)
      backup="/etc/caddy/Caddyfile.before-atomes-$(date +%Y%m%d-%H%M%S)"
      cp -p /etc/caddy/Caddyfile "$backup"
      echo "Warning: /etc/caddy/Caddyfile was not written by this script; kept as $backup." >&2
      ;;
  esac
fi
{
  echo "# Generated by infra/dev-host/setup.sh: edit the script, not this file."
  if [ "$CERTS" = duckdns ]; then
    printf '{\n\tacme_dns duckdns {env.DUCKDNS_TOKEN}\n}\n\n'
  elif [ "$CERTS" = tunnel ]; then
    # Only cloudflared, on this machine, talks to Caddy; its X-Forwarded-Proto is kept.
    printf '{\n\tdefault_bind 127.0.0.1\n\tservers {\n\t\ttrusted_proxies static 127.0.0.1/32\n\t}\n}\n\n'
    # Cloudflare also forwards plain HTTP visits: sent to HTTPS before the team password.
    printf '(https_only) {\n\t@insecure header X-Forwarded-Proto http\n\tredir @insecure https://{host}{uri} 308\n}\n\n'
  fi
  printf '(team) {\n\tbasic_auth {\n\t\t%s %s\n\t}\n}\n\n' "$TEAM_USER" "$TEAM_HASH"
  if [ "$CERTS" = duckdns ]; then
    # The bare name would need its own certificate, another TXT record: left out.
    printf '*.%s {\n' "$DOMAIN"
  elif [ "$CERTS" = tunnel ]; then
    # The bare name is left alone: it may well serve another site.
    :
  else
    printf '# The bare name leads to the app instead of failing the TLS handshake.\n'
    printf '%s {\n\tredir https://app.%s{uri}\n}\n\n' "$DOMAIN" "$DOMAIN"
  fi
  site app "" "$route_app"
  site admin "" "$route_admin"
  site mail "" "$route_mail"
  site ws "Realtime: WebSocket connections only (Centrifugo's HTTP API stays internal)." "$route_ws"
  site media "Photo and voice uploads: presigned, expiring S3 requests." "$route_media"
  site img "Photos: signed, expiring imgproxy URLs." "$route_img"
  if [ "$CERTS" = duckdns ]; then
    printf '\thandle {\n\t\tabort\n\t}\n}\n'
  fi
} >/etc/caddy/Caddyfile
if [ "$CERTS" = duckdns ]; then
  env "$(cat /etc/caddy/duckdns.env)" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
else
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
fi
systemctl enable caddy >/dev/null
if [ "$CERTS" = http ]; then
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
else
  # A restart, not a reload: the DuckDNS token comes with the service's environment,
  # and the tunnel moves Caddy from every address to the loopback one.
  systemctl restart caddy
fi

# --- Cloudflare Tunnel: Cloudflare → cloudflared → Caddy (CERTS=tunnel) -------------
if [ "$CERTS" = tunnel ]; then
  log "Tunnel service"
  {
    echo "# Generated by infra/dev-host/setup.sh: edit the script, not this file."
    echo "tunnel: $TUNNEL_ID"
    echo "credentials-file: $TUNNEL_CREDENTIALS"
    echo "ingress:"
    for name in "${NAMES[@]}"; do
      printf '  - hostname: %s.%s\n    service: http://127.0.0.1:80\n' "$name" "$DOMAIN"
    done
    echo "  - service: http_status:404"
  } >/etc/cloudflared/config.yml
  cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate >/dev/null
  cat >/etc/systemd/system/atomes-tunnel.service <<EOF
[Unit]
Description=Atomes Cloudflare Tunnel
After=network-online.target caddy.service
Wants=network-online.target

[Service]
ExecStart=$(command -v cloudflared) --no-autoupdate --config /etc/cloudflared/config.yml tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable atomes-tunnel >/dev/null
  systemctl restart atomes-tunnel
elif [ -f /etc/systemd/system/atomes-tunnel.service ]; then
  # Left by an earlier run with CERTS=tunnel.
  systemctl disable --now atomes-tunnel >/dev/null 2>&1 || true
fi

log "Done"
cat <<EOF

  App          https://app.$DOMAIN        (team login: $TEAM_USER)
  Back-office  https://admin.$DOMAIN
  E-mails      https://mail.$DOMAIN       (sign-in codes land here)
  Members      https://app.$DOMAIN/dev    (pick a fictional member)

  Logs: journalctl -fu atomes-web   (or atomes-admin, atomes-worker)
  Update: sudo bash infra/dev-host/update.sh
EOF
