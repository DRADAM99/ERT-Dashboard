import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "@/firebase";

export const EMERGENCY_MODES = { LIVE: "live", DRILL: "drill" };
export const EMERGENCY_SETTINGS_DOC = { collection: "systemSettings", id: "emergencyMode" };
export const EMERGENCY_SOURCES_DOC = { collection: "systemSettings", id: "emergencySources" };

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

export async function exportEmergencyDataToCSV(emergencyEventId) {
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

  const csvContent = csvData
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `emergency_event_${emergencyEventId}_${new Date().toISOString().split("T")[0]}.csv`);
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
  await exportEmergencyDataToCSV(emergencyEventId);
  const endEmergency = httpsCallable(getFunctions(), "endEmergencyEvent");
  const result = await endEmergency({ clearSheet: true });
  return result.data || {};
}
