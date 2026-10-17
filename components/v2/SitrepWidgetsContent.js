"use client";

import React, { useMemo, useState } from "react";
import { Phone, Copy, Check, Plus, ChevronDown, ChevronUp, Search } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { displayResidentStatus, getFieldValue, phoneHref, residentName, residentStatus, whatsAppHref } from "@/lib/residents";
import { formatDateTime, formatDuration, toDate } from "@/components/v2/format";

export const CANONICAL_STATUSES = [
  { key: "הכל בסדר", label: "הכל בסדר", hex: "#22c55e", bg: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { key: "זקוקים לסיוע", label: "זקוקים לסיוע", hex: "#ef4444", bg: "bg-red-500", badge: "bg-red-100 text-red-800 border-red-200" },
  { key: "לא בטוח", label: "לא בטוח", hex: "#eab308", bg: "bg-amber-500", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  { key: "פצוע", label: "פצוע", hex: "#a855f7", bg: "bg-purple-500", badge: "bg-purple-100 text-purple-800 border-purple-200" },
  { key: "ללא סטטוס", label: "ללא מענה", hex: "#9ca3af", bg: "bg-slate-400", badge: "bg-slate-100 text-slate-700 border-slate-200" },
];

export function isTaskClosed(task) {
  return task?.status === "הושלם" || task?.status === "טופל" || !!task?.done;
}

export function KpiResidentsWidget({ residents, statusCounts }) {
  const needHelp = (statusCounts["זקוקים לסיוע"] || 0) + (statusCounts["פצוע"] || 0) + (statusCounts["לא בטוח"] || 0);
  const verified = residents.length - (statusCounts["ללא סטטוס"] || 0);
  const pct = residents.length ? Math.round((verified / residents.length) * 100) : 0;
  return (
    <div className="flex flex-col justify-between h-full gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-3xl font-extrabold text-[#1a2e52]">{needHelp}</div>
          <div className="text-xs text-[#5f7384]">זקוקים למענה / סיוע מתוך {residents.length} תושבים</div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
          {pct}% דיווחו
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">זקוקים לסיוע: {statusCounts["זקוקים לסיוע"] || 0}</span>
        <span className="rounded bg-purple-100 px-2 py-0.5 font-semibold text-purple-800">פצועים: {statusCounts["פצוע"] || 0}</span>
        <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">לא בטוח: {statusCounts["לא בטוח"] || 0}</span>
      </div>
    </div>
  );
}

export function KpiTasksWidget({ tasks, tasksSummary }) {
  const openCount = tasks.filter((t) => !isTaskClosed(t)).length;
  const closedCount = tasks.length - openCount;
  return (
    <div className="flex flex-col justify-between h-full gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-3xl font-extrabold text-[#1a2e52]">{openCount}</div>
          <div className="text-xs text-[#5f7384]">משימות פתוחות ({closedCount} הושלמו)</div>
        </div>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
          סה״כ {tasks.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-[#5f7384]">
        <span>תגובה ממוצעת: <strong className="text-[#1a2e52]">{formatDuration(tasksSummary.avgResponseTime)}</strong></span>
        <span>·</span>
        <span>סיום ממוצע: <strong className="text-[#1a2e52]">{formatDuration(tasksSummary.avgCompletionTime)}</strong></span>
      </div>
    </div>
  );
}

export function KpiEventsWidget({ eventLogs }) {
  const latest = eventLogs.length ? eventLogs[eventLogs.length - 1] : null;
  return (
    <div className="flex flex-col justify-between h-full gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-3xl font-extrabold text-[#1a2e52]">{eventLogs.length}</div>
          <div className="text-xs text-[#5f7384]">אירועים מתועדים ביומן חמ״ל</div>
        </div>
        {latest && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
            {latest.department || 'חמ"ל'}
          </span>
        )}
      </div>
      {latest ? (
        <div className="truncate text-xs text-[#1a2e52] bg-[#f3f9fb] border border-[#d2e4ea] rounded px-2 py-1" title={latest.description}>
          <strong>אחרון:</strong> {latest.description}
        </div>
      ) : (
        <div className="text-xs text-[#5f7384]">אין אירועים מתועדים</div>
      )}
    </div>
  );
}

export function StatusPercentBarWidget({ residents, statusCounts }) {
  const total = residents.length || 1;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-[#5f7384]">
        <span>פילוח כלל התושבים לפי צבע סטטוס ({residents.length} תושבים)</span>
        <span className="font-semibold text-[#1a2e52]">
          ירוק בעיניים (דיווחו): {residents.length ? Math.round(((residents.length - (statusCounts["ללא סטטוס"] || 0)) / total) * 100) : 0}%
        </span>
      </div>
      <div className="h-7 w-full rounded-xl overflow-hidden flex border border-[#d2e4ea] bg-slate-100 shadow-inner">
        {CANONICAL_STATUSES.map((st) => {
          const count = statusCounts[st.key] || 0;
          const pct = (count / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={st.key}
              style={{ width: `${pct}%`, backgroundColor: st.hex }}
              className="h-full flex items-center justify-center text-[11px] font-bold text-white transition-all overflow-hidden whitespace-nowrap"
              title={`${st.label}: ${count} (${Math.round(pct)}%)`}
            >
              {pct >= 9 ? `${Math.round(pct)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {CANONICAL_STATUSES.map((st) => {
          const count = statusCounts[st.key] || 0;
          const pct = residents.length ? Math.round((count / total) * 100) : 0;
          return (
            <div key={st.key} className={`rounded-lg border p-2 text-right ${st.badge}`}>
              <div className="flex items-center justify-between gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.hex }} />
                <span className="text-xs font-bold">{pct}%</span>
              </div>
              <div className="mt-1 text-lg font-extrabold leading-none">{count}</div>
              <div className="text-[11px] font-medium truncate mt-0.5">{st.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DeptHeadsWidget({ deptHeads, onChangeDeptHeads }) {
  const updateRow = (idx, field, val) => {
    const next = deptHeads.map((row, i) => (i === idx ? { ...row, [field]: val } : row));
    onChangeDeptHeads(next);
  };
  const totalActive = deptHeads.reduce((sum, r) => sum + (Number(r.activeCount) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[#5f7384] mb-1">
        <span>ראשי מכלולים ובעלי תפקידים (מתעדכן ונשמר אוטומטית)</span>
        <span className="font-bold text-[#1a2e52]">סה״כ פעילים בצוותים: {totalActive}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="v2-data text-xs">
          <thead>
            <tr>
              <th>מכלול</th>
              <th>ראש מכלול</th>
              <th>טלפון וקשר</th>
              <th>סטטוס</th>
              <th>פעילים</th>
            </tr>
          </thead>
          <tbody>
            {deptHeads.map((row, idx) => {
              const dial = phoneHref(row.phone);
              const wa = whatsAppHref(row.phone);
              return (
                <tr key={row.dept}>
                  <td className="font-bold whitespace-nowrap">{row.dept}</td>
                  <td>
                    <input
                      className="v2-search text-xs py-1 px-2 w-full min-w-[110px]"
                      value={row.headName}
                      onChange={(e) => updateRow(idx, "headName", e.target.value)}
                      aria-label={`ראש מכלול ${row.dept}`}
                    />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <input
                        className="v2-search text-xs py-1 px-2 w-28"
                        value={row.phone}
                        onChange={(e) => updateRow(idx, "phone", e.target.value)}
                        aria-label={`טלפון ${row.dept}`}
                      />
                      {dial && (
                        <a href={dial} className="v2-btn v2-btn-icon v2-btn-call !w-7 !h-7" title="חייג">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                      {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="v2-btn v2-btn-icon v2-btn-wa !w-7 !h-7" title="וואטסאפ">
                          <FaWhatsapp className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td>
                    <select
                      className="v2-select v2-select-sm text-xs"
                      value={row.status}
                      onChange={(e) => updateRow(idx, "status", e.target.value)}
                    >
                      <option value='בחמ"ל'>בחמ"ל</option>
                      <option value="בשטח">בשטח</option>
                      <option value="זמין">זמין</option>
                      <option value="לא זמין">לא זמין</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      className="v2-search text-xs py-1 px-2 w-14 text-center"
                      value={row.activeCount}
                      onChange={(e) => updateRow(idx, "activeCount", Number(e.target.value) || 0)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PublicAnnouncementWidget({ announcements, onUpdateAnnouncements }) {
  const latest = announcements[0] || { text: "", timestamp: new Date().toISOString(), author: 'חמ"ל' };
  const [draft, setDraft] = useState(latest.text);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const handleSaveNew = () => {
    if (!draft.trim()) return;
    const entry = {
      id: `ann-${Date.now()}`,
      timestamp: new Date().toISOString(),
      author: 'חמ"ל יישובי',
      text: draft.trim(),
    };
    onUpdateAnnouncements([entry, ...announcements]);
  };

  const handleCopyWhatsApp = () => {
    const formatted = `*הודעת חמ״ל יישובי (${formatDateTime(latest.timestamp)})*\n\n${draft || latest.text}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(formatted).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5f7384]">
        <span>עודכן לאחרונה: <strong className="text-[#1a2e52]">{formatDateTime(latest.timestamp)}</strong> ({latest.author})</span>
        <div className="flex gap-1.5">
          <button type="button" className="v2-btn v2-btn-sm v2-btn-primary" onClick={handleSaveNew}>
            <Plus className="w-3.5 h-3.5" /> שמור ועדכן הודעה
          </button>
          <button type="button" className="v2-btn v2-btn-sm v2-btn-wa" onClick={handleCopyWhatsApp}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "הועתק!" : "העתק לוואטסאפ"}
          </button>
        </div>
      </div>
      <textarea
        className="v2-textarea text-sm leading-relaxed bg-[#f8fbfd]"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="הדבק או הקלד כאן את ההודעה האחרונה שיצאה לתושבים..."
      />
      {announcements.length > 1 && (
        <div>
          <button
            type="button"
            className="text-xs font-semibold text-[#1b3a78] hover:underline flex items-center gap-1"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            הודעות קודמות ({announcements.length - 1})
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto border-t border-[#d2e4ea] pt-2">
              {announcements.slice(1).map((item) => (
                <div key={item.id} className="rounded bg-[#f3f9fb] p-2 text-xs border border-[#d2e4ea]">
                  <div className="text-[10px] text-[#5f7384] font-semibold">{formatDateTime(item.timestamp)} · {item.author}</div>
                  <div className="mt-0.5 text-[#1a2e52]">{item.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GreenEyesTableWidget({ residents }) {
  const [hoodFilter, setHoodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("neighborhoods");
  const [expandedHood, setExpandedHood] = useState(null);

  const neighborhoods = useMemo(() => {
    const set = new Set();
    residents.forEach((r) => {
      const h = getFieldValue(r, "שכונה") || "ללא שכונה";
      set.add(h);
    });
    return Array.from(set);
  }, [residents]);

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return residents.filter((r) => {
      const hood = getFieldValue(r, "שכונה") || "ללא שכונה";
      const st = displayResidentStatus(residentStatus(r));
      const notes = String(getFieldValue(r, "הערות") || "");
      if (hoodFilter !== "all" && hood !== hoodFilter) return false;
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (specialOnly && !notes.trim()) return false;
      if (!q) return true;
      const hay = `${residentName(r)} ${hood} ${notes} ${getFieldValue(r, "טלפון")} ${getFieldValue(r, "מספר בית")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [residents, hoodFilter, statusFilter, specialOnly, search]);

  const hoodStats = useMemo(() => {
    const map = {};
    filteredResidents.forEach((r) => {
      const hood = getFieldValue(r, "שכונה") || "ללא שכונה";
      if (!map[hood]) {
        map[hood] = {
          hood,
          total: 0,
          "הכל בסדר": 0,
          "זקוקים לסיוע": 0,
          "לא בטוח": 0,
          פצוע: 0,
          "ללא סטטוס": 0,
          rows: [],
        };
      }
      const st = displayResidentStatus(residentStatus(r));
      map[hood].total += 1;
      if (map[hood][st] !== undefined) map[hood][st] += 1;
      map[hood].rows.push(r);
    });
    return Object.values(map).sort((a, b) => b["זקוקים לסיוע"] + b.פצוע - (a["זקוקים לסיוע"] + a.פצוע));
  }, [filteredResidents]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select className="v2-select v2-select-sm text-xs" value={hoodFilter} onChange={(e) => setHoodFilter(e.target.value)} aria-label="סינון לפי שכונה">
            <option value="all">כל השכונות ({neighborhoods.length})</option>
            {neighborhoods.map((h) => (
              <option key={h} value={h}>{h}</option>
            ))}
          </select>
          <select className="v2-select v2-select-sm text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="סינון לפי סטטוס">
            <option value="all">כל הסטטוסים</option>
            {CANONICAL_STATUSES.map((st) => (
              <option key={st.key} value={st.key}>{st.label}</option>
            ))}
          </select>
          <label className="v2-toggle text-xs bg-[#f3f9fb] px-2 py-1 rounded border border-[#d2e4ea]">
            <input type="checkbox" checked={specialOnly} onChange={(e) => setSpecialOnly(e.target.checked)} />
            עם הערות / אוכלוסייה מיוחדת
          </label>
          <div className="relative">
            <input
              className="v2-search text-xs py-1 pr-7 pl-2 min-w-[150px]"
              placeholder="חיפוש שם, בית, הערה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="w-3.5 h-3.5 text-[#5f7384] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
        <div className="v2-seg">
          <button type="button" className={viewMode === "neighborhoods" ? "on" : ""} onClick={() => setViewMode("neighborhoods")}>
            ריכוז שכונות
          </button>
          <button type="button" className={viewMode === "residents" ? "on" : ""} onClick={() => setViewMode("residents")}>
            טבלת תושבים ({filteredResidents.length})
          </button>
        </div>
      </div>

      {viewMode === "neighborhoods" ? (
        <div className="overflow-x-auto">
          <table className="v2-data text-xs">
            <thead>
              <tr>
                <th>שכונה</th>
                <th>סה״כ</th>
                <th>% ירוק בעיניים</th>
                <th>הכל בסדר</th>
                <th>זקוקים לסיוע</th>
                <th>פצוע</th>
                <th>לא בטוח</th>
                <th>ללא מענה</th>
              </tr>
            </thead>
            <tbody>
              {hoodStats.map((h) => {
                const reported = h.total - h["ללא סטטוס"];
                const pct = h.total ? Math.round((reported / h.total) * 100) : 0;
                const isExp = expandedHood === h.hood;
                return (
                  <React.Fragment key={h.hood}>
                    <tr onClick={() => setExpandedHood(isExp ? null : h.hood)} className={isExp ? "sel" : ""}>
                      <td className="font-bold flex items-center gap-1">
                        {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {h.hood}
                      </td>
                      <td className="font-semibold">{h.total}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-emerald-700 w-9">{pct}%</span>
                          <div className="v2-bar w-20">
                            <span className="bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                      <td><span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">{h["הכל בסדר"]}</span></td>
                      <td><span className={`rounded px-2 py-0.5 font-bold ${h["זקוקים לסיוע"] ? "bg-red-100 text-red-800" : "text-slate-400"}`}>{h["זקוקים לסיוע"]}</span></td>
                      <td><span className={`rounded px-2 py-0.5 font-bold ${h.פצוע ? "bg-purple-100 text-purple-800" : "text-slate-400"}`}>{h.פצוע}</span></td>
                      <td><span className={`rounded px-2 py-0.5 font-bold ${h["לא בטוח"] ? "bg-amber-100 text-amber-800" : "text-slate-400"}`}>{h["לא בטוח"]}</span></td>
                      <td><span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{h["ללא סטטוס"]}</span></td>
                    </tr>
                    {isExp && (
                      <tr className="v2-res-expand-row">
                        <td colSpan={8}>
                          <div className="p-2.5 bg-[#f8fbfd] border-b border-[#d2e4ea]">
                            <div className="text-[11px] font-bold mb-1.5 text-[#1b3a78]">תושבים בשכונת {h.hood}:</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {h.rows.map((r) => {
                                const st = displayResidentStatus(residentStatus(r));
                                const stMeta = CANONICAL_STATUSES.find((c) => c.key === st) || CANONICAL_STATUSES[4];
                                return (
                                  <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-[#d2e4ea] bg-white px-2.5 py-1.5 text-xs">
                                    <div className="min-w-0">
                                      <div className="font-bold truncate">{residentName(r)} {getFieldValue(r, "מספר בית") ? `(בית ${getFieldValue(r, "מספר בית")})` : ""}</div>
                                      {getFieldValue(r, "הערות") && <div className="text-[11px] text-red-700 truncate">{getFieldValue(r, "הערות")}</div>}
                                    </div>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border shrink-0 ${stMeta.badge}`}>
                                      {stMeta.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-72">
          <table className="v2-data text-xs">
            <thead>
              <tr>
                <th>שם תושב</th>
                <th>שכונה ובית</th>
                <th>סטטוס</th>
                <th>הערות / צורך מיוחד</th>
                <th>טלפון</th>
              </tr>
            </thead>
            <tbody>
              {filteredResidents.map((r) => {
                const st = displayResidentStatus(residentStatus(r));
                const stMeta = CANONICAL_STATUSES.find((c) => c.key === st) || CANONICAL_STATUSES[4];
                return (
                  <tr key={r.id}>
                    <td className="font-bold">{residentName(r)}</td>
                    <td>{getFieldValue(r, "שכונה")} {getFieldValue(r, "מספר בית") ? `· בית ${getFieldValue(r, "מספר בית")}` : ""}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold border ${stMeta.badge}`}>
                        {stMeta.label}
                      </span>
                    </td>
                    <td className="text-[#1a2e52]">{getFieldValue(r, "הערות") || "—"}</td>
                    <td className="whitespace-nowrap">{getFieldValue(r, "טלפון") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function EventSummaryBriefWidget({ eventLogs, residents, tasks, statusCounts, commanderNotes, onChangeCommanderNotes }) {
  const firstEvent = eventLogs[0] || null;
  const totalRes = residents.length || 1;
  const accounted = residents.length - (statusCounts["ללא סטטוס"] || 0);
  const accountedPct = residents.length ? Math.round((accounted / totalRes) * 100) : 0;
  const openTasks = tasks.filter((t) => !isTaskClosed(t));
  const urgentOpen = openTasks.filter((t) => t.priority === "דחוף");

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
      <div className="rounded-xl border border-[#d2e4ea] bg-[#f8fbfd] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm text-[#1b3a78]">1. מה קרה עד כה (תקציר האירוע)</h4>
          {firstEvent && (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
              פתיחה: {formatDateTime(firstEvent.createdAt).split(" ")[1] || formatDateTime(firstEvent.createdAt)}
            </span>
          )}
        </div>
        <ul className="space-y-1.5 list-disc pr-4 text-[#1a2e52]">
          {eventLogs.slice(-4).map((ev) => (
            <li key={ev.id} className="leading-snug">
              <span className="font-semibold text-[#5f7384]">{formatDateTime(ev.createdAt).split(" ")[1] || ""} [{ev.department || 'חמ"ל'}]:</span>{" "}
              {ev.description}
            </li>
          ))}
        </ul>
        <div className="pt-1">
          <label className="block text-[11px] font-semibold text-[#5f7384] mb-1">דגשי מפקד החמ״ל (מתעדכן לדו״ח):</label>
          <textarea
            className="v2-textarea text-xs bg-white !min-h-[52px]"
            rows={2}
            value={commanderNotes}
            onChange={(e) => onChangeCommanderNotes(e.target.value)}
            placeholder="הוסף תקציר מפקד / החלטות מרכזיות..."
          />
        </div>
      </div>

      <div className="rounded-xl border border-[#d2e4ea] bg-[#f8fbfd] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm text-emerald-900">2. איפה אנחנו עומדים כעת (תמונת מצב מבצעית)</h4>
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">חי</span>
        </div>
        <ul className="space-y-2 text-[#1a2e52]">
          <li className="flex items-start gap-2 bg-white p-2 rounded border border-[#d2e4ea]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
            <div>
              <strong>אימות תושבים (ירוק בעיניים):</strong> {accountedPct}% מהתושבים ({accounted} מתוך {residents.length}) דיווחו על מצבם. נותרו {statusCounts["ללא סטטוס"] || 0} ללא מענה.
            </div>
          </li>
          <li className="flex items-start gap-2 bg-white p-2 rounded border border-[#d2e4ea]">
            <span className="w-2 h-2 rounded-full bg-red-500 mt-1 shrink-0" />
            <div>
              <strong>נפגעים וזקוקים לסיוע:</strong> {statusCounts["פצוע"] || 0} פצועים ו-{statusCounts["זקוקים לסיוע"] || 0} תושבים המבקשים סיוע ({statusCounts["לא בטוח"] || 0} בסטטוס לא בטוח).
            </div>
          </li>
          <li className="flex items-start gap-2 bg-white p-2 rounded border border-[#d2e4ea]">
            <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
            <div>
              <strong>עומס משימות וצווארי בקבוק:</strong> {openTasks.length} משימות פתוחות כעת ({urgentOpen.length} דחופות). מיקוד נוכחי: אספקת גנרטורים בהרחבה הצפונית וסבב ביקורי בית למנותקי קשר.
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function DeptTasksSummaryWidget({ tasksSummary }) {
  const entries = Object.entries(tasksSummary.categories || {});
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-[#f3f9fb] border border-[#d2e4ea] p-2.5">
          <div className="text-[11px] text-[#5f7384]">זמן תגובה ממוצע</div>
          <div className="text-base font-extrabold text-[#1a2e52]">{formatDuration(tasksSummary.avgResponseTime)}</div>
        </div>
        <div className="rounded-lg bg-[#f3f9fb] border border-[#d2e4ea] p-2.5">
          <div className="text-[11px] text-[#5f7384]">זמן סיום משימה</div>
          <div className="text-base font-extrabold text-[#1a2e52]">{formatDuration(tasksSummary.avgCompletionTime)}</div>
        </div>
      </div>
      <div className="space-y-2.5">
        {entries.map(([dept, counts]) => {
          const total = counts.open + counts.closed || 1;
          const closedPct = Math.round((counts.closed / total) * 100);
          return (
            <div key={dept} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-bold">{dept}</span>
                <span className="text-[#5f7384]">
                  <strong className="text-orange-600">{counts.open} פתוחות</strong> · <strong className="text-emerald-700">{counts.closed} הושלמו</strong> ({closedPct}%)
                </span>
              </div>
              <div className="v2-bar h-2.5">
                <span className="bg-emerald-500" style={{ width: `${(counts.closed / total) * 100}%` }} />
                <span className="bg-orange-400" style={{ width: `${(counts.open / total) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LiveTimelineWidget({ timeline }) {
  const [layout, setLayout] = useState("horizontal");
  const [zoom, setZoom] = useState(1);
  const [filters, setFilters] = useState({
    log_update: true,
    task_created: true,
    task_done: true,
    resident_status: true,
  });

  const filterMeta = [
    { key: "log_update", label: "יומן" },
    { key: "task_created", label: "משימות נוצרו" },
    { key: "task_done", label: "משימות הושלמו" },
    { key: "resident_status", label: "סטטוס תושבים" },
  ];

  const filtered = timeline.filter((item) => filters[item.type]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {filterMeta.map((f) => (
            <label key={f.key} className="v2-toggle text-xs bg-[#f3f9fb] px-2.5 py-1 rounded-full border border-[#d2e4ea]">
              <input
                type="checkbox"
                checked={filters[f.key]}
                onChange={(e) => setFilters((p) => ({ ...p, [f.key]: e.target.checked }))}
              />
              {f.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {layout === "horizontal" && (
            <>
              <button type="button" className="v2-btn v2-btn-sm" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))}>−</button>
              <button type="button" className="v2-btn v2-btn-sm" onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(1)))}>+</button>
            </>
          )}
          <button
            type="button"
            className="v2-btn v2-btn-sm"
            onClick={() => setLayout((l) => (l === "horizontal" ? "vertical" : "horizontal"))}
          >
            {layout === "horizontal" ? "תצוגה אנכית" : "תצוגה אופקית"}
          </button>
        </div>
      </div>

      {layout === "horizontal" ? (
        <div className="v2-timeline-h">
          <div className="v2-timeline-h-track" style={{ minWidth: `${Math.max(filtered.length, 1) * 155 * zoom}px` }}>
            <div className="v2-timeline-h-line" />
            {filtered.map((item, idx) => {
              const side = idx % 2 === 0 ? "up" : "down";
              return (
                <div key={item.id} className={`v2-timeline-h-item ${side}`}>
                  <span className={`v2-timeline-h-dot ${item.color}`} />
                  <span className="v2-timeline-h-stem" />
                  <span className="v2-timeline-h-card">
                    <strong>{formatDateTime(item.timestamp).split(" ")[1] || formatDateTime(item.timestamp)}</strong>
                    <div className="mt-1 line-clamp-2">{item.content}</div>
                    {item.meta && <div className="meta mt-1 text-[10px] text-[#5f7384]">{item.meta}</div>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {filtered.map((item) => (
            <div key={item.id} className="v2-tl">
              <div className="t">{formatDateTime(item.timestamp)}</div>
              <div className="b">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`} />
                  <span className="font-medium">{item.content}</span>
                </div>
                {item.meta && <div className="meta">{item.meta}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
