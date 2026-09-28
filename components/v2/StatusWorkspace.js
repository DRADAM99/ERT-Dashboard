"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/app/context/DataContext";
import { displayResidentStatus, NEED_HELP_STATUSES, residentName, residentStatus } from "@/lib/residents";
import { EMERGENCY_MODES } from "@/lib/emergencyActions";
import { formatDateTime, formatDuration, formatElapsed, toDate } from "@/components/v2/format";
import RecordOverlay from "@/components/v2/RecordOverlay";
import ResidentRecord from "@/components/v2/ResidentRecord";

const STATUS_ORDER = ["הכל בסדר", "זקוקים לסיוע", "לא בטוח", "פצוע", "ללא סטטוס"];
const STATUS_COLOR = {
  "הכל בסדר": "bg-emerald-500",
  "זקוקים לסיוע": "bg-red-500",
  "לא בטוח": "bg-orange-500",
  פצוע: "bg-purple-500",
  "ללא סטטוס": "bg-slate-400",
};
const TIMELINE_FILTERS = [
  { key: "log_update", label: "עדכוני יומן" },
  { key: "task_created", label: "משימות חדשות" },
  { key: "task_done", label: "משימות שהושלמו" },
  { key: "resident_status", label: "שינויי סטטוס תושבים" },
];
const FILTER_DEFAULTS = {
  resident_status: true,
  task_created: true,
  task_done: true,
  log_update: true,
};

function isTaskClosed(task) {
  return task?.status === "הושלם" || !!task?.done;
}

function reversedComments(row) {
  return Array.isArray(row?.comments) ? [...row.comments].reverse() : [];
}

function timelineMeta(item) {
  const raw = item?.raw;
  if (!raw) return "";
  if (item.type === "log_update") return [raw.reporter, raw.status].filter(Boolean).join(" · ");
  if (item.type === "task_created" || item.type === "task_done") {
    return [raw.category, raw.status, raw.assignee].filter(Boolean).join(" · ");
  }
  if (item.type === "resident_status") {
    return [raw.from ? `מ-${raw.from}` : "", raw.to ? `ל-${raw.to}` : ""].filter(Boolean).join(" ");
  }
  return "";
}

function ResidentHelpRow({ row, onOpen }) {
  const comments = reversedComments(row);
  return (
    <button type="button" className="v2-split-row" onClick={() => onOpen(row)}>
      <div>
        <div className="n">{residentName(row)}</div>
        {comments.length > 0 ? (
          comments.map((comment, index) => (
            <div key={index} className="m truncate">
              <strong>{comment.userAlias || "הערה"}:</strong> {comment.text || ""}
            </div>
          ))
        ) : (
          <div className="m">אין הערות</div>
        )}
      </div>
    </button>
  );
}

