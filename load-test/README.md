# Green Eyes — Load Test

Simulates up to 5,000 residents replying to a WhatsApp emergency alert,
**without involving Twilio at all**. Requests go directly to the live
`handleTwilioWebhook` Cloud Function, stress-testing Firestore writes and
the dashboard's real-time listener under load.

---

## How it works

```
seedLoadTestData  (Cloud Function, one HTTP call)
  → writes 1500 fake resident docs to Firestore
  → sets system/activeEmergency  (sheetId=null → no sheet API calls)
  → returns list of phone numbers

run-load-test.js  (Node.js, no credentials needed)
  → fires N HTTP POSTs to handleTwilioWebhook in parallel batches
     From=whatsapp:+972501000001   Body=1
     From=whatsapp:+972501000002   Body=4
     ...
  → each POST causes a real Firestore write
  → dashboard onSnapshot fires → live status updates on screen
```

Google Sheets is **completely bypassed** during the test — `sheetId` is set to
`null` so the webhook skips all sheet API calls. This isolates the test to
what actually matters: Cloud Function throughput and Firestore + dashboard
real-time behaviour.

---

## Setup (one-time, done from your local machine)

### Step 1 — Set the load-test secret

On your local machine, in the repository root:

```bash
firebase functions:config:set loadtest.secret="your-secret-here"
```

Pick any secret string (e.g. `"green-eyes-test-2025"`). You'll use it in the
`?key=` parameter of every seed/clear call.

### Step 2 — Deploy the two new Cloud Functions

```bash
firebase deploy --only functions:seedLoadTestData,functions:clearLoadTestData,functions:handleTwilioWebhook
```

This deploys three functions:
- `seedLoadTestData` — populates Firestore with fake residents
- `clearLoadTestData` — deletes everything after the test
- `handleTwilioWebhook` — the updated version (Script Logs removed)

---

## Running the test (from the cloud agent, no credentials needed)

### Option A — One command (seed + test in one step)

```bash
node load-test/run-load-test.js \
  --seed-url="https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/seedLoadTestData?key=YOUR_SECRET&count=1500"
```

This will:
1. Call `seedLoadTestData` → seeds 1500 residents into Firestore
2. Save the phone list to `load-test/phones.json`
3. Immediately fire 1500 POST requests at `handleTwilioWebhook`
4. Print a full stats report

### Option B — Separate seed and test (useful for repeated test runs)

```bash
# Seed once
curl "https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/seedLoadTestData?key=YOUR_SECRET&count=1500" \
  | node -e "const d=require('fs');const j=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));d.writeFileSync('load-test/phones.json',JSON.stringify(j.phones,null,2))"

# Run test (can re-run without re-seeding)
node load-test/run-load-test.js
node load-test/run-load-test.js --concurrency=40 --delay=200   # stress
node load-test/run-load-test.js --concurrency=10 --delay=1000  # gentle
```

### Scale presets

| Scale | Command |
|-------|---------|
| Warm-up (500)  | `node load-test/run-load-test.js --count=500 --concurrency=10 --delay=800` |
| Medium (1500)  | `node load-test/run-load-test.js --count=1500 --concurrency=20 --delay=500` |
| Large (4000)   | `node load-test/run-load-test.js --count=4000 --concurrency=40 --delay=300` |
| Full (5000)    | `node load-test/run-load-test.js --count=5000 --concurrency=50 --delay=200` |

Start small. Increase `--concurrency` and reduce `--delay` to increase pressure.

### Dry run (verify config without sending)

```bash
node load-test/run-load-test.js --dry-run
```

---

## What to watch while the test runs

Open these in separate browser tabs **before** starting the test:

| What to watch | URL |
|---------------|-----|
| **Dashboard (main screen)** | `http://localhost:3000`  (`npm run dev`) |
| Cloud Function logs | https://console.firebase.google.com/project/emergency-dashboard-a3842/functions/logs |
| Firestore residents collection | https://console.firebase.google.com/project/emergency-dashboard-a3842/firestore/data/residents |
| Function instance count / latency | https://console.cloud.google.com/functions/details/us-central1/handleTwilioWebhook?project=emergency-dashboard-a3842 |

The dashboard is the most important thing to watch. You should see status counters
ticking up in real time as the replies arrive.

---

## Example output

```
═══════════════════════════════════════════════════════
  Green Eyes — Load Test
═══════════════════════════════════════════════════════
  Target:         us-central1-emergency-dashboard-a3842.cloudfunctions.net
  Residents:      1500
  Concurrency:    20 parallel requests
  Batch delay:    500ms
  Est. duration:  ~37s
═══════════════════════════════════════════════════════

  Progress: 1500/1500 (100%)  ✓ 1487  ✗ 13  38.2s  38.9 req/s

═══════════════════════════════════════════════════════
  Results
═══════════════════════════════════════════════════════
  Total time:       38.2s
  Sent:             1500
  Success:          1487 (99%)
  Errors:           13
  Throughput:       38.9 req/s

  Latency avg:      412ms
  Latency p50:      380ms
  Latency p90:      690ms
  Latency p99:      1820ms
  Latency max:      3100ms
═══════════════════════════════════════════════════════
```

---

## After the test — clean up

```bash
curl "https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/clearLoadTestData?key=YOUR_SECRET"
```

Or from the cloud agent:

```bash
node load-test/clear-residents.js   # requires FIREBASE_SERVICE_ACCOUNT_KEY secret
```

---

## Interpreting results

| Metric | What it tells you |
|--------|-------------------|
| **Success rate** | If < 95%, the Cloud Function is dropping requests (check logs for cause) |
| **p90 / p99 latency** | Tail latency: how slow are the worst 10% / 1% of replies? |
| **Throughput (req/s)** | Effective processing rate. Limited by `maxInstances=100` and Firestore write speed |
| **Dashboard lag** | Watch the dashboard during the test — how quickly do counters update? |
| **CF instance count** | Visible in Cloud Console. Spikes near 100 → function is at concurrency limit |

### Expected bottlenecks at scale

| Scale | Likely first bottleneck |
|-------|------------------------|
| 500   | None — system handles comfortably |
| 1500  | Slight p99 spike from CF cold starts |
| 4000  | CF hits 100-instance cap; requests queue; latency rises |
| 5000  | Dashboard `onSnapshot` may lag if all 5000 writes land within a few seconds |

---

## Seeding alternative (if you have the service account key)

If you've added `FIREBASE_SERVICE_ACCOUNT_KEY` as a Cursor Secret:

```bash
node load-test/seed-residents.js 1500
node load-test/run-load-test.js
```
