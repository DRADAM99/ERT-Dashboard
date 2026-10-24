"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { GripVertical, X, Plus, RotateCcw, Download, Edit2, Check, SlidersHorizontal, ArrowRight } from "lucide-react";
import { db } from "@/firebase";
import { useData } from "@/app/context/DataContext";
import { displayResidentStatus, residentName, residentStatus } from "@/lib/residents";
import { sanitizeEventFilename } from "@/lib/emergencyActions";
import { DEFAULT_MAP_CENTER, MAP_CONFIG_DOC, normalizeMapConfig } from "@/lib/mapConfig";
import { formatDateTime, formatElapsed, toDate } from "@/components/v2/format";
import {
  DEFAULT_ANNOUNCEMENTS,
  DEFAULT_DEPT_HEADS,
  DEFAULT_WIDGET_LAYOUT,
  DEMO_EVENT_LOGS,
  DEMO_RESIDENTS,
  DEMO_TASKS,
  HEIGHT_PRESETS,
  WIDTH_PRESETS,
} from "@/components/v2/sitrepDemoData";
import {
  DeptHeadsWidget,
  DeptTasksSummaryWidget,
  EmergencyMapWidget,
  EventSummaryBriefWidget,
  GreenEyesTableWidget,
  isTaskClosed,
  KpiEventsWidget,
  KpiResidentsWidget,
  KpiTasksWidget,
  LiveTimelineWidget,
  PublicAnnouncementWidget,
  StatusPercentBarWidget,
} from "@/components/v2/SitrepWidgetsContent";

const STORAGE_KEYS = {
  TITLE: "ert.eventLogTitle",
  LAYOUT: "ert.sitrepWidgetLayout.v2",
  DEPT_HEADS: "ert.sitrepDeptHeads.v1",
  ANNOUNCEMENTS: "ert.sitrepAnnouncements.v1",
  COMMANDER_NOTES: "ert.sitrepCommanderNotes.v1",
};

function mergeWithDefaultWidgets(savedList) {
  if (!Array.isArray(savedList) || !savedList.length) return DEFAULT_WIDGET_LAYOUT;
  const byId = new Map(savedList.map((w) => [w.id, w]));
  const merged = savedList.filter((w) => DEFAULT_WIDGET_LAYOUT.some((d) => d.id === w.id));
  DEFAULT_WIDGET_LAYOUT.forEach((defWidget, idx) => {
    if (!byId.has(defWidget.id)) {
      merged.splice(Math.min(idx, merged.length), 0, defWidget);
    }
  });
  return merged;
}

const COL_SPAN_CLASSES = {
  3: "col-span-12 md:col-span-6 lg:col-span-3",
  4: "col-span-12 md:col-span-6 lg:col-span-4",
  6: "col-span-12 lg:col-span-6",
  8: "col-span-12 lg:col-span-8",
  12: "col-span-12",
};

const ROW_SPAN_CLASSES = {
  compact: "min-h-[125px]",
  normal: "min-h-[240px]",
  tall: "min-h-[370px]",
};

