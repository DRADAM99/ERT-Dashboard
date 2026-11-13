import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase";
import { writePublicAnnouncements } from "@/lib/emergencyActions";
import { buildDrillPlan, scenarioToFields } from "@/lib/drillPlan";
import { timestampMs } from "@/lib/drillTime";

export const DRILL_SCENARIOS = "drillScenarios";
export const DRILL_RUNS = "drillRuns";
export const DRILL_LOCK = { collection: "systemSettings", id: "drillSandbox" };
const BATCH_LIMIT = 450;
const ACTIVE_STATUSES = ["running", "paused"];

function lockRef() {
  return doc(db, DRILL_LOCK.collection, DRILL_LOCK.id);
}

function authorName(updatedBy) {
  const name = String(updatedBy || "").trim();
  return name || 'חמ"ל יישובי';
}

async function deleteDocs(refs) {
  let batch = writeBatch(db);
  let ops = 0;
  for (const ref of refs) {
    batch.delete(ref);
    ops += 1;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
}

async function deleteRunBuckets(runId) {
  const snap = await getDocs(collection(db, DRILL_RUNS, runId, "buckets"));
  await deleteDocs(snap.docs.map((entry) => entry.ref));
}

export function subscribeDrillScenarios(onChange, onError) {
  return onSnapshot(
    collection(db, DRILL_SCENARIOS),
    (snap) => {
      const rows = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      rows.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      onChange(rows);
    },
    onError || (() => {})
  );
}

export function subscribeActiveDrillRuns(onChange, onError) {
  const activeQuery = query(collection(db, DRILL_RUNS), where("status", "in", ACTIVE_STATUSES));
  return onSnapshot(
    activeQuery,
    (snap) => {
      onChange(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    },
    onError || (() => {})
  );
}

export function subscribeDrillLock(onChange, onError) {
  return onSnapshot(
    lockRef(),
    (snap) => onChange(snap.exists() ? snap.data() : null),
    onError || (() => {})
  );
}

export function subscribeDrillBuckets(runId, onChange, onError) {
  if (!runId) return () => {};
  return onSnapshot(
    collection(db, DRILL_RUNS, runId, "buckets"),
    (snap) => {
      onChange(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    },
    onError || (() => {})
  );
}

function clockFields(run) {
  const status = run?.status === "paused" ? "paused" : "running";
  const fields = {
    activeRunId: run.id,
    activeStatus: status,
    startedAt: run.startedAt,
    pausedMs: Math.max(0, Math.round(Number(run.pausedMs) || 0)),
    durationMinutes: Math.max(1, Math.round(Number(run.durationMinutes) || 1)),
  };
  if (status === "paused" && run.pausedAt) fields.pausedAt = run.pausedAt;
  else fields.pausedAt = deleteField();
  return fields;
}

/** Copy timing onto the shared lock so every signed-in clock can tick. */
export async function publishDrillClock(run) {
  if (!run?.id || (run.status !== "running" && run.status !== "paused")) return;
  if (!Number.isFinite(timestampMs(run.startedAt))) return;
  const lock = await getDoc(lockRef());
  const lockData = lock.exists() ? lock.data() || {} : {};
  const sameRun = lockData.activeRunId === run.id;
  const pausedMs = Number.isFinite(Number(run.pausedMs))
    ? Math.max(0, Math.round(Number(run.pausedMs)))
    : (sameRun ? Math.max(0, Math.round(Number(lockData.pausedMs) || 0)) : 0);
  await setDoc(lockRef(), {
    ...clockFields({ ...run, pausedMs }),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveDrillScenario({ id, scenario, updatedBy }) {
  const fields = scenarioToFields(scenario);
  if (!fields.name) throw new Error("צריך שם לתרחיש");
  const ref = id ? doc(db, DRILL_SCENARIOS, id) : doc(collection(db, DRILL_SCENARIOS));
  const existing = id ? await getDoc(ref) : null;
  const author = authorName(updatedBy);
  await setDoc(ref, {
    ...fields,
    createdAt: existing?.exists() ? existing.data().createdAt : serverTimestamp(),
    createdBy: existing?.exists() ? (existing.data().createdBy || author) : author,
    updatedAt: serverTimestamp(),
    updatedBy: author,
  });
  return ref.id;
}

export async function deleteDrillScenario(id) {
  if (!id) return;
  await deleteDoc(doc(db, DRILL_SCENARIOS, id));
}

async function assertSafeToActivate() {
  const modeSnap = await getDoc(doc(db, "systemSettings", "emergencyMode"));
  if (modeSnap.exists() && modeSnap.data()?.mode === "live") {
    throw new Error("אי אפשר להפעיל תרגיל ארגז חול כשהמערכת במצב חי.");
  }
  const open = await getDocs(query(
    collection(db, "emergencyEvents"),
    where("status", "not-in", ["completed", "error"]),
    limit(1)
  ));
  if (!open.empty) {
    throw new Error("שליחת ירוק בעיניים אמיתית עדיין רצה. התרגיל לא הופעל, ולא נשלח וואטסאפ.");
  }
}

async function assertNoActiveRun() {
  const active = await getDocs(query(collection(db, DRILL_RUNS), where("status", "in", ACTIVE_STATUSES), limit(1)));
  if (!active.empty) {
    const status = active.docs[0].data()?.status;
    if (status === "paused") {
      throw new Error("יש תרגיל מושהה. המשך ממשיך אותו, או סיים תרגיל לפני הפעלה חדשה.");
    }
    throw new Error("כבר יש תרגיל רץ. צריך להשהות אותו או לסיים את התרגיל לפני הפעלה נוספת.");
  }
  const lock = await getDoc(lockRef());
  const lockStatus = lock.exists() ? lock.data()?.activeStatus : "idle";
  if (lockStatus === "running" || lockStatus === "paused") {
    throw new Error(lockStatus === "paused"
      ? "יש תרגיל מושהה. המשך ממשיך אותו, או סיים תרגיל לפני הפעלה חדשה."
      : "כבר יש תרגיל רץ. צריך להשהות אותו או לסיים את התרגיל לפני הפעלה נוספת.");
  }
}

/**
 * Build the minute plan once, store it on drillRuns/{id}, and publish the
 * fake announcement into the shared public list. Does not create an
 * emergencyEvents document and does not send WhatsApp.
 */
export async function activateDrillScenario({ scenarioId, scenario, residentIds, updatedBy }) {
  if (!scenarioId) throw new Error("צריך לשמור את התרחיש לפני הפעלה");
  const fields = scenarioToFields(scenario);
  if (!fields.name) throw new Error("צריך שם לתרחיש");
  if (!fields.announcementText) throw new Error("צריך טקסט להודעה לציבור");
  const plan = buildDrillPlan({ residentIds, scenario: fields });
  if (!plan.ok) throw new Error(plan.error || "אי אפשר לבנות לוח דקות");
  if (!plan.counts.total) throw new Error("אין תושבים לתרגיל");

  await assertSafeToActivate();
  await assertNoActiveRun();

  const author = authorName(updatedBy);
  const runRef = doc(collection(db, DRILL_RUNS));
  const buckets = collection(db, DRILL_RUNS, runRef.id, "buckets");
  let batch = writeBatch(db);
  let ops = 0;
  try {
    for (const bucket of plan.buckets) {
      batch.set(doc(buckets), {
        minuteIndex: bucket.minuteIndex,
        status: bucket.status,
        residentIds: bucket.residentIds,
        applied: false,
        scenarioId,
      });
      ops += 1;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    await runTransaction(db, async (transaction) => {
      const lock = await transaction.get(lockRef());
      const lockStatus = lock.exists() ? lock.data()?.activeStatus : "idle";
      if (lockStatus === "running" || lockStatus === "paused") {
        throw new Error(lockStatus === "paused"
          ? "יש תרגיל מושהה. המשך ממשיך אותו, או סיים תרגיל לפני הפעלה חדשה."
          : "כבר יש תרגיל רץ. צריך להשהות אותו או לסיים את התרגיל לפני הפעלה נוספת.");
      }
      const startedAt = serverTimestamp();
      transaction.set(runRef, {
        scenarioId,
        scenarioName: fields.name,
        seed: plan.seed,
        durationMinutes: plan.durationMinutes,
        status: "running",
        startedAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: author,
        updatedBy: author,
        totalResidents: plan.counts.total,
        bucketCount: plan.buckets.length,
        counts: {
          ok: plan.counts.ok,
          help: plan.counts.help,
          unsure: plan.counts.unsure,
        },
      });
      transaction.set(lockRef(), {
        activeRunId: runRef.id,
        activeStatus: "running",
        startedAt,
        pausedMs: 0,
        durationMinutes: plan.durationMinutes,
        updatedAt: serverTimestamp(),
        updatedBy: author,
      });
    });
  } catch (error) {
    await deleteRunBuckets(runRef.id).catch(() => {});
    throw error;
  }

  let announcementError = null;
  try {
    await writePublicAnnouncements([
      {
        id: `ann-drill-${runRef.id}`,
        text: fields.announcementText,
        timestamp: new Date().toISOString(),
        author: 'חמ"ל יישובי',
      },
    ], author);
  } catch (error) {
    announcementError = error?.message || String(error);
  }

  return {
    runId: runRef.id,
    counts: plan.counts,
    announcementError,
  };
}

export async function pauseDrillRun({ runId, updatedBy }) {
  if (!runId) throw new Error("אין תרגיל להשהיה");
  const runRef = doc(db, DRILL_RUNS, runId);
  const author = authorName(updatedBy);
  await runTransaction(db, async (transaction) => {
    const run = await transaction.get(runRef);
    const lock = await transaction.get(lockRef());
    if (!run.exists() || run.data()?.status !== "running") {
      throw new Error("אין תרגיל רץ להשהיה");
    }
    const data = run.data() || {};
    const pausedAt = serverTimestamp();
    const pausedMs = lock.exists() && lock.data()?.activeRunId === runId
      ? Math.max(0, Math.round(Number(lock.data()?.pausedMs) || 0))
      : Math.max(0, Math.round(Number(data.pausedMs) || 0));
    transaction.update(runRef, {
      status: "paused",
      pausedAt,
      pauseReason: "manual",
      updatedAt: serverTimestamp(),
      updatedBy: author,
    });
    transaction.set(lockRef(), {
      activeRunId: runId,
      activeStatus: "paused",
      startedAt: data.startedAt,
      pausedAt,
      pausedMs,
      durationMinutes: Math.max(1, Math.round(Number(data.durationMinutes) || 1)),
      updatedAt: serverTimestamp(),
      updatedBy: author,
    }, { merge: true });
  });
}

/**
 * Continue the same run. Adds the pause length to pausedMs and clears
 * pausedAt. startedAt stays put, so minutes that were already due are
 * still due and later minutes shift by the pause.
 */
export async function resumeDrillRun({ runId, updatedBy }) {
  if (!runId) throw new Error("אין תרגיל להמשך");
  await assertSafeToActivate();
  const runRef = doc(db, DRILL_RUNS, runId);
  const author = authorName(updatedBy);
  await runTransaction(db, async (transaction) => {
    const run = await transaction.get(runRef);
    const lock = await transaction.get(lockRef());
    if (!run.exists() || run.data()?.status !== "paused") {
      throw new Error("אין תרגיל מושהה להמשך");
    }
    const data = run.data() || {};
    if (data.pauseReason && data.pauseReason !== "manual") {
      throw new Error("התרגיל הושהה כי המערכת לא פנויה. אי אפשר להמשיך עכשיו.");
    }
    const pausedAtMs = timestampMs(data.pausedAt);
    const extra = Number.isFinite(pausedAtMs) ? Math.max(0, Date.now() - pausedAtMs) : 0;
    const already = lock.exists() && lock.data()?.activeRunId === runId
      ? Number(lock.data()?.pausedMs) || 0
      : Number(data.pausedMs) || 0;
    const pausedMs = Math.max(0, Math.round(already + extra));
    transaction.update(runRef, {
      status: "running",
      pausedAt: deleteField(),
      pauseReason: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: author,
    });
    const lockFields = {
      activeRunId: runId,
      activeStatus: "running",
      startedAt: data.startedAt,
      pausedMs,
      durationMinutes: Math.max(1, Math.round(Number(data.durationMinutes) || 1)),
      updatedAt: serverTimestamp(),
      updatedBy: author,
    };
    if (lock.exists()) {
      transaction.update(lockRef(), { ...lockFields, pausedAt: deleteField() });
    } else {
      transaction.set(lockRef(), lockFields);
    }
  });
}

