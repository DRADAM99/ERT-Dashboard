/**
 * Elapsed time for a drill run.
 * The clock and the minute schedule both use this, so a pause freezes
 * them together and resume continues from the same point.
 *
 * pausedMs is the sum of completed pauses. While status is "paused",
 * pausedAt is included as well and the result does not advance.
 */

export function timestampMs(value) {
  if (value == null || value === "") return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? NaN : value.getTime();
  if (typeof value.toMillis === "function") {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : NaN;
  }
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : NaN;
  }
  if (typeof value.seconds === "number") {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime();
}

export function drillElapsedMs(run, nowMs) {
  const started = timestampMs(run?.startedAt);
  if (!Number.isFinite(started) || !Number.isFinite(nowMs)) return 0;
  const pausedMs = Math.max(0, Math.round(Number(run?.pausedMs) || 0));
  const status = run?.status || run?.activeStatus;
  let end = nowMs;
  if (status === "paused") {
    const pausedAt = timestampMs(run?.pausedAt);
    if (Number.isFinite(pausedAt)) end = pausedAt;
  }
  return Math.max(0, end - started - pausedMs);
}

export function drillMinuteIndex(run, nowMs) {
  const duration = Math.max(1, Math.round(Number(run?.durationMinutes) || 1));
  const index = Math.floor(drillElapsedMs(run, nowMs) / 60000);
  return Math.min(duration - 1, Math.max(0, index));
}

export function formatClock(ms) {
  const safe = Math.max(0, Math.floor(Number(ms) || 0));
  const days = Math.floor(safe / 86400000);
  const hours = Math.floor((safe % 86400000) / 3600000).toString().padStart(2, "0");
  const minutes = Math.floor((safe % 3600000) / 60000).toString().padStart(2, "0");
  const seconds = Math.floor((safe % 60000) / 1000).toString().padStart(2, "0");
  return days > 0 ? `${days}d ${hours}:${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
}

const STATUS_OK = "כולם בסדר";
const STATUS_HELP = "זקוקים לסיוע";
const STATUS_UNSURE = "לא בטוח";

function emptyMinute(minuteIndex) {
  return { minuteIndex, ok: 0, help: 0, unsure: 0, total: 0, applied: 0 };
}

/**
 * One row per drill minute. `applied` is how many bucket docs for that
 * minute the scheduler has already written.
 */
export function drillTimeline(buckets, run, nowMs) {
  const duration = Math.max(1, Math.round(Number(run?.durationMinutes) || 1));
  const minuteIndex = drillMinuteIndex(run, nowMs);
  const byMinute = new Map();
  (buckets || []).forEach((bucket) => {
    const index = Number(bucket?.minuteIndex);
    if (!Number.isInteger(index) || index < 0 || index >= duration) return;
    const row = byMinute.get(index) || emptyMinute(index);
    const count = Array.isArray(bucket.residentIds) ? bucket.residentIds.length : Math.max(0, Number(bucket.count) || 0);
    row.total += 1;
    if (bucket.applied) row.applied += 1;
    if (bucket.status === STATUS_OK) row.ok += count;
    else if (bucket.status === STATUS_HELP) row.help += count;
    else if (bucket.status === STATUS_UNSURE) row.unsure += count;
    byMinute.set(index, row);
  });

  const rows = [];
  for (let index = 0; index < duration; index += 1) {
    const row = byMinute.get(index) || emptyMinute(index);
    const current = index === minuteIndex;
    const written = row.total > 0 && row.applied >= row.total;
    const partial = row.applied > 0 && !written;
    let label = "בהמשך";
    if (written || (row.total === 0 && index < minuteIndex)) label = current ? "עכשיו · נכתב" : "נכתב";
    else if (partial) label = current ? "עכשיו · נכתב חלקית" : "נכתב חלקית";
    else if (index <= minuteIndex) label = current ? "עכשיו · ממתין לכתיבה" : "ממתין לכתיבה";
    rows.push({
      minute: index + 1,
      minuteIndex: index,
      ok: row.ok,
      help: row.help,
      unsure: row.unsure,
      appliedBuckets: row.applied,
      totalBuckets: row.total,
      current,
      label,
    });
  }
  return { minuteIndex, minuteLabel: minuteIndex + 1, duration, rows };
}
