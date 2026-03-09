"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../firebase";
import { useAuth } from "../context/AuthContext";
import {
  collection,
  onSnapshot,
  getDoc,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";
import Papa from "papaparse";
import { Download, Upload, Trash2, ArrowRight, RefreshCw } from "lucide-react";

const LEVEL_CONFIG = {
  error: { label: "שגיאה", bg: "bg-red-100 text-red-800 border-red-200" },
  warn: { label: "אזהרה", bg: "bg-orange-100 text-orange-800 border-orange-200" },
  info: { label: "מידע", bg: "bg-blue-100 text-blue-800 border-blue-200" },
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
  return d.toLocaleDateString("he-IL") + " " + d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
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

export default function AdminLogsPage() {
  const { currentUser } = useAuth();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);

  const importRef = useRef(null);

  // Auth + role check
  useEffect(() => {
    if (!currentUser) {
      router.push("/login");
      return;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (snap.exists() && snap.data().role === "admin") {
          setIsAdmin(true);
        } else {
          router.push("/");
        }
      } catch {
        router.push("/");
      } finally {
        setAuthChecked(true);
      }
    })();
  }, [currentUser, router]);

  // Real-time subscription to greenEyesLog
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "greenEyesLog"), orderBy("ts", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoadingLogs(false);
    }, () => setLoadingLogs(false));
    return () => unsub();
  }, [isAdmin]);

  // Unique event IDs for the event filter dropdown
  const eventIds = useMemo(() => {
    const ids = [...new Set(logs.map((l) => l.eventId).filter(Boolean))];
    return ids.sort();
  }, [logs]);

  // Filtered rows
  const filtered = useMemo(() => {
    const lower = searchText.toLowerCase();
    return logs.filter((l) => {
      if (levelFilter !== "all" && l.level !== levelFilter) return false;
      if (eventFilter !== "all" && l.eventId !== eventFilter) return false;
      if (lower) {
        const searchable = `${l.message || ""} ${l.eventId || ""} ${l.level || ""}`.toLowerCase();
        if (!searchable.includes(lower)) return false;
      }
      return true;
    });
  }, [logs, searchText, levelFilter, eventFilter]);

  // CSV Export
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

  // CSV Import
  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        try {
          const rows = result.data;
          let count = 0;
          for (const row of rows) {
            const payload = {
              eventId: row.eventId || "imported",
              level: row.level || "info",
              message: row.message || "",
              data: row.data ? (() => { try { return JSON.parse(row.data); } catch { return row.data; } })() : null,
              ts: serverTimestamp(),
            };
            await addDoc(collection(db, "greenEyesLog"), payload);
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

  // Delete all logs
  const handleDeleteAll = async () => {
    setDeleting(true);
    try {
      const snap = await getDocs(collection(db, "greenEyesLog"));
      const allDocs = snap.docs;
      // Batch in groups of 500
      for (let i = 0; i < allDocs.length; i += 500) {
        const batch = writeBatch(db);
        allDocs.slice(i, i + 500).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      toast({ title: "כל הלוגים נמחקו", description: `${allDocs.length} רשומות נמחקו` });
    } catch (err) {
      toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm animate-pulse">בודק הרשאות…</p>
      </div>
    );
  }

  const errorCount = logs.filter((l) => l.level === "error").length;
  const warnCount = logs.filter((l) => l.level === "warn").length;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <Toaster />

      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/")}
          title="חזרה לדשבורד"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold flex-1">יומן לוגים — Green Eyes</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{logs.length} סה"כ</span>
          {errorCount > 0 && (
            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">{errorCount} שגיאות</span>
          )}
          {warnCount > 0 && (
            <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">{warnCount} אזהרות</span>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

        {/* Toolbar */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
                <Input
                  placeholder="חיפוש בהודעות…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-56 text-right"
                />
                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-36 text-right">
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
                  <SelectTrigger className="w-44 text-right">
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
                    className="text-gray-500 hover:text-gray-700 gap-1"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    נקה
                  </Button>
                )}
                {filtered.length !== logs.length && (
                  <span className="text-sm text-gray-400">{filtered.length} מוצגות</span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 items-center shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={filtered.length === 0}
                  className="gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  ייצוא CSV
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => importRef.current?.click()}
                  disabled={importing}
                  className="gap-1.5"
                >
                  {importing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  ייבוא CSV
                </Button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportFile}
                />

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={logs.length === 0}
                  className="gap-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                  מחק הכל
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Log Table */}
        <Card>
          <CardContent className="p-0 overflow-hidden">
            {loadingLogs ? (
              <div className="py-16 text-center text-gray-400 animate-pulse">טוען לוגים…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                {logs.length === 0 ? "אין לוגים עדיין" : "אין תוצאות לסינון הנוכחי"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-600 text-right">
                      <th className="px-4 py-3 font-semibold whitespace-nowrap w-44">זמן</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap w-36">מזהה אירוע</th>
                      <th className="px-4 py-3 font-semibold whitespace-nowrap w-24">רמה</th>
                      <th className="px-4 py-3 font-semibold">הודעה</th>
                      <th className="px-4 py-3 font-semibold w-72">נתונים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log, i) => (
                      <tr
                        key={log.id}
                        className={`border-b last:border-b-0 transition-colors ${
                          log.level === "error"
                            ? "bg-red-50/50 hover:bg-red-50"
                            : log.level === "warn"
                            ? "bg-orange-50/30 hover:bg-orange-50/60"
                            : i % 2 === 0
                            ? "bg-white hover:bg-gray-50"
                            : "bg-gray-50/50 hover:bg-gray-100/50"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-gray-500 text-xs font-mono whitespace-nowrap">
                          {formatTs(log.ts)}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-gray-600 whitespace-nowrap">
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{log.eventId || "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <LevelBadge level={log.level} />
                        </td>
                        <td className="px-4 py-2.5 text-gray-800 leading-snug">{log.message || "—"}</td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <DataCell data={log.data} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-gray-400 text-center pb-4">
          מתעדכן בזמן אמת • לחץ על נתונים בטבלה להרחבה
        </p>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיקת כל הלוגים</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            פעולה זו תמחק את כל <strong>{logs.length}</strong> הרשומות לצמיתות. לא ניתן לשחזר לוגים שנמחקו.
          </p>
          <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? "מוחק…" : "מחק הכל"}
            </Button>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
