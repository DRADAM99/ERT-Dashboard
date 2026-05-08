#!/bin/bash
# ============================================================
# Deploy Firebase Functions with config from .env.deploy
# Usage:  bash functions/deploy.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ File not found: $ENV_FILE"
  echo "   Run: cp functions/.env.deploy.example functions/.env.deploy"
  echo "   Then fill in your values."
  exit 1
fi

# Read values from .env.deploy (skip comments and blank lines)
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  if [ -z "$value" ]; then
    echo "❌ Missing value for: $key"
    echo "   Please fill in all values in $ENV_FILE"
    exit 1
  fi
  declare "$key=$value"
done < "$ENV_FILE"

echo ""
echo "📋 Config summary:"
echo "   Twilio SID:        ${TWILIO_ACCOUNT_SID:0:8}..."
echo "   Messaging Service: ${TWILIO_MESSAGING_SERVICE_SID:0:8}..."
echo "   Live Content SID:  ${LIVE_CONTENT_SID}"
echo "   Live Sheet ID:     ${LIVE_SHEET_ID:0:12}..."
echo "   Drill Content SID: ${DRILL_CONTENT_SID}"
echo "   Drill Sheet ID:    ${DRILL_SHEET_ID:0:12}..."
echo ""

read -p "🔑 Set Firebase Functions config? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo "⚙️  Setting Firebase Functions config..."
firebase functions:config:set \
  twilio.account_sid="$TWILIO_ACCOUNT_SID" \
  twilio.auth_token="$TWILIO_AUTH_TOKEN" \
  twilio.messaging_service_sid="$TWILIO_MESSAGING_SERVICE_SID" \
  mode.live.content_sid="$LIVE_CONTENT_SID" \
  mode.live.sheet_id="$LIVE_SHEET_ID" \
  mode.live.sheet_name="$LIVE_SHEET_NAME" \
  mode.drill.content_sid="$DRILL_CONTENT_SID" \
  mode.drill.sheet_id="$DRILL_SHEET_ID" \
  mode.drill.sheet_name="$DRILL_SHEET_NAME"

echo ""
echo "✅ Config set. Verifying..."
firebase functions:config:get
echo ""

read -p "🚀 Deploy Cloud Functions now? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Config is set. Run 'firebase deploy --only functions' when ready."
  exit 0
fi

echo "🚀 Deploying Cloud Functions..."
cd "$SCRIPT_DIR"
firebase deploy --only functions

echo ""
echo "✅ Done! Next steps:"
echo "   1. Share both Google Sheets with your Firebase service account (Editor)"
echo "   2. Update Twilio inbound webhook URL to:"
echo "      https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/handleTwilioWebhook"
echo "   3. Test: toggle to תרגיל on dashboard → press Green Eyes → check Firestore"
