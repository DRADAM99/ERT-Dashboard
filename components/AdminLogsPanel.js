"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import Papa from "papaparse";
import { Download, Upload, Trash2, X, RefreshCw, AlertTriangle } from "lucide-react";

const LEVEL_CONFIG = {
  error: { label: "שגיאה", bg: "bg-red-100 text-red-800 border-red-200" },
  warn:  { label: "אזהרה", bg: "bg-orange-100 text-orange-800 border-orange-200" },
  info:  { label: "מידע",  bg: "bg-blue-100 text-blue-800 border-blue-200" },
};

function LevelBadge({ level }) {
  const cfg = LEVEL_CONFIG[level] || { label: level, bg: "bg-gray-100 text-gray-700 border-gray-200" };
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function formatTs(ts) {
  if (!ts) return "—";
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("he-IL") +
    " " +
    d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  );
}

function DataCell({ data }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return <span className="text-gray-400 text-xs">—</span>;
  const str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const short = str.length > 60 ? str.slice(0, 60) + "…" : str;
  return (
    <span
      className="font-mono text-xs cursor-pointer text-gray-600 hover:text-gray-900 transition-colors"
      onClick={() => setExpanded((p) => !p)}
      title="לחץ להרחבה"
    >
      {expanded ? str : short}
    </span>
  );
}

