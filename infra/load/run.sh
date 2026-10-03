#!/usr/bin/env bash
# Load test of the Pact reveal (docs/11): prepares the fictional « Charge »
# members, runs k6 against the local stack, then removes the data.
# Usage: infra/load/run.sh [members=3000] [reveal-in seconds=180]
# Needs: the app (`pnpm start`, APP_ENV=development, DEV_AUTH=1), the worker
# and Centrifugo running; Docker for k6. See infra/load/README.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

members="${1:-3000}"
reveal_in="${2:-180}"
image="${K6_IMAGE:-grafana/k6:2.3.0}"
docker image inspect "$image" >/dev/null 2>&1 ||
  docker pull -q "$image" ||
  { docker pull -q "mirror.gcr.io/$image" && docker tag "mirror.gcr.io/$image" "$image"; }

trap 'pnpm --silent pact:load --clean' EXIT
prepared="$(pnpm --silent pact:load --members "$members" --reveal-in "$reveal_in" | tail -n 1)"
reveal_at="$(node -e 'console.log(JSON.parse(process.argv[1]).revealAt)' "$prepared")"
echo "Reveal at ${reveal_at} for ${members} members."

mkdir -p infra/load/results
docker run --rm --network host --user "$(id -u):$(id -g)" \
  -v "$PWD/infra/load:/scripts" \
  -e MEMBERS="$members" -e REVEAL_AT="$reveal_at" \
  -e API_URL -e SOCKETS_PER_VU -e RAMP_SECONDS -e MESSAGES_PER_PAIR -e REVEAL_JITTER_MS -e BURST_DELAY_SECONDS \
  -e PACT_REVEAL_RESULTS_PER_SECOND \
  "$image" run --summary-export "/scripts/results/summary.json" /scripts/pact-reveal.js