export default function WidgetSitrepDashboard() {
  const contextData = useData();
  const [title, setTitle] = useState('תמונת מצב — אירוע חירום חמ"ל');
  const [editingTitle, setEditingTitle] = useState(false);
  const [dataSource, setDataSource] = useState("demo");
  const [liveResidents, setLiveResidents] = useState([]);
  const [liveTasks, setLiveTasks] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveMapConfig, setLiveMapConfig] = useState(null);
  const [widgets, setWidgets] = useState(DEFAULT_WIDGET_LAYOUT);
  const [deptHeads, setDeptHeads] = useState(DEFAULT_DEPT_HEADS);
  const [announcements, setAnnouncements] = useState(DEFAULT_ANNOUNCEMENTS);
  const [commanderNotes, setCommanderNotes] = useState(
    "ניתוק חשמל בהרחבה הצפונית בטיפול מול חח״י; עדיפות עליונה לאספקת גנרטורים למחוללי חמצן והשלמת סבב ביקורי בית ל-2 תושבים שטרם ענו."
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [isResizing, setIsResizing] = useState(false);
  const [clock, setClock] = useState("00:54:12");
  const [exportNotice, setExportNotice] = useState("");
  const gridRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedTitle = window.localStorage.getItem(STORAGE_KEYS.TITLE);
      if (savedTitle && savedTitle.trim()) setTitle(savedTitle.trim());
      const savedLayout = window.localStorage.getItem(STORAGE_KEYS.LAYOUT);
      if (savedLayout) {
        const parsed = JSON.parse(savedLayout);
        if (Array.isArray(parsed) && parsed.length) setWidgets(mergeWithDefaultWidgets(parsed));
      }
      const savedHeads = window.localStorage.getItem(STORAGE_KEYS.DEPT_HEADS);
      if (savedHeads) setDeptHeads(JSON.parse(savedHeads));
      const savedAnn = window.localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENTS);
      if (savedAnn) setAnnouncements(JSON.parse(savedAnn));
      const savedNotes = window.localStorage.getItem(STORAGE_KEYS.COMMANDER_NOTES);
      if (savedNotes) setCommanderNotes(savedNotes);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const unsubs = [];
    try {
      unsubs.push(
        onSnapshot(collection(db, "residents"), (snap) => {
          setLiveResidents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, () => {})
      );
      unsubs.push(
        onSnapshot(collection(db, "tasks"), (snap) => {
          setLiveTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, () => {})
      );
      unsubs.push(
        onSnapshot(collection(db, "eventLogs"), (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          rows.sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
          setLiveEvents(rows);
        }, () => {})
      );
      unsubs.push(
        onSnapshot(
          doc(db, MAP_CONFIG_DOC.collection, MAP_CONFIG_DOC.id),
          (snap) => {
            if (snap.exists()) setLiveMapConfig(normalizeMapConfig(snap.data()));
          },
          () => {}
        )
      );
    } catch {
      /* ignore unauthenticated firestore errors */
    }
    return () => unsubs.forEach((u) => u && u());
  }, []);

  const mapConfig = useMemo(
    () => normalizeMapConfig(liveMapConfig || contextData?.mapConfig || DEFAULT_MAP_CENTER),
    [liveMapConfig, contextData?.mapConfig]
  );

  const saveTitle = (next) => {
    const cleaned = (next || "").trim() || 'תמונת מצב — אירוע חירום חמ"ל';
    setTitle(cleaned);
    setEditingTitle(false);
    try {
      window.localStorage.setItem(STORAGE_KEYS.TITLE, cleaned);
    } catch {
      /* ignore */
    }
  };

  const persistWidgets = (next) => {
    setWidgets(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.LAYOUT, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const handleUpdateDeptHeads = (next) => {
    setDeptHeads(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.DEPT_HEADS, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const handleUpdateAnnouncements = (next) => {
    setAnnouncements(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENTS, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const handleUpdateNotes = (next) => {
    setCommanderNotes(next);
    try {
      window.localStorage.setItem(STORAGE_KEYS.COMMANDER_NOTES, next);
    } catch {
      /* ignore */
    }
  };

  const residents = dataSource === "live" && liveResidents.length ? liveResidents : DEMO_RESIDENTS;
  const tasks = dataSource === "live" && liveTasks.length ? liveTasks : DEMO_TASKS;
  const eventLogs = dataSource === "live" && liveEvents.length ? liveEvents : DEMO_EVENT_LOGS;

  const startTime = useMemo(() => (eventLogs[0] ? toDate(eventLogs[0].createdAt) : null), [eventLogs]);

  useEffect(() => {
    const tick = () => setClock(formatElapsed(startTime));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  const statusCounts = useMemo(() => {
    const counts = { "הכל בסדר": 0, "זקוקים לסיוע": 0, "לא בטוח": 0, פצוע: 0, "ללא סטטוס": 0 };
    residents.forEach((r) => {
      const label = displayResidentStatus(residentStatus(r));
      if (counts[label] !== undefined) counts[label] += 1;
    });
    return counts;
  }, [residents]);

  const tasksSummary = useMemo(() => {
    const categories = {};
    const completionTimes = [];
    const responseTimes = [];
    tasks.forEach((task) => {
      const cat = task.category || task.department || "ללא קטגוריה";
      if (!categories[cat]) categories[cat] = { open: 0, closed: 0 };
      const createdAt = toDate(task.createdAt);
      if (isTaskClosed(task)) {
        categories[cat].closed += 1;
        const completedAt = toDate(task.completedAt);
        if (completedAt && createdAt) completionTimes.push(completedAt - createdAt);
      } else {
        categories[cat].open += 1;
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

  const timeline = useMemo(() => {
    const items = [];
    eventLogs.forEach((log) => {
      if (!log.createdAt) return;
      items.push({
        id: `log-${log.id}`,
        timestamp: toDate(log.createdAt),
        type: "log_update",
        content: log.description || "עדכון ביומן",
        meta: [log.department, log.reporter, log.status].filter(Boolean).join(" · "),
        color: "bg-[#4eb8c6]",
      });
    });
    tasks.forEach((task) => {
      if (task.createdAt) {
        items.push({
          id: `tc-${task.id}`,
          timestamp: toDate(task.createdAt),
          type: "task_created",
          content: `משימה נוצרה: ${task.title}`,
          meta: [task.category, task.priority].filter(Boolean).join(" · "),
          color: "bg-emerald-500",
        });
      }
      if (task.completedAt) {
        items.push({
          id: `td-${task.id}`,
          timestamp: toDate(task.completedAt),
          type: "task_done",
          content: `משימה הושלמה: ${task.title}`,
          meta: task.category || "",
          color: "bg-purple-500",
        });
      }
    });
    residents.forEach((row) => {
      (row.statusHistory || []).forEach((h, i) => {
        if (!h.timestamp) return;
        items.push({
          id: `rs-${row.id}-${i}`,
          timestamp: toDate(h.timestamp),
          type: "resident_status",
          content: `סטטוס תושב: ${residentName(row)} ← ${displayResidentStatus(h.to)}`,
          meta: row.שכונה || "",
          color: "bg-red-500",
        });
      });
    });
    return items.filter((i) => i.timestamp).sort((a, b) => a.timestamp - b.timestamp);
  }, [eventLogs, tasks, residents]);

  const updateWidget = (id, patch) => {
    persistWidgets(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const handleDropOn = (targetId) => {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const next = [...widgets];
    const fromIdx = next.findIndex((w) => w.id === draggedId);
    const toIdx = next.findIndex((w) => w.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      persistWidgets(next);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const startResizeDrag = (e, widget) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startCols = widget.colSpan || 6;
    const gridWidth = gridRef.current?.getBoundingClientRect().width || 1200;
    const colWidth = gridWidth / 12;

    const onMove = (moveEvent) => {
      // RTL: dragging left (negative deltaX) increases width
      const deltaX = startX - moveEvent.clientX;
      const colDelta = Math.round(deltaX / colWidth);
      const rawCols = Math.max(3, Math.min(12, startCols + colDelta));
      const allowed = [3, 4, 6, 8, 12];
      const snappedCols = allowed.reduce((prev, curr) =>
        Math.abs(curr - rawCols) < Math.abs(prev - rawCols) ? curr : prev
      );
      const deltaY = moveEvent.clientY - startY;
      let nextRow = widget.rowSpan || "normal";
      if (deltaY > 70) nextRow = "tall";
      else if (deltaY < -70) nextRow = "compact";
      updateWidget(widget.id, { colSpan: snappedCols, rowSpan: nextRow });
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleExportCSV = () => {
    const base = sanitizeEventFilename(title, "sitrep_report");
    const rows = [
      ["סוג רשומה", "מזהה / שם", "שכונה / מכלול", "סטטוס", "פרטים / הערות"],
      ...deptHeads.map((d) => ["ראש מכלול", d.headName, d.dept, d.status, `טלפון: ${d.phone} | פעילים: ${d.activeCount}`]),
      ...residents.map((r) => ["תושב", residentName(r), r.שכונה || "", displayResidentStatus(residentStatus(r)), r.הערות || ""]),
      ...tasks.map((t) => ["משימה", t.title, t.category || "", isTaskClosed(t) ? "הושלם" : t.status, `עדיפות: ${t.priority || ""}`]),
      ...eventLogs.map((ev) => ["יומן אירועים", ev.reporter || "", ev.department || "", ev.status || "", ev.description || ""]),
    ];
    const csv = "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportNotice(`נשמר הקובץ: ${base}.csv`);
    setTimeout(() => setExportNotice(""), 4000);
  };

  const handleExportHTML = async () => {
    const base = sanitizeEventFilename(title, "sitrep_report");
    try {
      const res = await fetch("/dashboard-demo.html");
      if (res.ok) {
        let htmlText = await res.text();
        htmlText = htmlText.replace(
          /<h1 id="docTitle"[^>]*>[\s\S]*?<\/h1>/,
          `<h1 id="docTitle" class="title-text" title="לחץ לעריכת כותרת ושם הקובץ">${title}</h1>`
        );
        htmlText = htmlText.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
        const blob = new Blob([htmlText], { type: "text/html;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${base}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setExportNotice(`נשמר קובץ HTML עצמאי: ${base}.html`);
        setTimeout(() => setExportNotice(""), 4000);
        return;
      }
    } catch {
      /* fallback below */
    }
    const htmlSnapshot = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>${title}</title>
    <style>body{font-family:Rubik,Arial,sans-serif;background:#eaf3f6;color:#1a2e52;padding:24px}
    .card{background:#fff;border:1px solid #d2e4ea;border-radius:12px;padding:16px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #d2e4ea;padding:8px;text-align:right}</style>
    </head><body><h1>${title}</h1><p>הופק בתאריך: ${new Date().toLocaleString("he-IL")}</p>
    <div class="card"><h2>הודעה אחרונה לציבור</h2><p>${announcements[0]?.text || ""}</p></div>
    <div class="card"><h2>סיכום מפקד החמ״ל</h2><p>${commanderNotes}</p></div>
    </body></html>`;
    const blob = new Blob([htmlSnapshot], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportNotice(`נשמר הקובץ: ${base}.html`);
    setTimeout(() => setExportNotice(""), 4000);
  };

  const visibleWidgets = widgets.filter((w) => !w.hidden);
  const hiddenWidgets = widgets.filter((w) => w.hidden);

  const renderWidgetContent = (id) => {
    switch (id) {
      case "kpi_residents":
        return <KpiResidentsWidget residents={residents} statusCounts={statusCounts} />;
      case "kpi_tasks":
        return <KpiTasksWidget tasks={tasks} tasksSummary={tasksSummary} />;
      case "kpi_events":
        return <KpiEventsWidget eventLogs={eventLogs} />;
      case "status_bar":
        return <StatusPercentBarWidget residents={residents} statusCounts={statusCounts} />;
      case "public_announcement":
        return <PublicAnnouncementWidget announcements={announcements} onUpdateAnnouncements={handleUpdateAnnouncements} />;
      case "dept_heads":
        return <DeptHeadsWidget deptHeads={deptHeads} onChangeDeptHeads={handleUpdateDeptHeads} />;
      case "event_summary":
        return (
          <EventSummaryBriefWidget
            eventLogs={eventLogs}
            residents={residents}
            tasks={tasks}
            statusCounts={statusCounts}
            commanderNotes={commanderNotes}
            onChangeCommanderNotes={handleUpdateNotes}
          />
        );
      case "emergency_map":
        return (
          <EmergencyMapWidget
            mapConfig={mapConfig}
            residents={residents}
            isInteracting={Boolean(draggedId || isResizing)}
          />
        );
      case "green_eyes_table":
        return <GreenEyesTableWidget residents={residents} />;
      case "dept_tasks":
        return <DeptTasksSummaryWidget tasksSummary={tasksSummary} />;
      case "timeline":
        return <LiveTimelineWidget timeline={timeline} />;
      default:
        return null;
    }
  };

  return (
    <div className="v2-shell min-h-[100dvh] p-3 sm:p-5" dir="rtl">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* Top Header Bar */}
        <header className="v2-card p-3.5 sm:p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {editingTitle ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveTitle(title);
                  }}
                  className="flex items-center gap-2 flex-wrap"
                >
                  <input
                    className="v2-search font-bold text-lg px-3 py-1.5 min-w-[280px]"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" className="v2-btn v2-btn-primary v2-btn-sm">
                    <Check className="w-4 h-4" /> שמור כותרת
                  </button>
                </form>
              ) : (
                <>
                  <h1
                    className="text-xl sm:text-2xl font-extrabold text-[#1a2e52] cursor-pointer hover:text-[#1b3a78] flex items-center gap-2"
                    onClick={() => setEditingTitle(true)}
                    title="לחץ לעריכת כותרת הדו״ח ושם הקובץ לשמירה"
                  >
                    <span>{title}</span>
                    <Edit2 className="w-4 h-4 text-[#5f7384]" />
                  </h1>
                  <span className="rounded-full bg-[#d8f0f4] text-[#1b3a78] px-2.5 py-0.5 text-xs font-bold">
                    תצוגת ווידג׳טים מותאמת (12 עמודות)
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-[#5f7384]">
              גרור כל ווידג׳ט לשינוי סדר · שנה רוחב (1/4 עד מלא) או גובה עם התאמה אוטומטית לרשת · שם הקובץ ביצוא נקבע לפי הכותרת העליונה
            </p>
            {exportNotice && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1 inline-block">
                {exportNotice}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Demo vs Live Data Toggle */}
            <div className="v2-seg" role="group" aria-label="מקור נתונים">
              <button
                type="button"
                className={dataSource === "demo" ? "on" : ""}
                onClick={() => setDataSource("demo")}
              >
                נתוני הדגמה מלאים
              </button>
              <button
                type="button"
                className={dataSource === "live" ? "on" : ""}
                onClick={() => setDataSource("live")}
              >
                נתוני אמת ({liveResidents.length})
              </button>
            </div>

            {/* Restore Hidden Widgets Drawer Button */}
            <div className="relative">
              <button
                type="button"
                className="v2-btn v2-btn-sm font-semibold"
                onClick={() => setDrawerOpen((v) => !v)}
              >
                <Plus className="w-4 h-4" />
                <span>הוסף ווידג׳ט ({hiddenWidgets.length} מוסתרים)</span>
              </button>
              {drawerOpen && (
                <div className="v2-menu left-0 right-auto mt-1 min-w-[260px] p-3 space-y-2 z-50">
                  <div className="text-xs font-bold text-[#1a2e52] border-b border-[#d2e4ea] pb-1.5 flex items-center justify-between">
                    <span>ניהול והחזרת ווידג׳טים</span>
                    <button type="button" className="text-[#5f7384] hover:text-[#1a2e52]" onClick={() => setDrawerOpen(false)}>×</button>
                  </div>
                  {hiddenWidgets.length === 0 ? (
                    <div className="text-xs text-[#5f7384] py-1">כל {widgets.length} הווידג׳טים מוצגים כעת על הלוח.</div>
                  ) : (
                    <div className="space-y-1">
                      {hiddenWidgets.map((hw) => (
                        <button
                          key={hw.id}
                          type="button"
                          className="v2-check justify-between bg-[#f3f9fb] hover:bg-[#d8f0f4]"
                          onClick={() => updateWidget(hw.id, { hidden: false })}
                        >
                          <span className="font-semibold">{hw.title}</span>
                          <span className="text-xs font-bold text-[#1b3a78]">+ החזר</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-[#d2e4ea] pt-2 flex justify-between">
                    <button
                      type="button"
                      className="v2-btn v2-btn-sm w-full justify-center"
                      onClick={() => {
                        persistWidgets(DEFAULT_WIDGET_LAYOUT);
                        setDrawerOpen(false);
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> איפוס פריסה לברירת מחדל
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              className="v2-btn v2-btn-sm"
              onClick={() => persistWidgets(DEFAULT_WIDGET_LAYOUT)}
              title="איפוס גודל ומיקום כל הווידג׳טים"
            >
              <RotateCcw className="w-3.5 h-3.5" /> איפוס פריסה
            </button>

            <button type="button" className="v2-btn v2-btn-primary v2-btn-sm" onClick={handleExportCSV}>
              <Download className="w-3.5 h-3.5" /> שמור דו״ח (CSV)
            </button>
            <button type="button" className="v2-btn v2-btn-sm" onClick={handleExportHTML}>
              <Download className="w-3.5 h-3.5" /> שמור HTML
            </button>

            <Link href="/status" className="v2-btn v2-btn-sm">
              <ArrowRight className="w-3.5 h-3.5" /> חזרה לתמונת מצב
            </Link>

            <div className="v2-clock v2-clock-sm" aria-label="זמן מתחילת האירוע">
              {clock}
            </div>
          </div>
        </header>

        {/* 12-Column Snap-to-Grid Canvas */}
        <div ref={gridRef} className="grid grid-cols-12 gap-3.5 items-stretch">
          {visibleWidgets.map((widget) => {
            const colClass = COL_SPAN_CLASSES[widget.colSpan] || COL_SPAN_CLASSES[6];
            const rowClass = ROW_SPAN_CLASSES[widget.rowSpan] || ROW_SPAN_CLASSES.normal;
            const isDragTarget = dragOverId === widget.id && draggedId !== widget.id;
            const isCustomizing = customizeOpen === widget.id;

            return (
              <section
                key={widget.id}
                draggable
                onDragStart={(e) => {
                  setDraggedId(widget.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverId !== widget.id) setDragOverId(widget.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOn(widget.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                }}
                className={`v2-card flex flex-col justify-between relative transition-all duration-150 ${colClass} ${rowClass} ${
                  isDragTarget ? "ring-2 ring-[#4eb8c6] bg-[#f3f9fb] scale-[0.99]" : ""
                } ${draggedId === widget.id ? "opacity-55" : ""}`}
                data-widget-id={widget.id}
              >
                {/* Widget Header with Drag Handle, Presets & Remove Button */}
                <div className="v2-card-h flex items-center justify-between gap-2 bg-[#f8fbfd] rounded-t-[12px] py-2 px-3 select-none">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="v2-nav-handle cursor-grab active:cursor-grabbing"
                      title="גרור להזזת הווידג׳ט"
                    >
                      <GripVertical className="w-4 h-4" />
                    </span>
                    <h2 className="font-bold text-sm text-[#1a2e52] truncate">{widget.title}</h2>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Quick Width Presets */}
                    <div className="hidden sm:flex items-center bg-[#eaf3f6] rounded-md p-0.5 border border-[#d2e4ea]">
                      {WIDTH_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => updateWidget(widget.id, { colSpan: preset.cols })}
                          className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                            widget.colSpan === preset.cols
                              ? "bg-[#1b3a78] text-white font-bold"
                              : "text-[#5f7384] hover:text-[#1a2e52]"
                          }`}
                          title={`רוחב ${preset.label}`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    {/* Height & Mobile Size Popover Toggle */}
                    <button
                      type="button"
                      onClick={() => setCustomizeOpen(isCustomizing ? null : widget.id)}
                      className={`v2-icon !w-6 !h-6 ${isCustomizing ? "!bg-[#d8f0f4] !border-[#1b3a78]" : ""}`}
                      title="התאמת גודל (רוחב וגובה)"
                      aria-label={`התאם גודל ${widget.title}`}
                    >
                      <SlidersHorizontal className="w-3 h-3" />
                    </button>

                    {/* Delete / Hide Widget */}
                    <button
                      type="button"
                      onClick={() => updateWidget(widget.id, { hidden: true })}
                      className="v2-icon !w-6 !h-6 hover:!bg-red-50 hover:!text-red-700 hover:!border-red-200"
                      title="הסר ווידג׳ט מהלוח (ניתן לשחזור)"
                      aria-label={`הסר ${widget.title}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Optional Expanded Size Bar */}
                {isCustomizing && (
                  <div className="bg-[#eaf3f6] border-b border-[#d2e4ea] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[#5f7384]">רוחב:</span>
                      {WIDTH_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => updateWidget(widget.id, { colSpan: p.cols })}
                          className={`px-2 py-0.5 rounded border text-xs ${
                            widget.colSpan === p.cols
                              ? "bg-[#1b3a78] text-white border-[#1b3a78] font-bold"
                              : "bg-white text-[#1a2e52] border-[#d2e4ea]"
                          }`}
                        >
                          {p.label} ({p.cols}/12)
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[#5f7384]">גובה:</span>
                      {HEIGHT_PRESETS.map((hp) => (
                        <button
                          key={hp.key}
                          type="button"
                          onClick={() => updateWidget(widget.id, { rowSpan: hp.key })}
                          className={`px-2 py-0.5 rounded border text-xs ${
                            widget.rowSpan === hp.key
                              ? "bg-[#1b3a78] text-white border-[#1b3a78] font-bold"
                              : "bg-white text-[#1a2e52] border-[#d2e4ea]"
                          }`}
                        >
                          {hp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Widget Body */}
                <div className="p-3.5 flex-1 overflow-auto">{renderWidgetContent(widget.id)}</div>

                {/* Corner Snap-Resize Drag Handle */}
                <div
                  onMouseDown={(e) => startResizeDrag(e, widget)}
                  className="absolute bottom-1 left-1 w-4 h-4 cursor-nwse-resize opacity-40 hover:opacity-100 flex items-end justify-start p-0.5"
                  title="גרור לשינוי רוחב וגובה בהצמדה לרשת"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" className="text-[#1b3a78]">
                    <path d="M0 10 L10 10 L0 0 Z" fill="currentColor" />
                  </svg>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