export default function AdminLogsPanel({ open, onClose }) {
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);

  const importRef = useRef(null);

  // Subscribe when panel is open
  useEffect(() => {
    if (!open) return;
    setLoadingLogs(true);
    const q = query(collection(db, "greenEyesLog"), orderBy("ts", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadingLogs(false);
      },
      () => setLoadingLogs(false)
    );
    return () => unsub();
  }, [open]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSearchText("");
      setLevelFilter("all");
      setEventFilter("all");
      setConfirmDelete(false);
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const eventIds = useMemo(() => {
    const ids = [...new Set(logs.map((l) => l.eventId).filter(Boolean))];
    return ids.sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const lower = searchText.toLowerCase();
    return logs.filter((l) => {
      if (levelFilter !== "all" && l.level !== levelFilter) return false;
      if (eventFilter !== "all" && l.eventId !== eventFilter) return false;
      if (lower) {
        const s = `${l.message || ""} ${l.eventId || ""} ${l.level || ""}`.toLowerCase();
        if (!s.includes(lower)) return false;
      }
      return true;
    });
  }, [logs, searchText, levelFilter, eventFilter]);

  const handleExportCSV = () => {
    const rows = filtered.map((l) => ({
      timestamp: formatTs(l.ts),
      eventId: l.eventId || "",
      level: l.level || "",
      message: l.message || "",
      data: l.data ? JSON.stringify(l.data) : "",
    }));
    const csv = Papa.unparse(rows, { header: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `green-eyes-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV יוצא בהצלחה", description: `${rows.length} רשומות יוצאו` });
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        try {
          let count = 0;
          for (const row of result.data) {
            await addDoc(collection(db, "greenEyesLog"), {
              eventId: row.eventId || "imported",
              level: row.level || "info",
              message: row.message || "",
              data: row.data
                ? (() => { try { return JSON.parse(row.data); } catch { return row.data; } })()
                : null,
              ts: serverTimestamp(),
            });
            count++;
          }
          toast({ title: "ייבוא הושלם", description: `${count} רשומות יובאו` });
        } catch (err) {
          toast({ title: "שגיאה בייבוא", description: err.message, variant: "destructive" });
        } finally {
          setImporting(false);
          if (importRef.current) importRef.current.value = "";
        }
      },
      error: () => {
        toast({ title: "שגיאה בקריאת הקובץ", variant: "destructive" });
        setImporting(false);
      },
    });
  };

  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const snap = await getDocs(collection(db, "greenEyesLog"));
      for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      toast({ title: "כל הלוגים נמחקו", description: `${snap.docs.length} רשומות נמחקו` });
      setConfirmDelete(false);
    } catch (err) {
      toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount  = logs.filter((l) => l.level === "warn").length;

  return (
    // Full-screen backdrop
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-stretch justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div
        className="relative bg-white w-full max-w-6xl flex flex-col shadow-2xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-white shrink-0">
          <h2 className="text-base font-bold flex-1">יומן לוגים — Green Eyes</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
              {logs.length} סה"כ
            </span>
            {errorCount > 0 && (
              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                {errorCount} שגיאות
              </span>
            )}
            {warnCount > 0 && (
              <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium">
                {warnCount} אזהרות
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0" title="סגור">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Inline delete confirmation banner */}
        {confirmDelete && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border-b border-red-200 shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-800 flex-1">
              האם למחוק את כל <strong>{logs.length}</strong> הרשומות לצמיתות? לא ניתן לשחזר לוגים שנמחקו.
            </p>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={deleting}
              className="gap-1.5 shrink-0"
            >
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "מוחק…" : "אשר מחיקה"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="shrink-0"
            >
              ביטול
            </Button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap gap-2 items-center justify-between px-4 py-3 border-b bg-gray-50 shrink-0">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
            <Input
              placeholder="חיפוש בהודעות…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-52 text-right bg-white"
            />
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-32 text-right bg-white">
                <SelectValue placeholder="רמת לוג" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הרמות</SelectItem>
                <SelectItem value="info">מידע</SelectItem>
                <SelectItem value="warn">אזהרה</SelectItem>
                <SelectItem value="error">שגיאה</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-40 text-right bg-white">
                <SelectValue placeholder="אירוע" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל האירועים</SelectItem>
                {eventIds.map((id) => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchText || levelFilter !== "all" || eventFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchText(""); setLevelFilter("all"); setEventFilter("all"); }}
                className="text-gray-500 gap-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                נקה
              </Button>
            )}
            {filtered.length !== logs.length && (
              <span className="text-xs text-gray-400">{filtered.length} מוצגות</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 items-center shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={filtered.length === 0}
              className="gap-1.5 bg-white"
            >
              <Download className="h-4 w-4" />
              ייצוא CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importRef.current?.click()}
              disabled={importing}
              className="gap-1.5 bg-white"
            >
              {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              ייבוא CSV
            </Button>
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={logs.length === 0 || confirmDelete}
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              מחק הכל
            </Button>
          </div>
        </div>

        {/* Table — scrollable */}
        <div className="flex-1 overflow-auto">
          {loadingLogs ? (
            <div className="py-20 text-center text-gray-400 animate-pulse text-sm">טוען לוגים…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">
              {logs.length === 0 ? "אין לוגים עדיין" : "אין תוצאות לסינון הנוכחי"}
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100 border-b text-gray-600 text-right">
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap w-44">זמן</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap w-36">מזהה אירוע</th>
                  <th className="px-4 py-2.5 font-semibold whitespace-nowrap w-24">רמה</th>
                  <th className="px-4 py-2.5 font-semibold">הודעה</th>
                  <th className="px-4 py-2.5 font-semibold w-72">נתונים</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b last:border-b-0 transition-colors ${
                      log.level === "error"
                        ? "bg-red-50 hover:bg-red-100/70"
                        : log.level === "warn"
                        ? "bg-orange-50/60 hover:bg-orange-50"
                        : i % 2 === 0
                        ? "bg-white hover:bg-gray-50"
                        : "bg-gray-50/60 hover:bg-gray-100/60"
                    }`}
                  >
                    <td className="px-4 py-2 text-gray-500 text-xs font-mono whitespace-nowrap">
                      {formatTs(log.ts)}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono whitespace-nowrap">
                      <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{log.eventId || "—"}</span>
                    </td>
                    <td className="px-4 py-2">
                      <LevelBadge level={log.level} />
                    </td>
                    <td className="px-4 py-2 text-gray-800 leading-snug">{log.message || "—"}</td>
                    <td className="px-4 py-2 max-w-xs">
                      <DataCell data={log.data} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-400 text-center shrink-0">
          מתעדכן בזמן אמת • לחץ על נתונים בטבלה להרחבה • Esc לסגירה
        </div>
      </div>
    </div>
  );
}
