# Firebase-First Messaging Pipeline (Apps Script no longer router)

This migration replaces the current Apps Script message router with Firebase Cloud Functions + Twilio webhooks.

## Why this change

During testing, the current Apps Script router path shows failure modes that match your production symptoms:

- **Resident sync capped at ~50 rows** because script config uses a fixed range (`DATA_RANGE: "A1:Q50"` in `API to Dashboard Script V6.3 interated.js`).
- **Auto-stop behavior** because the Apps Script sender sets abort after 5 consecutive empty/invalid rows.
- **Low throughput** because each message does multiple serial operations from Apps Script (Twilio request + sheet writes + Firestore sync + extensive log writes).

## New architecture

1. **Apps Script (trigger only)**
   - Receives `triggerGreenInEyes=1` / `triggerWhatsappOverList=1`.
   - Forwards one request to Cloud Function `triggerGreenEyesCampaign`.

2. **Cloud Function campaign trigger**
   - Queries `residents` in Firestore.
   - Enqueues docs into `twilioOutboundQueue`.

3. **Cloud Function queue worker**
   - Trigger: `twilioOutboundQueue/{messageId}` `onCreate`.
   - Sends WhatsApp via Twilio.
   - Updates `residents` + queue docs with send state.

4. **Twilio webhooks -> Cloud Functions**
   - `twilioStatusWebhook`: delivery status updates.
   - `twilioInboundWebhook`: user reply mapping (`כולם בסדר` / `זקוקים לסיוע` / `לא בטוח`) into resident status.

5. **Firebase -> Google Sheet eventual sync**
   - Resident changes are enqueued into `residentSheetSyncQueue`.
   - Scheduled function `flushResidentSheetSyncQueue` batches updates to Apps Script sheet webhook.

## Implemented in this repo

### Cloud Functions (`/functions/index.js`)

- `triggerGreenEyesCampaign` (HTTPS)
- `processOutboundQueue` (Firestore trigger)
- `twilioStatusWebhook` (HTTPS)
- `twilioInboundWebhook` (HTTPS)
- `upsertResidentPhoneIndex` (Firestore trigger)
- `enqueueResidentSheetSync` (Firestore trigger)
- `flushResidentSheetSyncQueue` (Scheduled Pub/Sub)
- Existing `sendNotificationOnCreate` kept

### Apps Script templates

- `google-apps-script-trigger-cloud-function.js`  
  Trigger bridge only (no outbound routing).

- `google-apps-script-sheet-sync-webhook.js`  
  Receives batched resident updates from Firebase and updates the sheet.

## Required configuration

Set these before deploying functions:

```bash
firebase functions:config:set \
  twilio.account_sid="..." \
  twilio.auth_token="..." \
  twilio.messaging_service_sid="..." \
  twilio.content_sid="..." \
  twilio.status_callback_url="https://<region>-<project>.cloudfunctions.net/twilioStatusWebhook" \
  pipeline.app_script_secret="<shared-secret>" \
  sheets.sync_webhook_url="https://script.google.com/macros/s/<sheet-sync-script-id>/exec" \
  sheets.sync_shared_secret="<sheet-sync-secret>"
```

Optional:

```bash
firebase functions:config:set twilio.fallback_body="שלום, זהו עדכון חירום"
```

## Deployment

```bash
firebase deploy --only functions
```

## Cutover checklist

1. Deploy Cloud Functions.
2. Deploy **Apps Script trigger bridge** and place its URL in dashboard config (exercise/live as needed).
3. Update Twilio webhooks:
   - Incoming message webhook -> `twilioInboundWebhook`
   - Status callback -> `twilioStatusWebhook`
4. Deploy **Apps Script sheet sync webhook** and set `sheets.sync_webhook_url`.
5. Run a dry run trigger (`dryRun=1`) then run real campaign.

## Notes

- This removes Apps Script from high-volume message routing.
- Throughput now scales with Cloud Functions worker concurrency instead of a single Apps Script execution.
- Resident table updates happen in Firestore first; sheet becomes eventual consistency sink.
