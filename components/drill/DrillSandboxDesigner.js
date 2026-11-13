"use client";

import { useMemo, useState } from "react";
import { displayResidentStatus, getFieldValue, residentName } from "@/lib/residents";
import {
  DRILL_STATUS_HELP,
  DRILL_STATUS_UNSURE,
  MAX_DURATION_MINUTES,
  addExceptionSet,
  buildDrillPlan,
  curveSum,
  removeException,
  updateException,
  withCurveValue,
  withDuration,
  withPreset,
} from "@/lib/drillPlan";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PRESETS = [
  { id: "even", label: "אחיד" },
  { id: "front-loaded", label: "מוקדם" },
  { id: "back-loaded", label: "מאוחר" },
];

const PAUSE_REASON = {
  manual: "ההשהיה ידנית. דקות שעדיין לא נכתבו לא ייכתבו.",
  "emergency-live": "הושהה כי המערכת במצב חי. סטטוסים שכבר נכתבו נשארים.",
  "green-eyes-in-progress": "הושהה כי שליחת ירוק בעיניים אמיתית עדיין רצה.",
};

function elapsedMinute(startedAt, nowMs) {
  const startedMs = startedAt?.toMillis?.()
    || startedAt?.toDate?.()?.getTime?.()
    || (typeof startedAt === "number" ? startedAt : NaN);
  if (!Number.isFinite(startedMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startedMs) / 60000));
}

