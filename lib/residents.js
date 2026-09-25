export const RESIDENT_STATUSES = ["זקוקים לסיוע", "לא בטוח", "פצוע", "כולם בסדר", "ללא סטטוס"];
export const BOARD_STATUSES = ["זקוקים לסיוע", "לא בטוח", "פצוע", "כולם בסדר", "ללא סטטוס"];
export const NEED_HELP_STATUSES = ["זקוקים לסיוע", "לא בטוח", "פצוע"];
export const EDITABLE_STATUSES = ["כולם בסדר", "זקוקים לסיוע", "לא בטוח", "פצוע"];
export const DEFAULT_TASK_CATEGORIES = ["לוגיסטיקה", "אוכלוסיה", "רפואה", "חוסן", 'חמ"ל', "אחר"];
export const RESIDENTS_DEPT = "אוכלוסיה";

export function getFieldValue(row, fieldName) {
  if (!row) return "";
  const fieldMap = {
    "שם משפחה": row["*שם משפחה"] || row["שם משפחה"] || "",
    "שם פרטי": row["*שם פרטי"] || row["שם פרטי"] || "",
    טלפון: row["*טלפון נייד"] || row["טלפון נייד"] || row["טלפון"] || "",
    שכונה: row["שכונה"] || "",
    סטטוס: row["סטטוס"] || "",
    "מספר בית": row["מספר בית"] || row["בית"] || "",
    "הורה/ילד": row["הורה/ילד"] || "",
    מסגרת: row["מסגרת"] || "",
    "מקום מסגרת": row["מקום מסגרת"] || "",
    "תאריך לידה": row["*תאריך לידה"] || row["תאריך לידה"] || "",
    "סטטוס מגורים": row["סטטוס מגורים"] || "",
    הערות: row["הערות"] || "",
  };
  return fieldMap[fieldName] ?? row[fieldName] ?? "";
}

export function residentName(row) {
  const first = getFieldValue(row, "שם פרטי");
  const last = getFieldValue(row, "שם משפחה");
  return `${first} ${last}`.trim() || "ללא שם";
}

export function residentStatus(row) {
  const status = String(getFieldValue(row, "סטטוס") || "").trim();
  return status || "ללא סטטוס";
}

export function displayResidentStatus(status) {
  if (!status || !String(status).trim() || status === "ללא סטטוס") return "ללא סטטוס";
  if (status === "כולם בסדר") return "הכל בסדר";
  return status;
}

export function phoneHref(phoneValue) {
  if (!phoneValue) return null;
  const onlyDigits = String(phoneValue).replace(/\D/g, "");
  if (!onlyDigits) return null;
  if (onlyDigits.startsWith("972")) return `tel:+${onlyDigits}`;
  if (onlyDigits.startsWith("0")) return `tel:+972${onlyDigits.slice(1)}`;
  return `tel:+${onlyDigits}`;
}

export function formatResidentValue(value, fieldName = "") {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return fieldName === "תאריך לידה" ? value.toLocaleDateString("he-IL") : value.toLocaleString("he-IL");
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return formatResidentValue(value.toDate(), fieldName);
    if (typeof value.seconds === "number") return formatResidentValue(new Date(value.seconds * 1000), fieldName);
    return "";
  }
  if (fieldName === "תאריך לידה") {
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parsed = new Date(str);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("he-IL");
    }
    return str;
  }
  return String(value);
}

export function residentTaskSummary(tasks = [], residentId, currentUserId) {
  const linked = (tasks || []).filter((task) => task.residentId === residentId);
  if (!linked.length) return null;
  return {
    pending: linked.filter((task) => !task.done && (task.status === "מחכה" || !task.status)).length,
    inProgress: linked.filter((task) => !task.done && task.status === "בטיפול").length,
    completed: linked.filter((task) => task.done || task.status === "טופל").length,
    hasUnreadReplies: linked.some((task) =>
      (task.replies || []).some((reply) => !reply.isRead && reply.userId !== currentUserId)
    ),
    total: linked.length,
  };
}