export default function StatusWorkspace() {
  const { residents, tasks, eventLogs, emergencyMode } = useData();
  const [clock, setClock] = useState("00:00:00");
  const [layout, setLayout] = useState("vertical");
  const [zoom, setZoom] = useState(1);
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [selectedResident, setSelectedResident] = useState(null);
  const [selectedTimeline, setSelectedTimeline] = useState(null);
  const isDrill = emergencyMode !== EMERGENCY_MODES.LIVE;

  const startTime = useMemo(() => (eventLogs[0] ? toDate(eventLogs[0].createdAt) : null), [eventLogs]);

  useEffect(() => {
    const tick = () => setClock(formatElapsed(startTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const statusCounts = useMemo(() => {
    const counts = { "הכל בסדר": 0, "זקוקים לסיוע": 0, "לא בטוח": 0, פצוע: 0, "ללא סטטוס": 0 };
    (residents || []).forEach((row) => {
      const label = displayResidentStatus(residentStatus(row));
      if (counts[label] !== undefined) counts[label] += 1;
    });
    return counts;
  }, [residents]);

  const injured = useMemo(
    () => (residents || []).filter((row) => residentStatus(row) === "פצוע"),
    [residents]
  );
  const needHelpRows = useMemo(
    () => (residents || []).filter((row) => NEED_HELP_STATUSES.includes(residentStatus(row))),
    [residents]
  );
  const needHelpRest = useMemo(
    () => needHelpRows.filter((row) => residentStatus(row) !== "פצוע"),
    [needHelpRows]
  );

  const tasksSummary = useMemo(() => {
    const categories = {};
    const completionTimes = [];
    const responseTimes = [];
    (tasks || []).forEach((task) => {
      const category = task.category || "ללא קטגוריה";
      if (!categories[category]) categories[category] = { open: 0, closed: 0 };
      const createdAt = toDate(task.createdAt);
      if (isTaskClosed(task)) {
        categories[category].closed += 1;
        const completedAt = toDate(task.completedAt);
        if (completedAt && createdAt) completionTimes.push(completedAt - createdAt);
      } else {
        categories[category].open += 1;
      }
      if (task.replies?.length && createdAt) {
        const first = [...task.replies].sort((a, b) => (toDate(a.timestamp) || 0) - (toDate(b.timestamp) || 0))[0];
        const firstTs = toDate(first?.timestamp);
        if (firstTs) responseTimes.push(firstTs - createdAt);
      }
    });
    return {
      categories,
      avgCompletionTime: completionTimes.length ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length : null,
      avgResponseTime: responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null,
    };
  }, [tasks]);

  const narrative = useMemo(() => {
    if (!eventLogs.length) return "לא נרשמו אירועים.";
    const first = eventLogs[0];
    const last = eventLogs[eventLogs.length - 1];
    let text = `בשעה ${formatDateTime(first.createdAt).split(" ")[1] || ""} הוכרז אירוע חירום. `;
    text += `הדיווח הראשוני היה: "${first.description || "לא צוין תיאור"}". `;
    if (eventLogs.length > 1) {
      text += `עד כה נרשמו ${eventLogs.length} עדכונים. `;
      text += `העדכון האחרון (${formatDateTime(last.createdAt).split(" ")[1] || ""}) מפי ${last.reporter || "לא צוין"}, הוא: "${last.description || "לא צוין תיאור"}" במצב "${last.status}".`;
    }
    return text;
  }, [eventLogs]);

  const timeline = useMemo(() => {
    const events = [];
    eventLogs.forEach((log) => {
      if (!log.createdAt) return;
      events.push({
        id: `log-${log.id}`,
        timestamp: toDate(log.createdAt),
        type: "log_update",
        content: log.description || "עדכון ביומן",
        color: "bg-[var(--v2-cyan)]",
        href: `/events?open=${log.id}`,
        raw: log,
      });
    });
    (tasks || []).forEach((task) => {
      if (task.createdAt) {
        events.push({
          id: `task-created-${task.id}`,
          timestamp: toDate(task.createdAt),
          type: "task_created",
          content: `משימה נוצרה: ${task.title || ""}`,
          color: "bg-emerald-500",
          href: `/tasks?open=${task.id}`,
          raw: task,
        });
      }
      if (task.completedAt) {
        events.push({
          id: `task-done-${task.id}`,
          timestamp: toDate(task.completedAt),
          type: "task_done",
          content: `משימה הושלמה: ${task.title || ""}`,
          color: "bg-purple-500",
          href: `/tasks?open=${task.id}`,
          raw: task,
        });
      }
    });
    (residents || []).forEach((row) => {
      (row.statusHistory || []).forEach((item, index) => {
        if (!item.timestamp) return;
        events.push({
          id: `resident-${row.id}-${index}`,
          timestamp: toDate(item.timestamp),
          type: "resident_status",
          content: `סטטוס שונה ל-${residentName(row)} ל-${item.to || "ללא סטטוס"}`,
          color: "bg-red-500",
          href: `/residents?open=${row.id}`,
          raw: { ...item, residentName: residentName(row), residentId: row.id },
        });
      });
    });
    return events.filter((item) => item.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  }, [eventLogs, tasks, residents]);

  const filteredTimeline = timeline.filter((item) => filters[item.type]);
  const openTasks = (tasks || []).filter((task) => !isTaskClosed(task)).length;
  const lastEventId = eventLogs.length ? eventLogs[eventLogs.length - 1].id : null;
  const liveSelectedResident =
    selectedResident && ((residents || []).find((row) => row.id === selectedResident.id) || selectedResident);

  return (
    <div>
      <div className="v2-toolbar">
        <div>
          <h1 className="v2-h1">תמונת מצב</h1>
          <p className="v2-sub">סקירת האירוע בזמן אמת</p>
        </div>
        <div className="v2-row">
          <span className={isDrill ? "v2-mode-drill" : "v2-mode-live"}>{isDrill ? "תרגיל" : "חי"}</span>
          <div className="v2-clock" aria-label="זמן מתחילת האירוע">{clock}</div>
        </div>
      </div>

      <div className="v2-kpis-3">
        <Link href="/residents" className="v2-card v2-kpi v2-kpi-link">
          <div className="n">{needHelpRows.length}</div>
          <div className="l">תושבים שצריכים מענה</div>
        </Link>
        <Link href="/tasks" className="v2-card v2-kpi v2-kpi-link">
          <div className="n">{openTasks}</div>
          <div className="l">משימות פתוחות</div>
        </Link>
        <Link href={lastEventId ? `/events?open=${lastEventId}` : "/events"} className="v2-card v2-kpi v2-kpi-link">
          <div className="n">{eventLogs.length}</div>
          <div className="l">אירועים ביומן</div>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="v2-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2 font-semibold">
              <span>סטטוס תושבים</span>
              <span className="flex items-center gap-2 text-sm font-normal text-[var(--v2-muted)]">
                סה״כ {residents.length}
                <Link href="/residents" className="v2-sec-link">לתושבים</Link>
              </span>
            </div>
            {STATUS_ORDER.map((status) => {
              const count = statusCounts[status] || 0;
              const pct = residents.length ? (count / residents.length) * 100 : 0;
              return (
                <div key={status} className="mb-3">
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{status}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="v2-bar">
                    <span className={STATUS_COLOR[status]} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}

            <div className="mt-4 border-t border-[var(--v2-line)] pt-3">
              <h3 className="mb-2 font-semibold">פצועים ({injured.length})</h3>
              {injured.length === 0 ? (
                <p className="text-sm text-[var(--v2-muted)]">אין תושבים שסומנו כפצועים.</p>
              ) : (
                <div className="v2-help-list">
                  {injured.map((row) => (
                    <ResidentHelpRow key={row.id} row={row} onOpen={setSelectedResident} />
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-[var(--v2-line)] pt-3">
              <h3 className="mb-2 font-semibold">זקוקים למענה ({needHelpRest.length})</h3>
              {needHelpRest.length === 0 ? (
                <p className="text-sm text-[var(--v2-muted)]">אין תושבים בסטטוס זקוקים לסיוע או לא בטוח.</p>
              ) : (
                <div className="v2-help-list">
                  {needHelpRest.map((row) => (
                    <ResidentHelpRow key={row.id} row={row} onOpen={setSelectedResident} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="v2-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2 font-semibold">
              <span>סיכום משימות</span>
              <Link href="/tasks" className="v2-sec-link">למשימות</Link>
            </div>
            <div className="mb-4 grid gap-3">
              <div>
                <div className="text-sm">זמן טיפול ממוצע</div>
                <div className="text-lg font-bold">{formatDuration(tasksSummary.avgCompletionTime)}</div>
              </div>
              <div>
                <div className="text-sm">זמן תגובה ממוצע</div>
                <div className="text-lg font-bold">{formatDuration(tasksSummary.avgResponseTime)}</div>
              </div>
            </div>
            {Object.keys(tasksSummary.categories).length === 0 ? (
              <p className="text-sm text-[var(--v2-muted)]">אין משימות להצגה.</p>
            ) : (
              Object.entries(tasksSummary.categories).map(([category, counts]) => {
                const total = counts.open + counts.closed || 1;
                return (
                  <Link key={category} href="/tasks" className="mb-3 block text-[var(--v2-ink)] no-underline">
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{category}</span>
                      <span>{counts.open} פתוחות / {counts.closed} סגורות</span>
                    </div>
                    <div className="v2-bar">
                      <span className="bg-emerald-500" style={{ width: `${(counts.closed / total) * 100}%` }} />
                      <span className="bg-orange-400" style={{ width: `${(counts.open / total) * 100}%` }} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="v2-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2 font-semibold">
              <span>סיכום יומן אירועים</span>
              <Link href={lastEventId ? `/events?open=${lastEventId}` : "/events"} className="v2-sec-link">ליומן</Link>
            </div>
            <p className="leading-relaxed text-[var(--v2-ink)]">{narrative}</p>
          </div>
          <div className="v2-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">ציר זמן חי</span>
              <div className="v2-row">
                {layout === "horizontal" && (
                  <>
                    <button
                      className="v2-btn v2-btn-sm"
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.2, Math.round((z - 0.2) * 10) / 10))}
                    >
                      −
                    </button>
                    <button
                      className="v2-btn v2-btn-sm"
                      type="button"
                      onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.2) * 10) / 10))}
                    >
                      +
                    </button>
                  </>
                )}
                <button
                  className="v2-btn v2-btn-sm"
                  type="button"
                  onClick={() => setLayout((prev) => (prev === "vertical" ? "horizontal" : "vertical"))}
                >
                  {layout === "vertical" ? "אופקי" : "אנכי"}
                </button>
                {TIMELINE_FILTERS.map((item) => (
                  <label key={item.key} className="v2-toggle">
                    <input
                      type="checkbox"
                      checked={filters[item.key]}
                      onChange={(e) => setFilters((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            {filteredTimeline.length === 0 && <p className="v2-sub">אין אירועים לפי הפילטרים שנבחרו.</p>}

            {layout === "vertical" ? (
              <div className="max-h-[28rem] overflow-auto">
                {filteredTimeline.map((item) => {
                  const meta = timelineMeta(item);
                  const className = "v2-tl w-full no-underline text-[var(--v2-ink)]";
                  const body = (
                    <>
                      <div className="t">{formatDateTime(item.timestamp)}</div>
                      <div className="b">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} />
                          <span>{item.content}</span>
                        </div>
                        {meta ? <div className="meta">{meta}</div> : null}
                      </div>
                    </>
                  );
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={className}
                      onClick={() => setSelectedTimeline(item)}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="v2-timeline-h">
                <div
                  className="v2-timeline-h-track"
                  style={{ minWidth: `${Math.max(filteredTimeline.length, 1) * 150 * zoom}px` }}
                >
                  <div className="v2-timeline-h-line" />
                  {filteredTimeline.map((item, index) => {
                    const meta = timelineMeta(item);
                    const side = index % 2 === 0 ? "up" : "down";
                    const inner = (
                      <>
                        <span className={`v2-timeline-h-dot ${item.color}`} />
                        <span className="v2-timeline-h-stem" />
                        <span className="v2-timeline-h-card">
                          <strong>{formatDateTime(item.timestamp)}</strong>
                          <div className="mt-1 line-clamp-2">{item.content}</div>
                          {meta ? <div className="meta mt-1">{meta}</div> : null}
                        </span>
                      </>
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`v2-timeline-h-item ${side}`}
                        onClick={() => setSelectedTimeline(item)}
                      >
                        {inner}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <RecordOverlay open={!!liveSelectedResident} onClose={() => setSelectedResident(null)}>
        {liveSelectedResident && (
          <>
            <ResidentRecord
              key={liveSelectedResident.id}
              resident={liveSelectedResident}
              variant="sheet"
              onClose={() => setSelectedResident(null)}
            />
            <div className="border-t border-[var(--v2-line)] p-4">
              <Link href={`/residents?open=${liveSelectedResident.id}`} className="v2-sec-link">
                פתח במסך תושבים
              </Link>
            </div>
          </>
        )}
      </RecordOverlay>

      <RecordOverlay open={!!selectedTimeline} onClose={() => setSelectedTimeline(null)}>
        {selectedTimeline && (
          <div className="p-4" dir="rtl">
            <div className="v2-row mb-3">
              <button className="v2-btn v2-btn-sm" type="button" onClick={() => setSelectedTimeline(null)}>סגירה</button>
            </div>
            <h2 className="v2-h1">פרטי אירוע</h2>
            <p className="v2-sub mb-2">{formatDateTime(selectedTimeline.timestamp)}</p>
            <p className="mb-3">{selectedTimeline.content}</p>
            {timelineMeta(selectedTimeline) && (
              <p className="mb-3 text-sm text-[var(--v2-muted)]">{timelineMeta(selectedTimeline)}</p>
            )}
            {selectedTimeline.href && (
              <Link href={selectedTimeline.href} className="v2-btn v2-btn-primary v2-btn-sm inline-flex">
                פתח במסך היעד
              </Link>
            )}
          </div>
        )}
      </RecordOverlay>
    </div>
  );
}
