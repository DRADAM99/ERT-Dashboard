import { addDoc, collection, deleteField, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where, writeBatch } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/firebase";
import {
  PUBLIC_ANNOUNCEMENT_DOC,
  announcementListFromDoc,
  buildPublicAnnouncementFields,
  mergeAnnouncementWrite,
} from "@/lib/publicAnnouncement";

export { PUBLIC_ANNOUNCEMENT_DOC };

export const EMERGENCY_MODES = { LIVE: "live", DRILL: "drill" };
export const EMERGENCY_SETTINGS_DOC = { collection: "systemSettings", id: "emergencyMode" };
export const EMERGENCY_SOURCES_DOC = { collection: "systemSettings", id: "emergencySources" };

/**
 * SitRep widget keys that must reset when a drill/event ends so the next
 * session starts clean. Widget layout prefs intentionally survive; staff
 * (כח אדם), announcements, and commander notes do not.
 *
 * Used by end-drill (סיים תרגיל). Shared with end-live as well — clearing
 * session widgets is correct for both; Adam asked specifically for drill,
 * but one cleanup path avoids leftover widget text after either end.
 */
export const SITREP_SESSION_STORAGE_KEYS = {
  ANNOUNCEMENTS: "ert.sitrepAnnouncements.v1",
  COMMANDER_NOTES: "ert.sitrepCommanderNotes.v1",
  DEPT_HEADS: "ert.sitrepDeptHeads.v1",
};

export const SITREP_SESSION_CLEARED_EVENT = "ert:sitrep-session-cleared";

/** Empty כח אדם rows — keep מכלול labels, clear names/phones/counts. */
export const EMPTY_DEPT_HEADS = [
  { dept: 'חמ"ל', headName: "", phone: "", status: "", activeCount: 0 },
  { dept: "רפואה", headName: "", phone: "", status: "", activeCount: 0 },
  { dept: "אוכלוסיה", headName: "", phone: "", status: "", activeCount: 0 },
  { dept: "לוגיסטיקה", headName: "", phone: "", status: "", activeCount: 0 },
  { dept: "חוסן", headName: "", phone: "", status: "", activeCount: 0 },
  { dept: "אחר", headName: "", phone: "", status: "", activeCount: 0 },
];

const FIRESTORE_BATCH_LIMIT = 450;

/**
 * Clear public announcement, event-summary notes, and כח אדם from localStorage
 * and notify open SitRep dashboards to drop in-memory copies.
 * The shared announcement document is cleared separately so every signed-in
 * dashboard drops it through the listener, not only this browser.
 */
export function clearSitrepSessionLocalState() {
  if (typeof window === "undefined") return { cleared: false };
  try {
    window.localStorage.setItem(SITREP_SESSION_STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify([]));
    window.localStorage.setItem(SITREP_SESSION_STORAGE_KEYS.COMMANDER_NOTES, "");
    window.localStorage.setItem(SITREP_SESSION_STORAGE_KEYS.DEPT_HEADS, JSON.stringify(EMPTY_DEPT_HEADS));
    window.dispatchEvent(new CustomEvent(SITREP_SESSION_CLEARED_EVENT));
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}

function cachePublicAnnouncements(list) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SITREP_SESSION_STORAGE_KEYS.ANNOUNCEMENTS,
      JSON.stringify(announcementListFromDoc({ announcements: list }))
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Replace systemSettings/publicAnnouncement. Empty list clears history. */
export async function writePublicAnnouncements(list, updatedBy) {
  const ref = doc(db, PUBLIC_ANNOUNCEMENT_DOC.collection, PUBLIC_ANNOUNCEMENT_DOC.id);
  const written = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? announcementListFromDoc(snap.data()) : [];
    const merged = mergeAnnouncementWrite(list, current);
    const fields = buildPublicAnnouncementFields(merged, updatedBy);
    transaction.set(ref, {
      announcements: fields.announcements,
      updatedBy: fields.updatedBy,
      updatedAt: serverTimestamp(),
    });
    return fields.announcements;
  });
  cachePublicAnnouncements(written);
  return written;
}

/** Live dashboards call this so a remote edit replaces any local cache. */
export function subscribePublicAnnouncements(onChange, onError) {
  const ref = doc(db, PUBLIC_ANNOUNCEMENT_DOC.collection, PUBLIC_ANNOUNCEMENT_DOC.id);
  return onSnapshot(
    ref,
    (snap) => {
      const list = snap.exists() ? announcementListFromDoc(snap.data()) : [];
      cachePublicAnnouncements(list);
      onChange(list);
    },
    onError || (() => {})
  );
}

async function clearSharedPublicAnnouncements() {
  return writePublicAnnouncements([], "system");
}

/**
 * Reset every resident to "ללא סטטוס" (empty `סטטוס`) and wipe statusHistory.
 * UI maps empty → ללא סטטוס via displayResidentStatus / residentStatus.
 */