export default function DrillSandboxDesigner({
  residents = [],
  scenarios = [],
  draft,
  selectedId,
  activeRun,
  busy = false,
  listenError = "",
  notice = "",
  nowMs = Date.now(),
  onChangeDraft,
  onSelectScenario,
  onNewScenario,
  onSave,
  onDelete,
  onActivate,
  onPause,
}) {
  const [search, setSearch] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState("");

  const residentIds = useMemo(() => residents.map((row) => row.id).filter(Boolean), [residents]);
  const plan = useMemo(
    () => buildDrillPlan({ residentIds, scenario: draft }),
    [residentIds, draft]
  );
  const exceptionById = useMemo(() => {
    const map = new Map();
    (draft?.exceptions || []).forEach((set) => {
      (set.residentIds || []).forEach((id) => map.set(id, set.status));
    });
    return map;
  }, [draft]);

  const neighborhoods = useMemo(() => {
    const names = new Set();
    residents.forEach((row) => {
      const value = String(getFieldValue(row, "שכונה") || "").trim();
      if (value) names.add(value);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "he"));
  }, [residents]);

  const filtered = useMemo(() => {
    const queryText = search.trim();
    return residents.filter((row) => {
      const area = String(getFieldValue(row, "שכונה") || "").trim();
      if (neighborhood && area !== neighborhood) return false;
      if (!queryText) return true;
      const haystack = [
        residentName(row),
        area,
        getFieldValue(row, "טלפון"),
        getFieldValue(row, "מספר בית"),
      ].join(" ");
      return haystack.includes(queryText);
    });
  }, [residents, search, neighborhood]);

  const percentSum = curveSum(draft?.curve);
  const activeBlocked = activeRun?.status === "running";
  const canActivate = Boolean(
    !busy
    && !activeBlocked
    && plan.ok
    && draft?.name?.trim()
    && draft?.announcementText?.trim()
    && plan.counts.total > 0
  );

  const markFiltered = (status) => {
    const result = addExceptionSet(draft, { status, residentIds: filtered.map((row) => row.id) });
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setFormError("");
    onChangeDraft(result.scenario);
  };

  const shown = filtered.slice(0, 80);
  const minuteLabel = activeRun
    ? Math.min(elapsedMinute(activeRun.startedAt, nowMs) + 1, activeRun.durationMinutes || 1)
    : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="v2-h1">ארגז חול לתרגיל</h1>
        <p className="v2-sub">
          מתכננים תרגיל ירוק בעיניים ומפעילים אותו. אחר כך הצוותים עובדים בתמונת מצב, בתושבים ובמשימות כרגיל.
          השעון רץ בענן גם אם סוגרים את המחשב. לא נשלחת הודעת וואטסאפ.
        </p>
      </div>

      {listenError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{listenError}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{notice}</div>
      )}
      {formError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div>
      )}

      {activeRun && (
        <div className="v2-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {activeRun.status === "paused" ? "תרגיל מושהה" : "תרגיל פעיל"}: {activeRun.scenarioName || "ללא שם"}
              </div>
              <p className="mt-1 text-sm text-[var(--v2-muted)]">
                דקה {minuteLabel} מתוך {activeRun.durationMinutes || 1}. סגירת הדפדפן לא עוצרת את השעון.
                סטטוסים שכבר נכתבו נשארים עד סיים תרגיל.
              </p>
              {activeRun.status === "paused" && (
                <p className="mt-1 text-sm text-amber-800">
                  {PAUSE_REASON[activeRun.pauseReason] || "התרגיל מושהה. דקות שעדיין לא נכתבו לא ייכתבו."}
                </p>
              )}
            </div>
            {activeRun.status === "running" && (
              <button type="button" className="v2-btn" disabled={busy} onClick={() => onPause(activeRun.id)}>
                השהה
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="v2-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">טיוטות</div>
            <button type="button" className="v2-btn v2-btn-sm" onClick={onNewScenario}>חדש</button>
          </div>
          <div className="space-y-1">
            {scenarios.length === 0 && (
              <div className="px-2 py-3 text-xs text-[var(--v2-muted)]">אין תרחישים שמורים</div>
            )}
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                type="button"
                onClick={() => onSelectScenario(scenario.id)}
                className={`block w-full rounded-lg px-2 py-2 text-right text-sm hover:bg-[var(--v2-bg)] ${selectedId === scenario.id ? "bg-[var(--v2-accent-soft)] font-semibold" : ""}`}
              >
                <div className="truncate">{scenario.name || "ללא שם"}</div>
                <div className="text-[11px] text-[var(--v2-muted)]">{scenario.durationMinutes || "?"} דקות</div>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-4">
          <section className="v2-card p-4">
            <label className="v2-label" htmlFor="drill-name">שם התרחיש</label>
            <input
              id="drill-name"
              className="v2-search w-full max-w-xl"
              value={draft?.name || ""}
              onChange={(event) => onChangeDraft({ ...draft, name: event.target.value })}
              placeholder="תרגיל ירוק בעיניים — בוקר"
            />
            <label className="v2-label mt-3" htmlFor="drill-announcement">הודעה לציבור (מזויפת)</label>
            <textarea
              id="drill-announcement"
              className="v2-textarea"
              rows={4}
              value={draft?.announcementText || ""}
              onChange={(event) => onChangeDraft({ ...draft, announcementText: event.target.value })}
              placeholder="הטקסט שייכנס להודעה אחרונה לציבור אצל כל הדשבורדים הפתוחים"
            />
            <p className="mt-1 text-xs text-[var(--v2-muted)]">
              ההפעלה מפרסמת את הטקסט לרשימת הודעה אחרונה לציבור הקיימת. אין ערוץ הודעות נפרד.
            </p>
          </section>

          <section className="v2-card p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <label className="v2-label" htmlFor="drill-duration">משך בדקות שלמות</label>
                <input
                  id="drill-duration"
                  className="w-28 rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg)] px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  max={MAX_DURATION_MINUTES}
                  value={draft?.durationMinutes || 1}
                  onChange={(event) => {
                    if (event.target.value === "") return;
                    onChangeDraft(withDuration(draft, event.target.value));
                  }}
                />
              </div>
              <div className="v2-seg" role="group" aria-label="תבנית עקומה">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={draft?.curvePreset === preset.id ? "on" : ""}
                    onClick={() => onChangeDraft(withPreset(draft, preset.id))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>אחוז מתושבי ברירת המחדל בכל דקה. כל השאר מסומנים הכל בסדר.</span>
              <strong className={percentSum === 100 ? "text-emerald-700" : "text-red-700"}>סה״כ {percentSum}%</strong>
            </div>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-auto sm:grid-cols-4 lg:grid-cols-6">
              {(draft?.curve || []).map((value, index) => (
                <label key={`minute-${index + 1}`} className="text-xs text-[var(--v2-muted)]">
                  דקה {index + 1}
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg)] px-2 py-1 text-sm text-[var(--v2-ink)]"
                    type="number"
                    min={0}
                    max={100}
                    aria-label={`אחוז בדקה ${index + 1}`}
                    value={value}
                    onChange={(event) => onChangeDraft(withCurveValue(draft, index, event.target.value))}
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--v2-muted)]">אותו תרחיש חוזר על אותו סדר תושבים.</p>
          </section>

          <section className="v2-card p-4">
            <h2 className="mb-2 text-sm font-semibold">קבוצות חריגות</h2>
            <p className="mb-3 text-xs text-[var(--v2-muted)]">
              חיפוש וסינון שכונה, ואז סימון המסוננים כזקוקים לסיוע או לא בטוח. כל השאר הם הכל בסדר.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                className="v2-search min-w-0 flex-1"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="חיפוש שם, טלפון או בית"
                aria-label="חיפוש תושבים לתרחיש"
              />
              <select
                className="v2-select max-w-xs"
                value={neighborhood}
                onChange={(event) => setNeighborhood(event.target.value)}
                aria-label="סינון שכונה"
              >
                <option value="">כל השכונות</option>
                {neighborhoods.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm">מסוננים: {filtered.length}</span>
              <button type="button" className="v2-btn v2-btn-sm" disabled={!filtered.length} onClick={() => markFiltered(DRILL_STATUS_HELP)}>
                סמן מסוננים כזקוקים לסיוע
              </button>
              <button type="button" className="v2-btn v2-btn-sm" disabled={!filtered.length} onClick={() => markFiltered(DRILL_STATUS_UNSURE)}>
                סמן מסוננים כלא בטוח
              </button>
            </div>
            <div className="max-h-40 overflow-auto rounded-lg border border-[var(--v2-line)]">
              {shown.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-2 border-b border-[var(--v2-line)] px-3 py-1.5 text-sm last:border-b-0">
                  <span className="truncate">{residentName(row)} · {getFieldValue(row, "שכונה") || "ללא שכונה"}</span>
                  {exceptionById.has(row.id) && (
                    <span className="shrink-0 text-[11px] text-[var(--v2-muted)]">{displayResidentStatus(exceptionById.get(row.id))}</span>
                  )}
                </div>
              ))}
              {filtered.length === 0 && <div className="px-3 py-4 text-sm text-[var(--v2-muted)]">אין תושבים במסנן</div>}
              {filtered.length > shown.length && (
                <div className="px-3 py-2 text-xs text-[var(--v2-muted)]">ועוד {filtered.length - shown.length}. הסימון חל על כל המסוננים.</div>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {(draft?.exceptions || []).map((set) => (
                <div key={set.id} className="rounded-lg border border-[var(--v2-line)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      {displayResidentStatus(set.status)} · {set.residentIds?.length || 0}
                    </div>
                    <button type="button" className="v2-btn v2-btn-sm" onClick={() => onChangeDraft(removeException(draft, set.id))}>
                      הסר
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        name={`timing-${set.id}`}
                        checked={set.timing !== "spread"}
                        onChange={() => onChangeDraft(updateException(draft, set.id, { timing: "single" }))}
                      />
                      בדקה אחת
                    </label>
                    {set.timing !== "spread" && (
                      <label className="inline-flex items-center gap-1">
                        דקה
                        <input
                          className="w-16 rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg)] px-2 py-1"
                          type="number"
                          min={1}
                          max={draft?.durationMinutes || 1}
                          value={set.minute || 1}
                          onChange={(event) => onChangeDraft(updateException(draft, set.id, { minute: event.target.value }))}
                        />
                      </label>
                    )}
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        name={`timing-${set.id}`}
                        checked={set.timing === "spread"}
                        onChange={() => onChangeDraft(updateException(draft, set.id, { timing: "spread" }))}
                      />
                      פרוס על פני התרגיל
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="v2-card p-4">
            <h2 className="mb-2 text-sm font-semibold">לפני הפעלה</h2>
            <div className="v2-kpis">
              <div className="v2-kpi v2-card">
                <div className="n">{plan.counts.total}</div>
                <div className="l">תושבים</div>
              </div>
              <div className="v2-kpi v2-card">
                <div className="n">{plan.counts.ok}</div>
                <div className="l">הכל בסדר</div>
              </div>
              <div className="v2-kpi v2-card">
                <div className="n">{plan.counts.help}</div>
                <div className="l">זקוקים לסיוע</div>
              </div>
              <div className="v2-kpi v2-card">
                <div className="n">{plan.counts.unsure}</div>
                <div className="l">לא בטוח</div>
              </div>
            </div>
            {plan.ok ? (
              <div className="max-h-48 overflow-auto">
                <table className="v2-data">
                  <thead>
                    <tr>
                      <th>דקה</th>
                      <th>הכל בסדר</th>
                      <th>זקוקים לסיוע</th>
                      <th>לא בטוח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.perMinute.map((row) => (
                      <tr key={row.minute}>
                        <td>{row.minute}</td>
                        <td>{row.ok}</td>
                        <td>{row.help}</td>
                        <td>{row.unsure}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-red-700">{plan.error}</p>
            )}
            <p className="mt-2 text-xs text-[var(--v2-muted)]">
              עד הדקה של תושב הסטטוס נשאר ריק (ללא סטטוס). אחרי הכתיבה הסטטוס נשאר עד סיים תרגיל.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="v2-btn" disabled={busy || !draft?.name?.trim()} onClick={onSave}>
                שמור טיוטה
              </button>
              {selectedId && (
                <button type="button" className="v2-btn" disabled={busy} onClick={() => onDelete(selectedId)}>
                  מחק טיוטה
                </button>
              )}
              <button
                type="button"
                className="v2-btn border-amber-500 bg-amber-500 text-white"
                disabled={!canActivate}
                onClick={() => setConfirmOpen(true)}
              >
                הפעל תרגיל
              </button>
            </div>
            {activeBlocked && (
              <p className="mt-2 text-xs text-amber-800">אי אפשר להפעיל תרגיל נוסף כל עוד הריצה הזו רצה. השהיה עוצרת את הדקות הבאות ומשחררת הפעלה חדשה.</p>
            )}
          </section>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-white" dir="rtl">
          <DialogHeader>
            <DialogTitle>הפעלת תרגיל ארגז חול</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>ההפעלה כותבת סטטוסי תושבים אמיתיים לפי לוח הדקות, ומשאירה אותם עד סיום התרגיל.</p>
            <p>ההודעה מתפרסמת לרשימת הודעה אחרונה לציבור שכל דשבורד פתוח רואה.</p>
            <p className="font-semibold">לא נשלחת הודעת וואטסאפ.</p>
          </div>
          <DialogFooter className="gap-2">
            <button type="button" className="v2-btn" onClick={() => setConfirmOpen(false)}>ביטול</button>
            <button
              type="button"
              className="v2-btn border-amber-500 bg-amber-500 text-white"
              onClick={() => {
                setConfirmOpen(false);
                onActivate();
              }}
            >
              הפעל תרגיל
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
