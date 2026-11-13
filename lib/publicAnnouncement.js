/**
 * Shared הודעה אחרונה לציבור.
 * One Firestore doc (systemSettings/publicAnnouncement) is the list, history
 * included. A later drill sandbox should publish into this same list.
 */
export const PUBLIC_ANNOUNCEMENT_DOC = {
  collection: "systemSettings",
  id: "publicAnnouncement",
};

const MAX_ANNOUNCEMENTS = 100;
const MAX_ID = 80;
const MAX_TEXT = 4000;
const MAX_TIMESTAMP = 40;
const MAX_AUTHOR = 120;
const MAX_UPDATED_BY = 200;

function boundedString(value, max) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Keep only entries the widget and security rules can store. */
export function normalizePublicAnnouncements(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = boundedString(item.id, MAX_ID);
    const text = boundedString(item.text, MAX_TEXT);
    const timestamp = boundedString(item.timestamp, MAX_TIMESTAMP);
    const author = boundedString(item.author, MAX_AUTHOR) || 'חמ"ל יישובי';
    if (!id || !text || !timestamp) continue;
    out.push({ id, text, timestamp, author });
    if (out.length >= MAX_ANNOUNCEMENTS) break;
  }
  return out;
}

/** Listener payload. Missing or malformed docs are an empty list. */
export function announcementListFromDoc(data) {
  if (!data || typeof data !== "object") return [];
  return normalizePublicAnnouncements(data.announcements);
}

export function buildPublicAnnouncementFields(list, updatedBy) {
  const announcements = normalizePublicAnnouncements(list);
  const updatedByName = boundedString(updatedBy, MAX_UPDATED_BY) || 'חמ"ל יישובי';
  return { announcements, updatedBy: updatedByName };
}

/**
 * Apply a widget write onto the server list.
 * An empty incoming list clears history (סיים תרגיל / סיים אירוע).
 * Any other write prepends the newest entry onto the server copy so two
 * stations cannot overwrite each other's messages with a stale tail.
 */
export function mergeAnnouncementWrite(incomingList, currentList) {
  const current = normalizePublicAnnouncements(currentList);
  if (Array.isArray(incomingList) && incomingList.length === 0) return [];
  const incoming = normalizePublicAnnouncements(incomingList);
  if (!incoming.length) return current;
  const newest = incoming[0];
  if (current.some((item) => item.id === newest.id)) return current;
  return normalizePublicAnnouncements([newest, ...current]);
}
