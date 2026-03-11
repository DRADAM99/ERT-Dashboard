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
 *   Firestore must be seeded. Choose one method:
 *   A) Via the deployed Cloud Function (no service account key needed):
 *      node load-test/run-load-test.js --seed-url=https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/seedLoadTestData?key=YOUR_SECRET
 *   B) Via local seed script (needs FIREBASE_SERVICE_ACCOUNT_KEY secret):
 *      node load-test/seed-residents.js 1500
 *
 * Usage:
 *   node load-test/run-load-test.js
 *   node load-test/run-load-test.js --count=500
 *   node load-test/run-load-test.js --count=1500 --concurrency=30 --delay=400
 *   node load-test/run-load-test.js --count=5000 --concurrency=50 --delay=200
 *   node load-test/run-load-test.js --seed-url=https://...seedLoadTestData?key=SECRET&count=1500
 *
 * Options:
 *   --count=N          Total residents to simulate  (default: 1500)
 *   --concurrency=N    Parallel requests per batch  (default: 20)
 *   --delay=N          Milliseconds between batches (default: 500)
 *   --seed-url=URL     Seed Firestore via the deployed Cloud Function, then run
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
      const eqIdx = a.indexOf("=");
      if (eqIdx === -1) return [a.slice(2), true];
      return [a.slice(2, eqIdx), a.slice(eqIdx + 1)]; // split on first = only
    }),
);

const SEED_URL    = args["seed-url"] ?? null;

// If --count not set explicitly, infer it from ?count= in the seed URL
function inferCount() {
  if (args.count) return parseInt(args.count, 10);
  if (SEED_URL) {
    const m = SEED_URL.match(/[?&]count=(\d+)/);
    if (m) return parseInt(m[1], 10);
  }
  return 1500;
}

const COUNT       = inferCount();
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

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {method: "GET", hostname: u.hostname, path: u.pathname + u.search, timeout: 120000};
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
    req.on("error", reject);
    req.end();
  });
}

async function loadPhones() {
  // Option 1: --seed-url flag → call the deployed Cloud Function to seed + get phones
  if (SEED_URL) {
    console.log("  Seeding Firestore via Cloud Function...");
    const url = SEED_URL.includes("count=") ? SEED_URL : `${SEED_URL}&count=${COUNT}`;
    try {
      const raw  = await httpsGet(url);
      const data = JSON.parse(raw);
      if (!data.success || !data.phones) throw new Error(data.error || "Unexpected response");
      const phones = data.phones.slice(0, COUNT);
      // Save for next run (avoids re-seeding)
      fs.writeFileSync(path.join(__dirname, "phones.json"), JSON.stringify(phones, null, 2));
      console.log(`  Seeded ${phones.length} residents (eventId: ${data.eventId})\n`);
      return phones;
    } catch (err) {
      console.error(`❌  Seed via Cloud Function failed: ${err.message}`);
      console.error("    Check that you deployed seedLoadTestData and the ?key= is correct.");
      process.exit(1);
    }
  }

  // Option 2: phones.json already exists (from a previous seed run)
  const phonesFile = path.join(__dirname, "phones.json");
  if (fs.existsSync(phonesFile)) {
    const all = JSON.parse(fs.readFileSync(phonesFile, "utf8"));
    if (COUNT > all.length) {
      console.warn(`⚠️   phones.json has ${all.length} entries but --count=${COUNT}.`);
      console.warn(`    Using all ${all.length} available phones.\n`);
      return all;
    }
    return all.slice(0, COUNT);
  }

  // Option 3: generate on the fly — Firestore must have been seeded separately
  console.warn("⚠️   phones.json not found — generating phone numbers on the fly.");
  console.warn("    Firestore must already have matching resident docs.");
  console.warn("    Seed first with:  node load-test/seed-residents.js 1500\n");
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
  const phones = await loadPhones();

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