export async function resetAllResidentStatuses() {
  const snapshot = await getDocs(collection(db, "residents"));
  if (snapshot.empty) return 0;

  let updated = 0;
  let batch = writeBatch(db);
  let ops = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const residentDoc of snapshot.docs) {
    batch.update(residentDoc.ref, {
      סטטוס: "",
      statusHistory: [],
      statusUpdatedAt: serverTimestamp(),
    });
    ops += 1;
    updated += 1;
    if (ops >= FIRESTORE_BATCH_LIMIT) {
      await commitBatch();
    }
  }

  await commitBatch();
  return updated;
}

/**
 * A running or paused drill sandbox keeps its lock until the session ends.
 * Mark it finished before resident statuses are cleared so the scheduler
 * stops writing. Statuses already written are cleared by resetAllResidentStatuses.
 */
export async function finishActiveDrillRuns(updatedBy = "system") {
  const author = String(updatedBy || "").trim() || "system";
  const snap = await getDocs(query(collection(db, "drillRuns"), where("status", "in", ["running", "paused"])));
  const ids = [];
  for (const runDoc of snap.docs) {
    await runTransaction(db, async (transaction) => {
      const fresh = await transaction.get(runDoc.ref);
      if (!fresh.exists()) return;
      const status = fresh.data()?.status;
      if (status !== "running" && status !== "paused") return;
      transaction.update(runDoc.ref, {
        status: "finished",
        finishedAt: serverTimestamp(),
        finishReason: "session-ended",
        updatedAt: serverTimestamp(),
        updatedBy: author,
      });
    });
    ids.push(runDoc.id);
  }

  const lockRef = doc(db, "systemSettings", "drillSandbox");
  const lock = await getDoc(lockRef);
  const lockStatus = lock.exists() ? lock.data()?.activeStatus : "idle";
  const lockRunId = lock.exists() ? lock.data()?.activeRunId || "" : "";
  if (lock.exists() && (ids.includes(lockRunId) || lockStatus === "running" || lockStatus === "paused")) {
    await setDoc(lockRef, {
      activeRunId: "",
      activeStatus: "idle",
      startedAt: deleteField(),
      pausedAt: deleteField(),
      pausedMs: deleteField(),
      durationMinutes: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: author,
    }, { merge: true });
  }
  return ids.length;
}

/**
 * Client-side clean slate for the next drill/event session.
 * Clears SitRep localStorage widgets, the shared public announcement, and
 * resident statuses in Firestore, and marks an active drill-sandbox run finished.
 * Server-side endEmergencyEvent still deletes collections / clears the sheet.
 */
export async function prepareCleanSessionState() {
  const local = clearSitrepSessionLocalState();
  let finishedDrillRuns = 0;
  let finishError = null;
  try {
    finishedDrillRuns = await finishActiveDrillRuns("system");
  } catch (error) {
    finishError = error?.message || String(error);
  }
  let clearedPublicAnnouncement = false;
  let announcementError = null;
  try {
    await clearSharedPublicAnnouncements();
    clearedPublicAnnouncement = true;
  } catch (error) {
    announcementError = error?.message || String(error);
  }
  let resetResidents = 0;
  let resetError = null;
  try {
    resetResidents = await resetAllResidentStatuses();
  } catch (error) {
    resetError = error?.message || String(error);
  }
  return {
    clearedSitrepSession: Boolean(local.cleared),
    clearedPublicAnnouncement,
    announcementError,
    finishedDrillRuns,
    finishError,
    resetResidents,
    resetError,
  };
}

export function normalizeEmergencyMode(mode) {
  return mode === EMERGENCY_MODES.LIVE ? EMERGENCY_MODES.LIVE : EMERGENCY_MODES.DRILL;
}

function formatDateTimeForCSV(timestamp) {
  if (!timestamp) return "";
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toISOString();
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (timestamp instanceof Date) return timestamp.toISOString();
  return new Date(timestamp).toISOString();
}

export function makeEmergencyEventId() {
  return `emergency_${new Date().toISOString().split("T")[0]}_${Date.now()}`;
}

export function sanitizeEventFilename(rawTitle, fallback) {
  const cleaned = String(rawTitle || "")
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return cleaned || fallback;
}

