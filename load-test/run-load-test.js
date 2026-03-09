#!/usr/bin/env node
"use strict";

/**
 * run-load-test.js
 *
 * Simulates N residents replying to a WhatsApp emergency message by firing
 * HTTP POST requests directly at the live handleTwilioWebhook Cloud Function.
 * No Twilio account needed — we bypass Twilio entirely.
 *
 * Prerequisites:
 *   1. Run seed-residents.js first (populates Firestore + system/activeEmergency)
 *   2. Deploy the updated Cloud Function (optional but recommended)
 *
 * Usage:
 *   node load-test/run-load-test.js
 *   node load-test/run-load-test.js --count=500
 *   node load-test/run-load-test.js --count=1500 --concurrency=30 --delay=400
 *   node load-test/run-load-test.js --count=5000 --concurrency=50 --delay=200
 *
 * Options:
 *   --count=N          Total residents to simulate  (default: 1500)
 *   --concurrency=N    Parallel requests per batch  (default: 20)
 *   --delay=N          Milliseconds between batches (default: 500)
 *   --dry-run          Print config and exit without sending
 */

const https = require("https");
const fs    = require("fs");
const path  = require("path");

// ── Configuration ──────────────────────────────────────────────────────────

const WEBHOOK_HOST = "us-central1-emergency-dashboard-a3842.cloudfunctions.net";
const WEBHOOK_PATH = "/handleTwilioWebhook";

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.replace("--", "").split("=");
      return [k, v ?? true];
    }),
);

const COUNT       = parseInt(args.count       ?? "1500", 10);
const CONCURRENCY = parseInt(args.concurrency ?? "20",   10);
const DELAY_MS    = parseInt(args.delay       ?? "500",  10);
const DRY_RUN     = args["dry-run"] === true || args["dry-run"] === "true";

// ── Reply distribution ─────────────────────────────────────────────────────
// Realistic mix: most reply "ok", some need help, some unsure, a few in Hebrew

const REPLY_POOL = [
  ...Array(60).fill("1"),           // כולם בסדר
  ...Array(15).fill("הכל בסדר"),    // כולם בסדר (Hebrew)
  ...Array(10).fill("4"),           // זקוקים לסיוע
  ...Array(10).fill("2"),           // לא בטוח
  ...Array(5).fill("סיוע"),         // זקוקים לסיוע (Hebrew)
];

function randomReply() {
  return REPLY_POOL[Math.floor(Math.random() * REPLY_POOL.length)];
}

// ── Phone list ─────────────────────────────────────────────────────────────

function loadPhones() {
  const phonesFile = path.join(__dirname, "phones.json");
  if (fs.existsSync(phonesFile)) {
    const all = JSON.parse(fs.readFileSync(phonesFile, "utf8"));
    if (COUNT > all.length) {
      console.warn(`⚠️   phones.json has ${all.length} entries but --count=${COUNT}.`);
      console.warn("    Re-run seed-residents.js with a higher count, or lower --count.");
      console.warn(`    Using all ${all.length} available phones.\n`);
      return all;
    }
    return all.slice(0, COUNT);
  }

  // No phones.json: generate phone numbers on the fly (matching seed pattern)
  console.warn("⚠️   phones.json not found — generating phone numbers on the fly.");
  console.warn("    Make sure you ran seed-residents.js first so Firestore has these residents.\n");
  return Array.from({length: COUNT}, (_, i) =>
    `972501${String(i + 1).padStart(6, "0")}`,
  );
}

// ── HTTP POST ──────────────────────────────────────────────────────────────

function postWebhook(phone, reply) {
  return new Promise((resolve, reject) => {
    const formBody =
      `From=${encodeURIComponent("whatsapp:+" + phone)}` +
      `&Body=${encodeURIComponent(reply)}`;

    const options = {
      method:   "POST",
      hostname: WEBHOOK_HOST,
      path:     WEBHOOK_PATH,
      headers:  {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(formBody),
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end",  () => {
        if (res.statusCode === 200) {
          resolve({status: res.statusCode});
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.on("error", reject);
    req.write(formBody);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Statistics helpers ─────────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function avg(arr) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function runLoadTest() {
  const phones = loadPhones();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Green Eyes — Load Test");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Target:         ${WEBHOOK_HOST}`);
  console.log(`  Residents:      ${phones.length}`);
  console.log(`  Concurrency:    ${CONCURRENCY} parallel requests`);
  console.log(`  Batch delay:    ${DELAY_MS}ms`);
  console.log(`  Est. duration:  ~${Math.ceil(phones.length / CONCURRENCY * DELAY_MS / 1000)}s`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (DRY_RUN) {
    console.log("  --dry-run specified. Exiting without sending.\n");
    return;
  }

  const startTime  = Date.now();
  const latencies  = [];
  let successCount = 0;
  let errorCount   = 0;
  const errorLog   = [];

  for (let i = 0; i < phones.length; i += CONCURRENCY) {
    const batchPhones = phones.slice(i, i + CONCURRENCY);

    await Promise.all(batchPhones.map(async (phone) => {
      const reply    = randomReply();
      const reqStart = Date.now();
      try {
        await postWebhook(phone, reply);
        latencies.push(Date.now() - reqStart);
        successCount++;
      } catch (err) {
        errorCount++;
        if (errorLog.length < 20) {
          errorLog.push({phone, reply, error: err.message});
        }
      }
    }));

    // Live progress line
    const done    = Math.min(i + CONCURRENCY, phones.length);
    const pct     = Math.round((done / phones.length) * 100);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rps     = (successCount / ((Date.now() - startTime) / 1000)).toFixed(1);
    process.stdout.write(
      `\r  Progress: ${done}/${phones.length} (${pct}%)` +
      `  ✓ ${successCount}  ✗ ${errorCount}` +
      `  ${elapsed}s  ${rps} req/s   `,
    );

    if (i + CONCURRENCY < phones.length) {
      await sleep(DELAY_MS);
    }
  }

  const totalMs = Date.now() - startTime;
  const sorted  = [...latencies].sort((a, b) => a - b);

  console.log("\n");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Results");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Total time:       ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Sent:             ${phones.length}`);
  console.log(`  Success:          ${successCount} (${Math.round((successCount / phones.length) * 100)}%)`);
  console.log(`  Errors:           ${errorCount}`);
  console.log(`  Throughput:       ${(successCount / (totalMs / 1000)).toFixed(1)} req/s`);
  console.log("");
  console.log(`  Latency avg:      ${avg(latencies)}ms`);
  console.log(`  Latency p50:      ${percentile(sorted, 50)}ms`);
  console.log(`  Latency p90:      ${percentile(sorted, 90)}ms`);
  console.log(`  Latency p99:      ${percentile(sorted, 99)}ms`);
  console.log(`  Latency max:      ${sorted[sorted.length - 1] ?? 0}ms`);

  if (errorLog.length > 0) {
    console.log("\n  First errors:");
    errorLog.slice(0, 10).forEach((e) =>
      console.log(`    - ${e.phone}  reply="${e.reply}"  → ${e.error}`),
    );
  }

  console.log("═══════════════════════════════════════════════════════\n");

  if (errorCount > phones.length * 0.1) {
    console.log("⚠️   Error rate > 10%. Likely causes:");
    console.log("     - system/activeEmergency missing or mode='none'  → re-run seed-residents.js");
    console.log("     - Cloud Function cold-start storm               → lower --concurrency");
    console.log("     - Google Sheets API 429 (if sheetId is set)     → seed sets sheetId=null\n");
  }
}

runLoadTest().catch((err) => {
  console.error("\n❌  Load test crashed:", err.message);
  process.exit(1);
});
