/**
 * Pure minute-plan for the green-eyes drill sandbox.
 * The client builds this once on activate. The scheduled function only
 * applies the stored buckets — it does not reshuffle.
 *
 * Stored resident status for the default cohort is "כולם בסדר"
 * (shown as הכל בסדר by displayResidentStatus). Until a resident's
 * minute they stay empty / ללא סטטוס.
 */

export const DRILL_STATUS_OK = "כולם בסדר";
export const DRILL_STATUS_HELP = "זקוקים לסיוע";
export const DRILL_STATUS_UNSURE = "לא בטוח";
export const DRILL_EXCEPTION_STATUSES = [DRILL_STATUS_HELP, DRILL_STATUS_UNSURE];
export const DRILL_SOURCE = "drill-sandbox";
export const MAX_IDS_PER_DOC = 850;
export const MAX_DURATION_MINUTES = 180;
export const MAX_EXCEPTION_SETS = 20;
export const CURVE_PRESETS = ["even", "front-loaded", "back-loaded", "custom"];

const STATUS_KEYS = [DRILL_STATUS_OK, DRILL_STATUS_HELP, DRILL_STATUS_UNSURE];

export function clampDuration(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_DURATION_MINUTES, Math.max(1, n));
}

export function curveSum(curve) {
  return (Array.isArray(curve) ? curve : []).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

/** Largest-remainder split so integer parts sum to `total`. */
export function allocateIntegers(weights, total) {
  const safe = (weights || []).map((weight) => Math.max(0, Number(weight) || 0));
  if (!safe.length) return [];
  const target = Math.max(0, Math.round(Number(total) || 0));
  if (target === 0) return safe.map(() => 0);
  const weightSum = safe.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return allocateIntegers(safe.map(() => 1), target);

  const raw = safe.map((weight) => (weight / weightSum) * target);
  const floors = raw.map((value) => Math.floor(value));
  let remainder = target - floors.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = floors.slice();
  for (let i = 0; i < remainder; i += 1) out[order[i].index] += 1;
  return out;
}

export function curveFromPreset(preset, durationMinutes) {
  const minutes = clampDuration(durationMinutes);
  if (preset === "front-loaded") {
    return allocateIntegers(Array.from({ length: minutes }, (_, index) => minutes - index), 100);
  }
  if (preset === "back-loaded") {
    return allocateIntegers(Array.from({ length: minutes }, (_, index) => index + 1), 100);
  }
  return allocateIntegers(Array.from({ length: minutes }, () => 1), 100);
}

export function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

export function mulberry32(seed) {
  let state = Number(seed) >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(ids, seed) {
  const copy = (ids || []).slice();
  const rand = mulberry32(seed || 1);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy;
}

export function emptyScenario() {
  const durationMinutes = 10;
  return {
    name: "",
    announcementText: "",
    durationMinutes,
    curvePreset: "even",
    curve: curveFromPreset("even", durationMinutes),
    seed: randomSeed(),
    exceptions: [],
  };
}

function padCurve(curve, minutes) {
  const next = (Array.isArray(curve) ? curve : []).slice(0, minutes).map((value) => {
    const rounded = Math.round(Number(value) || 0);
    if (!Number.isFinite(rounded)) return 0;
    return Math.min(100, Math.max(0, rounded));
  });
  while (next.length < minutes) next.push(0);
  return next;
}

export function withDuration(scenario, durationMinutes) {
  const minutes = clampDuration(durationMinutes);
  const preset = scenario?.curvePreset === "custom" ? "custom" : scenario?.curvePreset;
  const curve = preset === "custom"
    ? padCurve(scenario?.curve, minutes)
    : curveFromPreset(preset || "even", minutes);
  return {
    ...scenario,
    durationMinutes: minutes,
    curve,
    exceptions: (scenario?.exceptions || []).map((set) => ({
      ...set,
      minute: Math.min(minutes, Math.max(1, Math.round(Number(set.minute) || 1))),
    })),
  };
}

export function withPreset(scenario, preset) {
  const nextPreset = CURVE_PRESETS.includes(preset) && preset !== "custom" ? preset : "even";
  return {
    ...scenario,
    curvePreset: nextPreset,
    curve: curveFromPreset(nextPreset, scenario?.durationMinutes || 1),
  };
}

export function withCurveValue(scenario, index, value) {
  const curve = padCurve(scenario?.curve, clampDuration(scenario?.durationMinutes));
  const rounded = Math.round(Number(value));
  curve[index] = Number.isFinite(rounded) ? Math.min(100, Math.max(0, rounded)) : 0;
  return { ...scenario, curve, curvePreset: "custom" };
}

function uniqueIds(ids) {
  const out = [];
  const seen = new Set();
  for (const id of ids || []) {
    const cleaned = String(id || "").trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

export function addExceptionSet(scenario, { status, residentIds }) {
  if (!DRILL_EXCEPTION_STATUSES.includes(status)) {
    return { scenario, error: "סטטוס חריגה לא מוכר" };
  }
  const ids = uniqueIds(residentIds);
  if (!ids.length) return { scenario, error: "אין תושבים במסנן" };
  const drop = new Set(ids);
  const exceptions = (scenario?.exceptions || [])
    .map((set) => ({ ...set, residentIds: (set.residentIds || []).filter((id) => !drop.has(id)) }))
    .filter((set) => set.residentIds.length);
  if (exceptions.length >= MAX_EXCEPTION_SETS) {
    return { scenario, error: `אפשר עד ${MAX_EXCEPTION_SETS} קבוצות חריגות` };
  }
  exceptions.push({
    id: `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    status,
    timing: "single",
    minute: 1,
    residentIds: ids,
  });
  return { scenario: { ...scenario, exceptions }, error: null };
}

export function updateException(scenario, id, patch) {
  const minutes = clampDuration(scenario?.durationMinutes);
  return {
    ...scenario,
    exceptions: (scenario?.exceptions || []).map((set) => {
      if (set.id !== id) return set;
      const next = { ...set, ...patch };
      if (next.timing !== "spread") next.timing = "single";
      next.minute = Math.min(minutes, Math.max(1, Math.round(Number(next.minute) || 1)));
      if (!DRILL_EXCEPTION_STATUSES.includes(next.status)) next.status = set.status;
      return next;
    }),
  };
}

export function removeException(scenario, id) {
  return {
    ...scenario,
    exceptions: (scenario?.exceptions || []).filter((set) => set.id !== id),
  };
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function assignExceptions(ids, exceptions, durationMinutes) {
  const known = new Set(ids);
  const assignment = new Map();
  for (const set of exceptions || []) {
    if (!DRILL_EXCEPTION_STATUSES.includes(set?.status)) continue;
    const timing = set.timing === "spread" ? "spread" : "single";
    let minute = Math.round(Number(set.minute) || 1);
    minute = Math.min(durationMinutes, Math.max(1, minute));
    for (const id of uniqueIds(set.residentIds)) {
      if (!known.has(id)) continue;
      assignment.set(id, {
        status: set.status,
        timing,
        minuteIndex: minute - 1,
        setId: String(set.id || set.status),
      });
    }
  }
  return assignment;
}

function countsFromAssignment(ids, assignment) {
  let help = 0;
  let unsure = 0;
  for (const item of assignment.values()) {
    if (item.status === DRILL_STATUS_HELP) help += 1;
    else if (item.status === DRILL_STATUS_UNSURE) unsure += 1;
  }
  return {
    total: ids.length,
    ok: ids.length - assignment.size,
    help,
    unsure,
  };
}

function chunkIds(ids) {
  const chunks = [];
  for (let index = 0; index < ids.length; index += MAX_IDS_PER_DOC) {
    chunks.push(ids.slice(index, index + MAX_IDS_PER_DOC));
  }
  return chunks;
}

/**
 * @returns {{
 *   ok: boolean,
 *   error: string | null,
 *   counts: { total: number, ok: number, help: number, unsure: number },
 *   perMinute: { minute: number, ok: number, help: number, unsure: number }[],
 *   buckets: { minuteIndex: number, status: string, residentIds: string[] }[],
 *   durationMinutes: number,
 *   seed: number,
 * }}
 */
export function buildDrillPlan({ residentIds, scenario }) {
  const ids = uniqueIds(residentIds);
  const durationMinutes = clampDuration(scenario?.durationMinutes);
  const seed = Math.round(Number(scenario?.seed) || 0) || 1;
  const assignment = assignExceptions(ids, scenario?.exceptions, durationMinutes);
  const counts = countsFromAssignment(ids, assignment);
  const curve = Array.isArray(scenario?.curve)
    ? scenario.curve.map((value) => Math.round(Number(value) || 0))
    : [];

  const fail = (error) => ({
    ok: false,
    error,
    counts,
    perMinute: [],
    buckets: [],
    durationMinutes,
    seed,
  });

  if (curve.length !== durationMinutes) return fail("אורך העקומה לא תואם את משך התרגיל");
  if (curve.some((value) => value < 0 || value > 100)) return fail("כל אחוז צריך להיות בין 0 ל-100");
  if (curveSum(curve) !== 100) return fail("האחוזים צריכים להסתכם ל-100");

  const byMinute = Array.from({ length: durationMinutes }, () => ({
    [DRILL_STATUS_OK]: [],
    [DRILL_STATUS_HELP]: [],
    [DRILL_STATUS_UNSURE]: [],
  }));

  const defaultIds = seededShuffle(ids.filter((id) => !assignment.has(id)), seed);
  const defaultCounts = allocateIntegers(curve, defaultIds.length);
  let cursor = 0;
  defaultCounts.forEach((count, minuteIndex) => {
    byMinute[minuteIndex][DRILL_STATUS_OK] = defaultIds.slice(cursor, cursor + count);
    cursor += count;
  });

  const spreadGroups = new Map();
  for (const [id, item] of assignment) {
    if (item.timing === "spread") {
      if (!spreadGroups.has(item.setId)) spreadGroups.set(item.setId, { status: item.status, ids: [] });
      spreadGroups.get(item.setId).ids.push(id);
    } else {
      byMinute[item.minuteIndex][item.status].push(id);
    }
  }
  for (const [setId, group] of spreadGroups) {
    const spreadSeed = ((seed + hashString(setId)) >>> 0) || 1;
    seededShuffle(group.ids, spreadSeed).forEach((id, index) => {
      byMinute[index % durationMinutes][group.status].push(id);
    });
  }

  const buckets = [];
  const perMinute = byMinute.map((groups, minuteIndex) => {
    STATUS_KEYS.forEach((status) => {
      chunkIds(groups[status]).forEach((residentChunk) => {
        buckets.push({ minuteIndex, status, residentIds: residentChunk });
      });
    });
    return {
      minute: minuteIndex + 1,
      ok: groups[DRILL_STATUS_OK].length,
      help: groups[DRILL_STATUS_HELP].length,
      unsure: groups[DRILL_STATUS_UNSURE].length,
    };
  });

  return { ok: true, error: null, counts, perMinute, buckets, durationMinutes, seed };
}

export function scenarioToFields(scenario) {
  const durationMinutes = clampDuration(scenario?.durationMinutes);
  const preset = CURVE_PRESETS.includes(scenario?.curvePreset) ? scenario.curvePreset : "custom";
  const curve = padCurve(scenario?.curve, durationMinutes);
  const exceptions = [];
  for (const raw of scenario?.exceptions || []) {
    if (exceptions.length >= MAX_EXCEPTION_SETS) break;
    if (!DRILL_EXCEPTION_STATUSES.includes(raw?.status)) continue;
    const residentIds = uniqueIds(raw.residentIds).slice(0, 20000);
    if (!residentIds.length) continue;
    exceptions.push({
      id: String(raw.id || `ex-${exceptions.length + 1}`).slice(0, 80),
      status: raw.status,
      timing: raw.timing === "spread" ? "spread" : "single",
      minute: Math.min(durationMinutes, Math.max(1, Math.round(Number(raw.minute) || 1))),
      residentIds,
    });
  }
  const seed = Math.round(Number(scenario?.seed) || 0);
  return {
    name: String(scenario?.name || "").trim().slice(0, 200),
    announcementText: String(scenario?.announcementText || "").trim().slice(0, 4000),
    durationMinutes,
    curve,
    curvePreset: preset,
    seed: seed > 0 ? seed : 1,
    exceptions,
  };
}

export function scenarioFromDoc(id, data) {
  const fields = scenarioToFields({
    name: data?.name,
    announcementText: data?.announcementText,
    durationMinutes: data?.durationMinutes,
    curvePreset: data?.curvePreset,
    curve: data?.curve,
    seed: data?.seed,
    exceptions: data?.exceptions,
  });
  if (!Array.isArray(data?.curve) || data.curve.length !== fields.durationMinutes) {
    const preset = fields.curvePreset === "custom" ? "even" : fields.curvePreset;
    fields.curve = curveFromPreset(preset, fields.durationMinutes);
    fields.curvePreset = preset;
  }
  return { id, ...fields };
}
