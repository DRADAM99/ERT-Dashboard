export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  if (typeof value?.seconds === "number") {
    const converted = new Date(value.seconds * 1000);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return (
    date.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) +
    " " +
    date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
}

export function formatTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function relativeTime(value) {
  const date = toDate(value);
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `היום ${date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.round(hours / 24);
  if (days === 1) return "אתמול";
  if (days < 7) return `לפני ${days} ימים`;
  return date.toLocaleDateString("he-IL");
}

export function formatElapsed(start) {
  const startDate = start instanceof Date ? start : toDate(start);
  if (!startDate) return "00:00:00";
  const diff = Date.now() - startDate.getTime();
  if (diff < 0) return "00:00:00";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000).toString().padStart(2, "0");
  const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, "0");
  const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, "0");
  return days > 0 ? `${days}d ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
}

export function formatDuration(ms) {
  if (typeof ms !== "number" || ms < 0 || Number.isNaN(ms)) return "—";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} ${days === 1 ? "יום" : "ימים"}`;
  if (hours > 0) return `${hours} ${hours === 1 ? "שעה" : "שעות"}`;
  if (minutes > 0) return `${minutes} ${minutes === 1 ? "דקה" : "דקות"}`;
  return "< דקה";
}

const RESIDENT_STATUS_DOT = {
  "כולם בסדר": "v2-st-ok",
  "הכל בסדר": "v2-st-ok",
  "זקוקים לסיוע": "v2-st-help",
  "לא בטוח": "v2-st-unsure",
  פצוע: "v2-st-hurt",
  "ללא סטטוס": "v2-st-empty",
};

const EVENT_STATUS_DOT = {
  מחכה: "v2-st-help",
  בטיפול: "v2-st-unsure",
  טופל: "v2-st-ok",
};

export function residentStatusDotClass(status) {
  const key = !status || !String(status).trim() ? "ללא סטטוס" : status;
  return RESIDENT_STATUS_DOT[key] || "v2-st-empty";
}

export function eventStatusDotClass(status) {
  return EVENT_STATUS_DOT[status] || "v2-st-empty";
}

export function departmentChipClass(dept) {
  if (dept === "לוגיסטיקה") return "v2-br-m";
  if (dept === "אוכלוסיה") return "v2-br-e";
  if (dept === "רפואה") return "v2-st-help";
  if (dept === "חוסן") return "v2-br-r";
  if (dept === 'חמ"ל' || dept === "חמ\"ל") return "v2-br-e";
  return "v2-br-x";
}
