/**
 * Scheduled runner for the drill sandbox.
 * Applies buckets already stored on drillRuns/{id}/buckets.
 * Does not send WhatsApp, does not write Google Sheets, and does not
 * create emergencyEvents documents.
 *
 * Resident status strings match lib/drillPlan.js:
 *   כולם בסדר | זקוקים לסיוע | לא בטוח
 * History entries are tagged source: "drill-sandbox" plus the scenario id.
 */

const BATCH_LIMIT = 450;
const MAX_GET = 300;
const SOURCE = "drill-sandbox";
const LOCK_PATH = "systemSettings/drillSandbox";
const ALLOWED_STATUS = new Set(["כולם בסדר", "זקוקים לסיוע", "לא בטוח"]);

function elapsedMinute(startedAtMs, nowMs) {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return -1;
  return Math.floor((nowMs - startedAtMs) / 60000);
}

async function safetyBlock(db) {
  const modeSnap = await db.doc("systemSettings/emergencyMode").get();
  const mode = modeSnap.exists ? modeSnap.get("mode") : "drill";
  if (mode === "live") return "emergency-live";

  const open = await db.collection("emergencyEvents")
      .where("status", "not-in", ["completed", "error"])
      .limit(1)
      .get();
  if (!open.empty) {
    console.log(`[DrillSandbox] green-eyes still open: ${open.docs[0].id} status=${open.docs[0].get("status")}`);
    return "green-eyes-in-progress";
  }
  return null;
}

async function pauseRun(db, admin, runRef, reason) {
  const lockRef = db.doc(LOCK_PATH);
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(runRef);
    const lock = await tx.get(lockRef);
    if (!fresh.exists || fresh.get("status") !== "running") return;
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.update(runRef, {
      status: "paused",
      pausedAt: now,
      pauseReason: reason,
      updatedAt: now,
      updatedBy: SOURCE,
    });
    if (lock.exists && lock.get("activeRunId") === runRef.id) {
      tx.set(lockRef, {
        activeRunId: "",
        activeStatus: "idle",
        updatedAt: now,
        updatedBy: SOURCE,
      }, {merge: true});
    }
  });
}

async function finishRun(db, admin, runRef, reason) {
  const lockRef = db.doc(LOCK_PATH);
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(runRef);
    const lock = await tx.get(lockRef);
    if (!fresh.exists || fresh.get("status") !== "running") return;
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.update(runRef, {
      status: "finished",
      finishedAt: now,
      finishReason: reason,
      updatedAt: now,
      updatedBy: SOURCE,
    });
    if (lock.exists && lock.get("activeRunId") === runRef.id) {
      tx.set(lockRef, {
        activeRunId: "",
        activeStatus: "idle",
        updatedAt: now,
        updatedBy: SOURCE,
      }, {merge: true});
    }
  });
}

function alreadyApplied(data, targetStatus, scenarioId) {
  const current = String(data["סטטוס"] || "").trim();
  if (current !== targetStatus) return false;
  const history = Array.isArray(data.statusHistory) ? data.statusHistory : [];
  const last = history[history.length - 1];
  return Boolean(last
    && last.source === SOURCE
    && last.scenarioId === scenarioId
    && last.to === targetStatus);
}

async function applyBucket(db, admin, bucketSnap, scenarioId) {
  const bucket = bucketSnap.data() || {};
  const targetStatus = bucket.status;
  const ids = Array.isArray(bucket.residentIds) ? bucket.residentIds : [];
  if (!ALLOWED_STATUS.has(targetStatus)) {
    console.error(`[DrillSandbox] skip bucket ${bucketSnap.id}: unexpected status`);
    await bucketSnap.ref.update({
      applied: true,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  const now = new Date();
  for (let offset = 0; offset < ids.length; offset += MAX_GET) {
    const slice = ids.slice(offset, offset + MAX_GET).map((id) => String(id || "")).filter(Boolean);
    if (!slice.length) continue;
    const refs = slice.map((id) => db.collection("residents").doc(id));
    const snaps = await db.getAll(...refs);
    let batch = db.batch();
    let ops = 0;
    const commit = async () => {
      if (ops === 0) return;
      await batch.commit();
      batch = db.batch();
      ops = 0;
    };
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data() || {};
      if (alreadyApplied(data, targetStatus, scenarioId)) continue;
      const fromStatus = String(data["סטטוס"] || "").trim();
      const entry = {
        from: fromStatus,
        to: targetStatus,
        timestamp: now,
        userId: SOURCE,
        userAlias: "ארגז חול",
        source: SOURCE,
        scenarioId: scenarioId || "",
      };
      batch.update(snap.ref, {
        "סטטוס": targetStatus,
        statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastStatusChange: entry,
        statusHistory: admin.firestore.FieldValue.arrayUnion(entry),
      });
      ops += 1;
      if (ops >= BATCH_LIMIT) await commit();
    }
    await commit();
  }

  await bucketSnap.ref.update({
    applied: true,
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function applyDueBuckets(db, admin, runSnap, nowMs) {
  const run = runSnap.data() || {};
  const startedAt = run.startedAt && typeof run.startedAt.toDate === "function"
    ? run.startedAt.toDate().getTime()
    : NaN;
  const duration = Math.max(1, Number(run.durationMinutes) || 1);
  const elapsed = elapsedMinute(startedAt, nowMs);
  if (elapsed < 0) return;

  const bucketsSnap = await runSnap.ref.collection("buckets").get();
  const due = bucketsSnap.docs
      .filter((entry) => !entry.get("applied") && Number(entry.get("minuteIndex")) <= elapsed)
      .sort((a, b) => Number(a.get("minuteIndex")) - Number(b.get("minuteIndex")));

  const appliedIds = new Set(
      bucketsSnap.docs.filter((entry) => entry.get("applied")).map((entry) => entry.id)
  );

  for (const bucket of due) {
    const fresh = await runSnap.ref.get();
    if (!fresh.exists || fresh.get("status") !== "running") return;
    await applyBucket(db, admin, bucket, run.scenarioId);
    appliedIds.add(bucket.id);
  }

  const stillOpen = bucketsSnap.docs.some((entry) => !appliedIds.has(entry.id));
  if (!stillOpen && elapsed >= duration - 1) {
    await finishRun(db, admin, runSnap.ref, "completed");
    console.log(`[DrillSandbox] finished run ${runSnap.id}`);
  }
}

/**
 * One scheduler tick. Refuses to write resident statuses when emergency
 * mode is live or a real green-eyes send is not completed/error.
 * In that case the run is paused so a later tick cannot catch up onto
 * statuses that may now be real.
 */
async function tickDrillSandbox(db, admin, nowMs = Date.now()) {
  const block = await safetyBlock(db);
  const runs = await db.collection("drillRuns").where("status", "==", "running").get();
  if (runs.empty) return {action: "idle", block};

  if (block) {
    for (const runDoc of runs.docs) {
      await pauseRun(db, admin, runDoc.ref, block);
    }
    console.log(`[DrillSandbox] paused ${runs.size} run(s): ${block}`);
    return {action: "paused", block, count: runs.size};
  }

  for (const runDoc of runs.docs) {
    try {
      await applyDueBuckets(db, admin, runDoc, nowMs);
    } catch (error) {
      console.error(`[DrillSandbox] run ${runDoc.id} failed:`, error && error.message ? error.message : error);
    }
  }
  return {action: "ticked", count: runs.size};
}

module.exports = {
  tickDrillSandbox,
  elapsedMinute,
  BATCH_LIMIT,
  SOURCE,
};
