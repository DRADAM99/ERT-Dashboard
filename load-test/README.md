# Green Eyes — Load Test

Simulates up to 5,000 residents replying to a WhatsApp emergency alert,
**without involving Twilio at all**.  Requests go directly to the live
`handleTwilioWebhook` Cloud Function.

## How it works

```
seed-residents.js  →  Firestore (1500 fake resident docs)
                   →  system/activeEmergency (sheetId = null → no sheet writes)
                   →  phones.json  (list of phone numbers for the runner)

run-load-test.js   →  POST /handleTwilioWebhook  ×  N
                       From=whatsapp:+972501000001
                       Body=1
```

Google Sheets is completely bypassed during the test because the seed sets
`sheetId = null` in `system/activeEmergency`. Every reply still updates
Firestore in real time, which is what the dashboard reads.

---

## One-time setup: service account key

The seed script needs admin write access to Firestore.

1. Open [Firebase Console → Project Settings → Service Accounts](https://console.firebase.google.com/project/emergency-dashboard-a3842/settings/serviceaccounts/adminsdk)
2. Click **Generate new private key**
3. Save the downloaded file as `/workspace/serviceAccountKey.json`

> ⚠️ `serviceAccountKey.json` is already in `.gitignore` — it will never be committed.

---

## Running the test

### Step 1 — Seed Firestore (run once per test session)

```bash
# From workspace root
node load-test/seed-residents.js 1500
```

Output:
```
🌱  Seeding 1500 fake residents into Firestore...
   Firestore: 1500/1500 written
   Setting system/activeEmergency ... done

✅  Seed complete — 1500 residents ready.
   Next step:  node load-test/run-load-test.js
```

You can re-run with a different count at any time:
```bash
node load-test/seed-residents.js 5000
```

### Step 2 — Run the load test

```bash
# Default: 1500 residents, 20 concurrent, 500ms between batches
node load-test/run-load-test.js

# Faster (stress test)
node load-test/run-load-test.js --count=1500 --concurrency=40 --delay=200

# Gentle warm-up
node load-test/run-load-test.js --count=500 --concurrency=10 --delay=1000

# 5000 residents
node load-test/run-load-test.js --count=5000 --concurrency=50 --delay=300

# Dry run — print config and exit
node load-test/run-load-test.js --dry-run
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--count=N` | 1500 | Number of residents to simulate |
| `--concurrency=N` | 20 | Parallel requests per batch |
| `--delay=N` | 500 | Milliseconds to wait between batches |
| `--dry-run` | — | Print config without sending |

### Example output

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

## What to watch while the test runs

Open these in separate browser tabs:

| What | URL |
|------|-----|
| Firebase Functions logs | https://console.firebase.google.com/project/emergency-dashboard-a3842/functions/logs |
| Firestore residents collection | https://console.firebase.google.com/project/emergency-dashboard-a3842/firestore/data/residents |
| Cloud Function metrics | https://console.cloud.google.com/functions/details/us-central1/handleTwilioWebhook?project=emergency-dashboard-a3842 |
| The dashboard itself | http://localhost:3000 (run `npm run dev`) |

---

## What the test measures

- **Firestore write throughput** — each reply updates one resident doc
- **Cloud Function latency** — end-to-end response time per request
- **Concurrency cap** — the function allows max 100 instances; requests above that queue
- **Dashboard real-time performance** — open the dashboard while the test runs to see status updates streaming in

---

## After the test

To clear the fake residents and reset Firestore:

```bash
node load-test/clear-residents.js
```

Or manually in the Firebase Console: delete all docs in `residents` and
delete `system/activeEmergency`.

---

## Scaling up

| Scale | Recommended flags |
|-------|-------------------|
| 500   | `--count=500 --concurrency=15 --delay=500` |
| 1500  | `--count=1500 --concurrency=20 --delay=500` |
| 4000  | `--count=4000 --concurrency=40 --delay=300` |
| 5000  | `--count=5000 --concurrency=50 --delay=200` |

Start low and increase `--concurrency` gradually.
If you see > 10% errors, lower concurrency or raise delay.
