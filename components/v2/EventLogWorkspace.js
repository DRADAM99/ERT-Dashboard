"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDoc, arrayUnion, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import Papa from "papaparse";
import { db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useData } from "@/app/context/DataContext";
import { useToast } from "@/components/ui/use-toast";
import { createTask } from "@/lib/createTask";
import { notifyUsersInDepartment } from "@/lib/notifications";
import { DEFAULT_TASK_CATEGORIES, getFieldValue, residentName, residentStatus } from "@/lib/residents";
import { departmentChipClass, eventStatusDotClass, formatDateTime, formatTime, toDate } from "@/components/v2/format";
import RecordOverlay from "@/components/v2/RecordOverlay";

const EVENT_STATUSES = ["מחכה", "בטיפול", "טופל"];
const TASK_PRIORITIES = ["דחוף", "רגיל", "נמוך"];

const emptyForm = {
  reporter: "",
  recipient: "",
  description: "",
  department: "",
  status: "מחכה",
  link: "",
  residentId: "",
};

function pickField(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  return EVENT_STATUSES.includes(status) ? status : "מחכה";
}

function externalHref(link) {
  if (!link) return "";
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function residentFieldsFor(residentId, residents) {
  if (!residentId) return {};
  const row = (residents || []).find((item) => item.id === residentId);
  if (!row) return { residentId };
  const status = residentStatus(row);
  return {
    residentId,
    residentName: residentName(row),
    residentPhone: getFieldValue(row, "טלפון") || "",
    residentNeighborhood: getFieldValue(row, "שכונה") || "",
    residentStatus: status === "ללא סטטוס" ? "" : status,
  };
}

function taskPayloadFromEvent(event, extras = {}) {
  const category = extras.category || extras.department || event.department || "";
  return {
    title: extras.title || event.description || "",
    subtitle: event.link ? `קישור: ${event.link}` : "",
    priority: extras.priority || "רגיל",
    category,
    department: extras.department || category,
    status: extras.status || event.status || "מחכה",
    dueDate: new Date(),
    eventId: event.id,
    eventStatus: event.status || extras.status || "מחכה",
    link: event.link || "",
    ...(event.residentId && {
      residentId: event.residentId,
      residentName: event.residentName || "",
      residentPhone: event.residentPhone || "",
      residentNeighborhood: event.residentNeighborhood || "",
      residentStatus: event.residentStatus || "",
    }),
  };
}

function rowFromCsv(row, alias) {
  const description = pickField(row, ["description", "תיאור", "תיאור האירוע", "Description"]);
  if (!description) return null;
  return {
    reporter: pickField(row, ["reporter", "מדווח", "המדווח"]) || alias,
    recipient: pickField(row, ["recipient", "נמען", "מקבל", "מקבל הדיווח"]),
    description,
    department: pickField(row, ["department", "מחלקה"]),
    status: normalizeStatus(pickField(row, ["status", "סטטוס"])),
    link: pickField(row, ["link", "קישור"]),
    residentId: pickField(row, ["residentId", "תושב"]),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastUpdater: alias,
    history: [],
  };
}

export default function EventLogWorkspace({ openEventId }) {
  const { currentUser } = useAuth();
  const { eventLogs, tasks, residents, currentUserData, taskCategories } = useData();
  const { toast } = useToast();
  const alias = currentUserData?.alias || currentUser?.email || "";
  const department = currentUserData?.department || "";
  const categories = taskCategories?.length ? taskCategories : DEFAULT_TASK_CATEGORIES;
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [historyText, setHistoryText] = useState("");
  const [taskDept, setTaskDept] = useState(categories[0] || "");
  const [taskPriority, setTaskPriority] = useState("רגיל");
  const [taskStatus, setTaskStatus] = useState("מחכה");
  const [residentQuery, setResidentQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const openedRef = useRef(null);

  useEffect(() => {
    setForm((prev) => ({ ...prev, recipient: alias, reporter: alias }));
  }, [alias]);

  useEffect(() => {
    if (!openEventId || openedRef.current === openEventId) return;
    const found = (eventLogs || []).find((item) => item.id === openEventId);
    if (!found) return;
    setSelectedId(found.id);
    openedRef.current = openEventId;
  }, [openEventId, eventLogs]);

  const liveSelected = selectedId
    ? (eventLogs || []).find((item) => item.id === selectedId) || null
    : null;

  useEffect(() => {
    if (!liveSelected) {
      setEditing(false);
      setHistoryText("");
      return;
    }
    setTaskDept(liveSelected.department || categories[0] || "");
    setTaskPriority("רגיל");
    setTaskStatus(liveSelected.status || "מחכה");
    setHistoryText("");
    setEditing(false);
    setResidentQuery("");
  }, [liveSelected?.id, categories]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return [...(eventLogs || [])].reverse().filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (deptFilter !== "all" && item.department !== deptFilter) return false;
      if (!q) return true;
      const hay = [
        item.description,
        item.reporter,
        item.recipient,
        item.department,
        item.lastUpdater,
        item.link,
        item.residentName,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [eventLogs, queryText, statusFilter, deptFilter]);

  const linkedTasks = useMemo(
    () => (tasks || []).filter((task) => liveSelected && task.eventId === liveSelected.id),
    [tasks, liveSelected]
  );

  const residentOptions = useMemo(() => {
    const q = residentQuery.trim().toLowerCase();
    const list = (residents || []).map((row) => ({ id: row.id, name: residentName(row) }));
    const matched = q
      ? list.filter((row) => row.name.toLowerCase().includes(q) || row.id.toLowerCase().includes(q))
      : list;
    return matched.slice(0, 80);
  }, [residents, residentQuery]);

  const selectedResident = liveSelected?.residentId
    ? (residents || []).find((row) => row.id === liveSelected.residentId) || null
    : null;
  const selectedResidentName = liveSelected?.residentName || (selectedResident ? residentName(selectedResident) : "");

  const closeOverlay = () => {
    setSelectedId(null);
    setEditing(false);
  };

  const startEdit = () => {
    if (!liveSelected) return;
    setEditForm({
      reporter: liveSelected.reporter || "",
      recipient: liveSelected.recipient || "",
      description: liveSelected.description || "",
      department: liveSelected.department || "",
      status: liveSelected.status || "מחכה",
      link: liveSelected.link || "",
      residentId: liveSelected.residentId || "",
    });
    setResidentQuery("");
    setEditing(true);
  };

  const persistEvent = async (eventId, payload) => {
    const extra = residentFieldsFor(payload.residentId, residents);
    await updateDoc(doc(db, "eventLogs", eventId), {
      reporter: payload.reporter || "",
      recipient: payload.recipient || "",
      description: payload.description || "",
      department: payload.department || "",
      status: normalizeStatus(payload.status),
      link: payload.link || "",
      ...extra,
      updatedAt: serverTimestamp(),
      lastUpdater: alias,
    });
  };

  const createDepartmentTask = async (event, extras = {}) => {
    if (!currentUser) {
      toast({ title: "יש להתחבר כדי ליצור משימה", variant: "destructive" });
      return null;
    }
    const category = extras.category || extras.department || event.department;
    if (!category) {
      toast({ title: "נא לבחור מחלקה", variant: "destructive" });
      return null;
    }
    return createTask({
      currentUser,
      alias,
      department,
      fallbackCategories: categories,
      taskData: taskPayloadFromEvent(event, { ...extras, category, department: category }),
    });
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      toast({ title: "יש להתחבר כדי לרשום אירוע", variant: "destructive" });
      return;
    }
    if (saving) return;
    setSaving(true);
    try {
      const extra = residentFieldsFor(form.residentId, residents);
      const docRef = await addDoc(collection(db, "eventLogs"), {
        reporter: form.reporter || alias,
        recipient: form.recipient || alias,
        description: form.description || "",
        department: form.department || "",
        status: normalizeStatus(form.status),
        link: form.link || "",
        ...extra,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdater: alias,
        history: [],
      });
      if (form.department) {
        await createDepartmentTask(
          { id: docRef.id, ...form, ...extra },
          { status: "מחכה", category: form.department }
        );
        await notifyUsersInDepartment(form.department, {
          message: `אירוע חדש ביומן: ${form.description}`,
          type: "event",
          subType: "newevent",
          link: `/events?open=${docRef.id}`,
        });
      }
      setForm({ ...emptyForm, reporter: alias, recipient: alias });
      setAdding(false);
      setSelectedId(docRef.id);
      toast({ title: "האירוע נרשם" });
    } catch (error) {
      toast({ title: "שגיאה ברישום אירוע", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!liveSelected || saving) return;
    setSaving(true);
    try {
      const nextStatus = normalizeStatus(editForm.status);
      const prevStatus = liveSelected.status || "מחכה";
      await persistEvent(liveSelected.id, editForm);
      if (nextStatus !== prevStatus) {
        await updateDoc(doc(db, "eventLogs", liveSelected.id), {
          history: arrayUnion({
            timestamp: new Date().toISOString(),
            text: `סטטוס שונה: ${prevStatus} → ${nextStatus}`,
            userAlias: alias,
          }),
          lastUpdater: alias,
          updatedAt: serverTimestamp(),
        });
        await syncLinkedTasks(liveSelected.id, nextStatus);
        if (editForm.department) {
          await notifyUsersInDepartment(editForm.department, {
            message: `סטטוס אירוע התעדכן: ${editForm.description || liveSelected.description} - ${nextStatus}`,
            type: "event",
            subType: "statuschange",
            link: `/events?open=${liveSelected.id}`,
          });
        }
      }
      setEditing(false);
      toast({ title: "האירוע עודכן" });
    } catch (error) {
      toast({ title: "שגיאה בעדכון אירוע", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const syncLinkedTasks = async (eventId, status) => {
    const tasksSnap = await getDocs(query(collection(db, "tasks"), where("eventId", "==", eventId)));
    await Promise.all(
      tasksSnap.docs.map((taskDoc) =>
        updateDoc(doc(db, "tasks", taskDoc.id), {
          status,
          eventStatus: status,
          updatedAt: serverTimestamp(),
        })
      )
    );
  };

  const changeStatus = async (eventId, status) => {
    if (!currentUser) return;
    const current = (eventLogs || []).find((item) => item.id === eventId);
    const prev = current?.status || "מחכה";
    if (prev === status) return;
    try {
      await updateDoc(doc(db, "eventLogs", eventId), {
        status,
        updatedAt: serverTimestamp(),
        lastUpdater: alias,
        history: arrayUnion({
          timestamp: new Date().toISOString(),
          text: `סטטוס שונה: ${prev} → ${status}`,
          userAlias: alias,
        }),
      });
      await syncLinkedTasks(eventId, status);
      if (current?.department) {
        await notifyUsersInDepartment(current.department, {
          message: `סטטוס אירוע התעדכן: ${current.description || ""} - ${status}`,
          type: "event",
          subType: "statuschange",
          link: `/events?open=${eventId}`,
        });
      }
      toast({ title: "הסטטוס עודכן" });
    } catch (error) {
      toast({ title: "שגיאה בעדכון סטטוס", description: error.message, variant: "destructive" });
    }
  };

  const addHistory = async () => {
    if (!liveSelected || !historyText.trim()) return;
    await updateDoc(doc(db, "eventLogs", liveSelected.id), {
      history: arrayUnion({
        timestamp: new Date().toISOString(),
        text: historyText.trim(),
        userAlias: alias,
      }),
      updatedAt: serverTimestamp(),
      lastUpdater: alias,
    });
    setHistoryText("");
  };

  const assignTask = async () => {
    if (!liveSelected || !taskDept || saving) return;
    setSaving(true);
    try {
      const taskId = await createDepartmentTask(liveSelected, {
        category: taskDept,
        department: taskDept,
        priority: taskPriority,
        status: taskStatus,
      });
      if (taskId) toast({ title: "משימה נוצרה מהאירוע" });
    } catch (error) {
      toast({ title: "שגיאה ביצירת משימה", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const importCsv = (file) => {
    if (!file || importing) return;
    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => String(header || "").replace(/^\uFEFF/, "").trim(),
      complete: async (result) => {
        try {
          const rows = (Array.isArray(result.data) ? result.data : [])
            .map((row) => rowFromCsv(row, alias))
            .filter(Boolean);
          if (!rows.length) {
            toast({ title: "לא נמצאו שורות לייבוא", variant: "destructive" });
            return;
          }
          const chunkSize = 20;
          for (let i = 0; i < rows.length; i += chunkSize) {
            await Promise.all(rows.slice(i, i + chunkSize).map((row) => addDoc(collection(db, "eventLogs"), row)));
          }
          toast({ title: `יובאו ${rows.length} אירועים` });
        } catch (error) {
          toast({ title: "שגיאה בייבוא", description: error.message, variant: "destructive" });
        } finally {
          setImporting(false);
        }
      },
      error: (error) => {
        setImporting(false);
        toast({ title: "שגיאה בקריאת הקובץ", description: error.message, variant: "destructive" });
      },
    });
  };

  const now = Date.now();
  const tasksByEvent = useMemo(() => {
    const map = {};
    (tasks || []).forEach((task) => {
      if (!task.eventId) return;
      if (!map[task.eventId]) map[task.eventId] = [];
      map[task.eventId].push(task);
    });
    return map;
  }, [tasks]);

  const renderResidentPicker = (value, onChange) => (
    <label className="span-2">
      <span className="v2-label">תושב מקושר</span>
      <input
        className="v2-search mb-2"
        style={{ width: "100%", minWidth: 0 }}
        value={residentQuery}
        onChange={(e) => setResidentQuery(e.target.value)}
        placeholder="חיפוש תושב…"
      />
      <select className="v2-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">ללא</option>
        {value && !residentOptions.some((row) => row.id === value) && (
          <option value={value}>{selectedResidentName || value}</option>
        )}
        {residentOptions.map((row) => (
          <option key={row.id} value={row.id}>{row.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="v2-page-fill" dir="rtl">
      <div className="v2-toolbar">
        <div>
          <h1 className="v2-h1">יומן אירועים</h1>
          <p className="v2-sub">{filtered.length} רשומות</p>
        </div>
        <div className="v2-row">
          <label className="v2-btn v2-btn-sm">
            {importing ? "מייבא…" : "ייבוא CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) importCsv(file);
              }}
            />
          </label>
          <button className="v2-btn v2-btn-primary" type="button" onClick={() => setAdding(true)}>+ אירוע</button>
        </div>
      </div>
      <div className="v2-filters">
        <select className="v2-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          {EVENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="v2-select" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="all">כל המחלקות</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <input className="v2-search v2-q" placeholder="חיפוש ביומן…" value={queryText} onChange={(e) => setQueryText(e.target.value)} />
      </div>
      <div className="v2-card min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 && (
          <p className="v2-sub p-4">{(eventLogs || []).length ? "אין תוצאות לחיפוש." : "אין רשומות ביומן."}</p>
        )}
        {filtered.map((item) => {
          const created = toDate(item.createdAt);
          const isNow = created && Math.abs(now - created.getTime()) < 30 * 60 * 1000;
          const linked = tasksByEvent[item.id] || [];
          const pending = linked.filter((task) => !task.done && (task.status === "מחכה" || !task.status)).length;
          const progress = linked.filter((task) => !task.done && task.status === "בטיפול").length;
          const done = linked.filter((task) => task.done || task.status === "טופל").length;
          return (
            <button
              key={item.id}
              type="button"
              className={`v2-appt-row ${isNow ? "is-now" : ""} ${item.status === "טופל" ? "is-done" : ""} ${selectedId === item.id ? "is-now" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="v2-appt-time">{formatTime(item.createdAt) || "--:--"}</div>
              <div className="min-w-0 flex-1">
                <div className="v2-appt-name truncate">{item.description || "ללא תיאור"}</div>
                <div className="v2-appt-meta">
                  <span className="v2-pill">
                    <i className={`v2-dot ${eventStatusDotClass(item.status)}`} />
                    {item.status || "מחכה"}
                  </span>
                  <span>{item.reporter}</span>
                  {item.department && <span className={`v2-branch ${departmentChipClass(item.department)}`}>{item.department}</span>}
                  {item.lastUpdater && <span>עדכון: {item.lastUpdater}</span>}
                  {item.residentName && <span>{item.residentName}</span>}
                  {linked.length > 0 && (
                    <span className="v2-task-dots" title={`${linked.length} משימות מקושרות`}>
                      {pending > 0 && <i className="v2-task-dot pending" />}
                      {progress > 0 && <i className="v2-task-dot progress" />}
                      {done > 0 && <i className="v2-task-dot done" />}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <RecordOverlay open={!!liveSelected} onClose={closeOverlay}>
        {liveSelected && (
          <div className="p-4" dir="rtl">
            <div className="v2-row mb-3">
              <button className="v2-btn v2-btn-sm" type="button" onClick={closeOverlay}>סגירה</button>
              {!editing && (
                <button className="v2-btn v2-btn-sm" type="button" onClick={startEdit}>עריכה</button>
              )}
            </div>
            {editing ? (
              <form onSubmit={saveEdit}>
                <h2 className="v2-h1">עריכת אירוע</h2>
                <div className="v2-fields">
                  <label>
                    <span className="v2-label">מדווח</span>
                    <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={editForm.reporter} onChange={(e) => setEditForm({ ...editForm, reporter: e.target.value })} />
                  </label>
                  <label>
                    <span className="v2-label">נמען</span>
                    <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={editForm.recipient} onChange={(e) => setEditForm({ ...editForm, recipient: e.target.value })} />
                  </label>
                  <label className="span-2">
                    <span className="v2-label">תיאור</span>
                    <textarea className="v2-textarea" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} required />
                  </label>
                  <label>
                    <span className="v2-label">מחלקה</span>
                    <select className="v2-select" value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}>
                      <option value="">ללא</option>
                      {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="v2-label">סטטוס</span>
                    <select className="v2-select" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                      {EVENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="span-2">
                    <span className="v2-label">קישור</span>
                    <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={editForm.link} onChange={(e) => setEditForm({ ...editForm, link: e.target.value })} />
                  </label>
                  {renderResidentPicker(editForm.residentId, (residentId) => setEditForm({ ...editForm, residentId }))}
                </div>
                <div className="v2-row">
                  <button className="v2-btn v2-btn-primary" type="submit" disabled={saving}>שמירה</button>
                  <button className="v2-btn" type="button" onClick={() => setEditing(false)}>ביטול</button>
                </div>
              </form>
            ) : (
              <>
                <h2 className="v2-h1">{liveSelected.description || "אירוע"}</h2>
                <p className="v2-sub">
                  {formatDateTime(liveSelected.createdAt)} · {liveSelected.reporter || "—"}
                  {liveSelected.lastUpdater ? ` · עדכון אחרון: ${liveSelected.lastUpdater}` : ""}
                </p>
                <div className="v2-fields">
                  <label>
                    <span className="v2-label">סטטוס</span>
                    <select
                      className="v2-select"
                      value={liveSelected.status || "מחכה"}
                      onChange={(e) => changeStatus(liveSelected.id, e.target.value)}
                    >
                      {EVENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="v2-label">מחלקה</span>
                    <div className="v2-search">{liveSelected.department || "—"}</div>
                  </label>
                  <label>
                    <span className="v2-label">נמען</span>
                    <div className="v2-search">{liveSelected.recipient || "—"}</div>
                  </label>
                  <label>
                    <span className="v2-label">מדווח</span>
                    <div className="v2-search">{liveSelected.reporter || "—"}</div>
                  </label>
                </div>
                <div className="v2-row mb-2">
                  {liveSelected.link && (
                    <a className="v2-btn v2-btn-sm" href={externalHref(liveSelected.link)} target="_blank" rel="noreferrer">קישור חיצוני</a>
                  )}
                  {liveSelected.residentId && (
                    <Link className="v2-btn v2-btn-sm" href={`/residents?open=${liveSelected.residentId}`}>
                      תושב: {selectedResidentName || "פתח כרטיס"}
                    </Link>
                  )}
                </div>
              </>
            )}

            <div className="v2-sec">
              <h3>עדכונים</h3>
              {(liveSelected.history || []).length === 0 && <p className="v2-sub">אין עדכונים.</p>}
              {(liveSelected.history || []).map((entry, index) => (
                <div key={`${entry.timestamp || index}-${index}`} className="v2-ev">
                  <div className="t">{formatDateTime(entry.timestamp)}</div>
                  <div className="b">
                    {entry.text}
                    {entry.userAlias && <div className="meta" style={{ color: "var(--v2-muted)", fontSize: 11, marginTop: 4 }}>{entry.userAlias}</div>}
                  </div>
                </div>
              ))}
              <textarea className="v2-textarea" value={historyText} onChange={(e) => setHistoryText(e.target.value)} placeholder="הוסף עדכון…" />
              <button className="v2-btn v2-btn-sm mt-2" type="button" onClick={addHistory} disabled={!historyText.trim()}>הוסף</button>
            </div>

            <div className="v2-sec">
              <h3>משימות מקושרות</h3>
              {linkedTasks.length === 0 && <p className="v2-sub">אין משימות מקושרות.</p>}
              {linkedTasks.map((task) => (
                <Link key={task.id} className="v2-task-item block" href={`/tasks?open=${task.id}`}>
                  <strong>{task.title || "משימה"}</strong>
                  <div className="meta">
                    {task.priority ? `${task.priority} · ` : ""}
                    {task.category || task.department || ""} · {task.done ? "טופל" : task.status || "מחכה"}
                  </div>
                </Link>
              ))}
            </div>

            <div className="v2-sec">
              <h3>צור משימה למחלקה</h3>
              <div className="v2-fields">
                <label>
                  <span className="v2-label">מחלקה</span>
                  <select className="v2-select" value={taskDept} onChange={(e) => setTaskDept(e.target.value)}>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span className="v2-label">עדיפות</span>
                  <select className="v2-select" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                    {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span className="v2-label">סטטוס</span>
                  <select className="v2-select" value={taskStatus} onChange={(e) => setTaskStatus(e.target.value)}>
                    {EVENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
              </div>
              <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={assignTask} disabled={saving || !taskDept}>
                שלח משימה
              </button>
            </div>
          </div>
        )}
      </RecordOverlay>

      {adding && (
        <div className="v2-modal" onClick={() => setAdding(false)}>
          <form className="v2-card max-h-[90vh] max-w-lg overflow-auto p-4" onClick={(e) => e.stopPropagation()} onSubmit={saveEvent} dir="rtl">
            <h2 className="v2-h1">אירוע חדש</h2>
            <div className="v2-fields">
              <label>
                <span className="v2-label">מדווח</span>
                <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={form.reporter} onChange={(e) => setForm({ ...form, reporter: e.target.value })} />
              </label>
              <label>
                <span className="v2-label">נמען</span>
                <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
              </label>
              <label className="span-2">
                <span className="v2-label">תיאור</span>
                <textarea className="v2-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </label>
              <label>
                <span className="v2-label">מחלקה</span>
                <select className="v2-select" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  <option value="">ללא</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span className="v2-label">סטטוס</span>
                <select className="v2-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {EVENT_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="span-2">
                <span className="v2-label">קישור</span>
                <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
              </label>
              {renderResidentPicker(form.residentId, (residentId) => setForm({ ...form, residentId }))}
            </div>
            <div className="v2-row">
              <button className="v2-btn v2-btn-primary" type="submit" disabled={saving}>שמירה</button>
              <button className="v2-btn" type="button" onClick={() => setAdding(false)}>ביטול</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