export async function exportEmergencyDataToCSV(emergencyEventId, customTitle) {
  const csvData = [];
  csvData.push([
    "Timestamp",
    "Event Type",
    "Event ID",
    "User",
    "Action",
    "Details",
    "Status",
    "Department",
    "Priority",
    "Related IDs",
  ]);

  const eventLogsSnapshot = await getDocs(collection(db, "eventLogs"));
  eventLogsSnapshot.docs.forEach((entry) => {
    const data = entry.data();
    csvData.push([
      formatDateTimeForCSV(data.createdAt),
      "Event Log",
      entry.id,
      data.reporter || data.lastUpdater || "",
      "Event Created",
      data.description || "",
      data.status || "",
      data.department || "",
      "",
      "",
    ]);
    if (Array.isArray(data.history)) {
      data.history.forEach((historyEntry) => {
        csvData.push([
          formatDateTimeForCSV(historyEntry.timestamp),
          "Event Log",
          entry.id,
          historyEntry.userAlias || historyEntry.userId || "",
          "Update Added",
          historyEntry.text || "",
          data.status || "",
          data.department || "",
          "",
          "",
        ]);
      });
    }
  });

  const tasksSnapshot = await getDocs(collection(db, "tasks"));
  tasksSnapshot.docs.forEach((entry) => {
    const data = entry.data();
    csvData.push([
      formatDateTimeForCSV(data.createdAt),
      "Task",
      entry.id,
      data.creatorAlias || data.creatorEmail || "",
      "Task Created",
      data.title || "",
      data.status || "",
      data.category || data.department || "",
      data.priority || "",
      data.residentId || "",
    ]);
    if (Array.isArray(data.replies)) {
      data.replies.forEach((reply) => {
        csvData.push([
          formatDateTimeForCSV(reply.timestamp),
          "Task Reply",
          entry.id,
          reply.userAlias || reply.userId || "",
          "Reply Added",
          reply.text || "",
          data.status || "",
          data.category || data.department || "",
          "",
          data.residentId || "",
        ]);
      });
    }
  });

  const residentsSnapshot = await getDocs(collection(db, "residents"));
  residentsSnapshot.docs.forEach((entry) => {
    const data = entry.data();
    csvData.push([
      formatDateTimeForCSV(data.createdAt || data.syncedAt),
      "Resident",
      entry.id,
      data.syncedBy || data.createdBy || "",
      "Resident Added",
      `${data["שם פרטי"] || ""} ${data["שם משפחה"] || ""}`.trim(),
      data.סטטוס || data.status || "",
      "",
      "",
      "",
    ]);
    if (Array.isArray(data.statusHistory)) {
      data.statusHistory.forEach((change) => {
        csvData.push([
          formatDateTimeForCSV(change.timestamp),
          "Resident Status",
          entry.id,
          change.userAlias || change.userId || "",
          "Status Changed",
          `${change.from} → ${change.to}`,
          change.to || "",
          "",
          "",
          "",
        ]);
      });
    }
  });

  csvData.sort((a, b) => {
    if (a[0] === "Timestamp") return -1;
    if (b[0] === "Timestamp") return 1;
    return new Date(a[0]) - new Date(b[0]);
  });

  const csvContent = "\uFEFF" + csvData
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const fallbackName = `emergency_event_${emergencyEventId || "log"}_${new Date().toISOString().split("T")[0]}`;
  let storedTitle = "";
  if (typeof window !== "undefined") {
    try {
      storedTitle = window.localStorage.getItem("ert.eventLogTitle") || "";
    } catch {
      storedTitle = "";
    }
  }
  const filenameBase = sanitizeEventFilename(customTitle || storedTitle, fallbackName);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filenameBase}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

export async function updateEmergencyMode({ nextMode, isAdmin, alias, email }) {
  if (!isAdmin) return;
  const normalizedMode = normalizeEmergencyMode(nextMode);
  await setDoc(
    doc(db, EMERGENCY_SETTINGS_DOC.collection, EMERGENCY_SETTINGS_DOC.id),
    {
      mode: normalizedMode,
      updatedBy: alias || email || "System",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return normalizedMode;
}

export async function activateGreenEyes({
  alias,
  email,
  emergencyMode,
  emergencySources,
  emergencyEventId,
}) {
  const mode = normalizeEmergencyMode(emergencyMode);
  const isDrill = mode !== EMERGENCY_MODES.LIVE;
  const sourceForMode = emergencySources?.[mode];
  const sourceOverride = sourceForMode?.sheetId
    ? { sheetId: sourceForMode.sheetId, sheetName: sourceForMode.sheetName || "גיליון1" }
    : {};

  await addDoc(collection(db, "eventLogs"), {
    reporter: alias || email || "System",
    recipient: 'חמ"ל',
    description: isDrill ? "הפעלת תרגיל ירוק בעיניים" : "הפעלת נוהל ירוק בעיניים - אירוע חירום",
    department: 'חמ"ל',
    status: "מחכה",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastUpdater: alias || email || "System",
    history: [
      {
        timestamp: new Date().toISOString(),
        text: isDrill ? "תרגיל ירוק בעיניים הופעל" : "נוהל ירוק בעיניים הופעל",
        userAlias: alias || email || "System",
      },
    ],
    emergencyType: "green_eyes",
    emergencyMode: mode,
    emergencyEventId,
  });

  const eventId = `ge_${mode}_${Date.now()}`;
  await setDoc(doc(db, "emergencyEvents", eventId), {
    type: "green_eyes",
    mode,
    ...sourceOverride,
    triggeredBy: alias || email || "System",
    triggeredAt: serverTimestamp(),
    status: "pending",
    emergencyEventId,
  });

  return { isDrill, eventId };
}

export async function endEmergencyEvent({ emergencyEventId }) {
  // Export first so CSV still reflects pre-reset drill/event data.
  await exportEmergencyDataToCSV(emergencyEventId);
  // Clear SitRep local widgets + reset Firestore statuses before server wipe.
  const sessionCleanup = await prepareCleanSessionState();
  const endEmergency = httpsCallable(getFunctions(), "endEmergencyEvent");
  const result = await endEmergency({ clearSheet: true });
  return { ...(result.data || {}), ...sessionCleanup };
}
