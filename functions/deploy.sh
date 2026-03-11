#!/bin/bash
# ============================================================
# Deploy Firebase Cloud Functions
# Usage:  bash functions/deploy.sh
# ============================================================
# Reads credentials from functions/.env.deploy, writes them
# to functions/.env (which Firebase uploads with the function),
# then runs firebase deploy --only functions.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_DEPLOY="$SCRIPT_DIR/.env.deploy"
ENV_TARGET="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_DEPLOY" ]; then
  echo ""
  echo "❌  $ENV_DEPLOY not found."
  echo "    Run:  cp functions/.env.deploy.example functions/.env.deploy"
  echo "    Then fill in all values."
  echo ""
  exit 1
fi

# Validate — all non-LOADTEST values must be set
echo ""
echo "🔍  Validating $ENV_DEPLOY ..."
MISSING=()
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  # LOADTEST_SECRET is optional (load test only)
  [[ "$key" == "LOADTEST_SECRET" ]] && continue
  if [ -z "$value" ]; then
    MISSING+=("$key")
  fi
done < "$ENV_DEPLOY"

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌  Missing values in $ENV_DEPLOY:"
  for k in "${MISSING[@]}"; do
    echo "      $k"
  done
  echo ""
  exit 1
fi

# Source values for the summary
source "$ENV_DEPLOY"

echo ""
echo "📋  Config summary:"
echo "   Twilio SID:          ${TWILIO_ACCOUNT_SID:0:8}..."
echo "   Messaging Service:   ${TWILIO_MESSAGING_SERVICE_SID:0:8}..."
echo "   Live Content SID:    ${LIVE_CONTENT_SID}"
echo "   Live Sheet ID:       ${LIVE_SHEET_ID:0:12}..."
echo "   Drill Content SID:   ${DRILL_CONTENT_SID}"
echo "   Drill Sheet ID:      ${DRILL_SHEET_ID:0:12}..."
if [ -n "$LOADTEST_SECRET" ]; then
  echo "   Load test secret:    ${LOADTEST_SECRET:0:4}... (set)"
else
  echo "   Load test secret:    (not set — seed/clear endpoints disabled)"
fi
echo ""

read -p "🚀  Copy .env.deploy → .env and deploy? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# Write functions/.env (this file is uploaded by Firebase during deploy)
echo "⚙️   Writing $ENV_TARGET ..."
grep -v '^#' "$ENV_DEPLOY" | grep -v '^[[:space:]]*$' > "$ENV_TARGET"
echo "    Done."

echo ""
echo "🚀  Deploying Cloud Functions..."
cd "$SCRIPT_DIR"
firebase deploy --only functions

# Remove the local .env after deploy (values are now baked into the deployment)
echo ""
echo "🧹  Removing local $ENV_TARGET ..."
rm -f "$ENV_TARGET"

echo ""
echo "✅  Deploy complete!"
echo ""
echo "   Next steps:"
echo "   1. Make sure both Google Sheets have Editor access for the Firebase"
echo "      service account (Firebase Console → Project Settings → Service Accounts)"
echo "   2. Twilio inbound webhook URL:"
echo "      https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/handleTwilioWebhook"
echo "   3. Load test seed URL (if LOADTEST_SECRET was set):"
echo "      https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/seedLoadTestData?key=\$LOADTEST_SECRET&count=1500"
echo ""
