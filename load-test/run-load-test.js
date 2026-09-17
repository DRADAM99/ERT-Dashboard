#!/usr/bin/env node
/**
 * Residents Load Test
 *
 * Measures Firestore performance with the residents collection across six scenarios:
 *
 *  1. Cold full-collection fetch  (get all docs)
 *  2. Warm full-collection fetch  (3 repeated fetches, report median)
 *  3. Filtered query              (where סטטוס == "זקוקים לסיוע")
 *  4. Concurrent reads            (8 parallel full-collection fetches)
 *  5. Write throughput            (50 sequential status updates)
 *  6. Real-time listener          (onSnapshot time-to-first-data)
 *
 * Uses the Firebase Admin SDK (bypasses security rules).
 * Defaults to the local Firestore emulator; pass --prod for production.
 *
 * Usage:
 *   node load-test/run-load-test.js
 *   node load-test/run-load-test.js --prod
 */

import admin from "firebase-admin";

const PROJECT_ID = "emergency-dashboard-a3842";
const EMULATOR_HOST = "127.0.0.1:8080";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(label) {
  const pad = "─".repeat(Math.max(0, 60 - label.length - 2));
  console.log(`\n── ${label} ${pad}`);
}

function stat(label, value, unit = "ms") {
  console.log(`  ${label.padEnd(32)} ${String(value).padStart(8)} ${unit}`);
}

function percentile(sortedArr, p) {
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

async function time(fn) {
  const t0 = performance.now();
  const result = await fn();
  return { ms: Math.round(performance.now() - t0), result };
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

async function scenarioColdFetch(db) {
  hr("1 · Cold full-collection fetch");
  const residentsRef = db.collection("residents");

  const { ms, result: snap } = await time(() => residentsRef.get());
  const count = snap.size;

  stat("Documents fetched", count, "docs");
  stat("Total time", ms, "ms");
  if (count > 0) stat("Avg time / doc", (ms / count).toFixed(2), "ms");

  return { count, coldMs: ms, docs: snap.docs };
}

async function scenarioWarmFetch(db) {
  hr("2 · Warm full-collection fetch  (3 repeated fetches)");
  const residentsRef = db.collection("residents");

  const runs = [];
  for (let i = 0; i < 3; i++) {
    const { ms } = await time(() => residentsRef.get());
    runs.push(ms);
  }

  runs.sort((a, b) => a - b);
  stat("Runs (ms each)", runs.join(" / "), "");
  stat("Median", percentile(runs, 50), "ms");
  stat("Min", runs[0], "ms");

  return { warmMedianMs: percentile(runs, 50) };
}

async function scenarioFilteredQuery(db) {
  hr('3 · Filtered query  (סטטוס == "זקוקים לסיוע")');
  const q = db.collection("residents").where("סטטוס", "==", "זקוקים לסיוע");

  const { ms, result: snap } = await time(() => q.get());
  stat("Matching documents", snap.size, "docs");
  stat("Query time", ms, "ms");

  return { filteredCount: snap.size, filteredMs: ms };
}

async function scenarioConcurrentReads(db, concurrency = 8) {
  hr(`4 · Concurrent reads  (${concurrency} parallel getDocs)`);
  const residentsRef = db.collection("residents");

  const t0 = performance.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => residentsRef.get())
  );
  const totalMs = Math.round(performance.now() - t0);
  const totalDocs = results.reduce((sum, s) => sum + s.size, 0);

  stat("Concurrent requests", concurrency, "");
  stat("Total docs received", totalDocs, "docs");
  stat("Wall-clock time", totalMs, "ms");

  return { concurrentMs: totalMs };
}

async function scenarioWriteThroughput(db, docs, writeCount = 50) {
  hr(`5 · Write throughput  (${writeCount} sequential status updates)`);

  if (docs.length === 0) {
    console.log("  ⚠️  No documents to update — skipping");
    return {};
  }

  const STATUSES = ["כולם בסדר", "זקוקים לסיוע", "לא בטוח", "פצוע"];
  const sample = docs.slice(0, Math.min(writeCount, docs.length));
  const times = [];

  for (const d of sample) {
    const newStatus = STATUSES[Math.floor(Math.random() * STATUSES.length)];
    const { ms } = await time(() =>
      d.ref.update({
        סטטוס: newStatus,
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        loadTestUpdate: true,
      })
    );
    times.push(ms);
  }

  times.sort((a, b) => a - b);
  stat("Updates executed", times.length, "");
  stat("Median write latency", percentile(times, 50), "ms");
  stat("p95 write latency", percentile(times, 95), "ms");
  stat("Max write latency", times[times.length - 1], "ms");

  return {
    writeMedianMs: percentile(times, 50),
    writep95Ms: percentile(times, 95),
  };
}

async function scenarioRealtimeListener(db) {
  hr("6 · Real-time listener  (onSnapshot time-to-first-data)");

  const ttfd = await new Promise((resolve, reject) => {
    const t0 = performance.now();
    const timeout = setTimeout(
      () => reject(new Error("Listener timed out after 30s")),
      30_000
    );

    const unsub = db.collection("residents").onSnapshot(
      (snap) => {
        const ms = Math.round(performance.now() - t0);
        clearTimeout(timeout);
        unsub();
        resolve({ ms, count: snap.size });
      },
      (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    );
  });

  stat("Documents received", ttfd.count, "docs");
  stat("Time-to-first-data", ttfd.ms, "ms");

  return { listenerMs: ttfd.ms, listenerCount: ttfd.count };
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(results, mode) {
  hr("SUMMARY");
  console.log(`
  Mode                      : ${mode}
  Collection size           : ${results.count ?? "—"} documents

  Cold full-fetch           : ${results.coldMs ?? "—"} ms
  Warm full-fetch (median)  : ${results.warmMedianMs ?? "—"} ms
  Filtered query            : ${results.filteredMs ?? "—"} ms   (${results.filteredCount ?? "—"} docs)
  8× concurrent reads       : ${results.concurrentMs ?? "—"} ms  wall-clock
  Write latency (median)    : ${results.writeMedianMs ?? "—"} ms
  Write latency (p95)       : ${results.writep95Ms ?? "—"} ms
  Listener TTFD             : ${results.listenerMs ?? "—"} ms
`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const useEmulator = !process.argv.includes("--prod");
  const mode = useEmulator
    ? `emulator (${EMULATOR_HOST})`
    : `production (${PROJECT_ID})`;

  if (useEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  }

  console.log("\n🔥  Residents Load Test — starting");
  console.log(`   Mode    : ${mode}`);
  console.log(`   Time    : ${new Date().toISOString()}\n`);

  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const results = {};

  try {
    Object.assign(results, await scenarioColdFetch(db));
    Object.assign(results, await scenarioWarmFetch(db));
    Object.assign(results, await scenarioFilteredQuery(db));
    Object.assign(results, await scenarioConcurrentReads(db, 8));
    Object.assign(results, await scenarioWriteThroughput(db, results.docs ?? [], 50));
    Object.assign(results, await scenarioRealtimeListener(db));

    printSummary(results, mode);
  } catch (err) {
    console.error("\n❌  Load test error:", err.message || err);
  } finally {
    await admin.app().delete().catch(() => {});
    process.exit(0);
  }
}

main();
