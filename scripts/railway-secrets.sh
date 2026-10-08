#!/usr/bin/env bash
# One-time Railway setup after `railway config apply`: shared secrets, provider keys, public domains.
# Re-running rotates the generated secrets (everyone gets logged out), so run it once.
# Provider keys are read from your local .env if present.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

INTERNAL=$(openssl rand -hex 24)
AUTH=$(openssl rand -hex 32)
COLLAB=$(openssl rand -hex 32)

setv() { # service KEY=VALUE...
  local svc=$1; shift
  railway variable set --service "$svc" --skip-deploys "$@" >/dev/null
  echo "  set $(printf '%s ' "${@%%=*}")on $svc"
}

echo "Secrets"
for s in risk llm bhashini kestrel boli onboard margin; do setv "$s" "INTERNAL_API_KEY=$INTERNAL"; done
for s in kestrel boli onboard margin; do setv "$s" "BETTER_AUTH_SECRET=$AUTH"; done
setv collab "COLLAB_JWT_SECRET=$COLLAB"
setv margin "COLLAB_JWT_SECRET=$COLLAB"

echo "Provider keys"
[ -n "${ANTHROPIC_API_KEY:-}" ] && setv llm "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" || echo "  ANTHROPIC_API_KEY empty: set it later on 'llm'"
if [ -n "${BHASHINI_USER_ID:-}" ]; then
  setv bhashini "BHASHINI_USER_ID=$BHASHINI_USER_ID" "BHASHINI_ULCA_API_KEY=$BHASHINI_ULCA_API_KEY"
else
  echo "  Bhashini keys empty: set BHASHINI_USER_ID / BHASHINI_ULCA_API_KEY later on 'bhashini'"
fi
if [ -n "${GITHUB_CLIENT_ID:-}" ]; then
  for s in kestrel boli onboard margin; do setv "$s" "GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID" "GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET"; done
fi

echo "Public domains"
for s in kestrel boli onboard margin; do railway domain --service "$s" --port 3000 || true; done
railway domain --service collab --port 8004 || true

echo "Redeploying"
for s in llm risk bhashini collab kestrel boli onboard margin; do railway redeploy --service "$s" --yes --from-source >/dev/null || echo "  redeploy $s failed; trigger it from the dashboard"; done
echo "Done. Watch builds in the Railway dashboard."
