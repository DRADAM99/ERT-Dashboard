"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { arrayUnion, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Bell, MessageCircle } from "lucide-react";
import { db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useData } from "@/app/context/DataContext";
import { useToast } from "@/components/ui/use-toast";
import { createTask } from "@/lib/createTask";
import { createUserNotification, notifyUsersInDepartment } from "@/lib/notifications";
import { DEFAULT_TASK_CATEGORIES, phoneHref } from "@/lib/residents";
import { formatDateTime, formatDuration, relativeTime, toDate } from "@/components/v2/format";
import { TaskTabs } from "@/components/TaskTabs";

const TASK_PRIORITIES = ["דחוף", "רגיל", "נמוך"];
const TASK_STATUSES = ["מחכה", "בטיפול", "טופל"];
const RESIDENT_TASK_STATUSES = ["כולם בסדר", "זקוקים לסיוע", "לא בטוח"];

const emptyForm = {
  title: "",
  subtitle: "",
  priority: "רגיל",
  category: "",
  department: "",
  status: "מחכה",
  date: "",
  time: "",
  link: "",
};

function splitDue(value) {
  const date = toDate(value);
  if (!date) return { date: "", time: "" };
  return {
    date: date.toLocaleDateString("en-CA"),
    time: date.toTimeString().slice(0, 5),
  };
}

function defaultDue() {
  const now = new Date();
  return {
    date: now.toLocaleDateString("en-CA"),
    time: now.toTimeString().slice(0, 5),
  };
}

function normalizeFilter(value) {
  if (value === "mine" || value === "שלי") return "שלי";
  if (value === "others" || value === "אחרים") return "אחרים";
  if (value === "all" || value === "הכל") return "הכל";
  return "שלי";
}

function isMineTask(task, department, uid) {
  const dept = (department || "").trim();
  const taskDept = (task.department || "").trim();
  const assignTo = (task.assignTo || "").trim();
  const category = (task.category || "").trim();
  if (dept && (taskDept === dept || assignTo === dept || category === dept)) return true;
  return Boolean(uid && task.creatorId === uid);
}

function statusOptions(task) {
  if (task?.residentId) return RESIDENT_TASK_STATUSES;
  return TASK_STATUSES;
}

function externalLink(href) {
  if (!href) return "";
  return href.startsWith("http") ? href : `https://${href}`;
}

export default function TasksWorkspace({ openTaskId, startNew }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { tasks, currentUserData, taskCategories, eventLogs } = useData();
  const { toast } = useToast();
  const alias = currentUserData?.alias || currentUser?.email || "";
  const department = currentUserData?.department || "";
  const role = currentUserData?.role || "";
  const columns = taskCategories?.length ? taskCategories : DEFAULT_TASK_CATEGORIES;
  const [queryText, setQueryText] = useState("");
  const [taskFilter, setTaskFilter] = useState("שלי");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedCategories, setSelectedCategories] = useState(columns);
  const [showDone, setShowDone] = useState(false);
  const [showOverdue, setShowOverdue] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [replyText, setReplyText] = useState("");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [boardView, setBoardView] = useState("kanban");
  const [inlineReplyId, setInlineReplyId] = useState(null);
  const [inlineReplyText, setInlineReplyText] = useState("");
  const skipSave = useRef(true);
  const draggingRef = useRef(false);
  const openedFromQuery = useRef(null);
  const startedNewFromQuery = useRef(false);
  const catMenuRef = useRef(null);

  useEffect(() => {
    setSelectedCategories((prev) => {
      const valid = (prev || []).filter((item) => columns.includes(item));
      return valid.length ? valid : columns;
    });
  }, [columns]);

  const fillFormFromTask = (task) => {
    const due = splitDue(task.dueDate);
    setForm({
      title: task.title || "",
      subtitle: task.subtitle || "",
      priority: task.priority || "רגיל",
      category: task.category || task.department || columns[0] || "",
      department: task.department || task.assignTo || task.category || department || columns[0] || "",
      status: task.status || (task.done ? "טופל" : "מחכה"),
      date: due.date,
      time: due.time,
      link: task.link || "",
    });
    setReplyText("");
  };

  const openNew = (category) => {
    const due = defaultDue();
    setForm({
      ...emptyForm,
      category: category || columns[0] || "",
      department: department || category || columns[0] || "",
      date: due.date,
      time: due.time,
    });
    setEditingId(null);
    setReplyText("");
    setAdding(true);
  };

  useEffect(() => {
    if (!prefsLoaded || !startNew || startedNewFromQuery.current) return;
    startedNewFromQuery.current = true;
    openNew(columns[0]);
  }, [prefsLoaded, startNew, columns]);

  useEffect(() => {
    if (!prefsLoaded || !openTaskId || openedFromQuery.current === openTaskId) return;
    const task = (tasks || []).find((item) => item.id === openTaskId);
    if (!task) return;
    openedFromQuery.current = openTaskId;
    fillFormFromTask(task);
    setEditingId(task.id);
    setAdding(true);
    setTaskFilter("הכל");
    if (task.done) setShowDone(true);
    if (task.category && columns.includes(task.category)) {
      setSelectedCategories((prev) => (prev.includes(task.category) ? prev : [...prev, task.category]));
    }
  }, [prefsLoaded, openTaskId, tasks, columns]);

  useEffect(() => {
    if (!currentUser) {
      setPrefsLoaded(true);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : {};
        if (data.tm_taskFilter) setTaskFilter(normalizeFilter(data.tm_taskFilter));
        if (data.tm_taskPriorityFilter) setPriorityFilter(data.tm_taskPriorityFilter);
        if (Array.isArray(data.tm_selectedTaskCategories) && data.tm_selectedTaskCategories.length) {
          setSelectedCategories(data.tm_selectedTaskCategories);
        }
        if (typeof data.tm_taskSearchTerm === "string") setQueryText(data.tm_taskSearchTerm);
        if (typeof data.tm_showDoneTasks === "boolean") setShowDone(data.tm_showDoneTasks);
        if (typeof data.tm_showOverdueEffects === "boolean") setShowOverdue(data.tm_showOverdueEffects);
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!prefsLoaded || !currentUser) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setDoc(
      doc(db, "users", currentUser.uid),
      {
        tm_taskFilter: taskFilter,
        tm_taskPriorityFilter: priorityFilter,
        tm_selectedTaskCategories: selectedCategories,
        tm_taskSearchTerm: queryText,
        tm_showDoneTasks: showDone,
        tm_showOverdueEffects: showOverdue,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  }, [prefsLoaded, currentUser, taskFilter, priorityFilter, selectedCategories, queryText, showDone, showOverdue]);

  useEffect(() => {
    if (!currentUser) {
      setArchivedTasks([]);
      return undefined;
    }
    const unsubscribe = onSnapshot(collection(db, "archivedTasks"), (snapshot) => {
      setArchivedTasks(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!catMenuOpen) return undefined;
    const onDoc = (event) => {
      if (!catMenuRef.current?.contains(event.target)) setCatMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [catMenuOpen]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const rows = (tasks || []).filter((task) => {
      if (!showDone && task.done) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
      if (selectedCategories.length && !selectedCategories.includes(task.category)) return false;
      const mine = isMineTask(task, department, currentUser?.uid);
      if (taskFilter === "שלי" && !mine) return false;
      if (taskFilter === "אחרים" && mine) return false;
      if (q) {
        const hay = `${task.title || ""} ${task.subtitle || ""} ${task.category || ""} ${task.residentName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      const dateA = toDate(a.dueDate)?.getTime() ?? Infinity;
      const dateB = toDate(b.dueDate)?.getTime() ?? Infinity;
      return dateA - dateB;
    });
  }, [tasks, showDone, priorityFilter, selectedCategories, taskFilter, department, currentUser, queryText]);

  const visibleColumns = useMemo(() => {
    if (!selectedCategories.length) return columns;
    const next = columns.filter((col) => selectedCategories.includes(col));
    return next.length ? next : columns;
  }, [columns, selectedCategories]);

  const grouped = useMemo(() => {
    const map = {};
    visibleColumns.forEach((col) => {
      map[col] = [];
    });
    filtered.forEach((task) => {
      const fallback = columns.includes("אחר") ? "אחר" : visibleColumns[0];
      const col = visibleColumns.includes(task.category)
        ? task.category
        : visibleColumns.includes(fallback)
          ? fallback
          : visibleColumns[0];
      if (!map[col]) map[col] = [];
      map[col].push(task);
    });
    return map;
  }, [filtered, visibleColumns, columns]);

  const eventLabel = (task) => {
    const event = (eventLogs || []).find((item) => item.id === task.eventId);
    return event?.description || "אירוע מקושר";
  };

  const isOverdue = (task) => {
    if (!showOverdue || task.done || !task.dueDate) return false;
    const due = toDate(task.dueDate);
    return due && due < new Date();
  };

  const isOverdue12h = (task) => {
    if (!isOverdue(task)) return false;
    const due = toDate(task.dueDate);
    return due && due.getTime() < Date.now() - 12 * 60 * 60 * 1000;
  };

  const openEdit = (task) => {
    fillFormFromTask(task);
    setEditingId(task.id);
    setAdding(true);
  };

  const closeForm = () => {
    setAdding(false);
    setEditingId(null);
    setForm(emptyForm);
    setReplyText("");
    if (openTaskId || startNew) router.replace("/tasks", { scroll: false });
  };

  const syncLinkedStatus = async (task, newStatus) => {
    if (task.eventId) {
      await updateDoc(doc(db, "eventLogs", task.eventId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        lastUpdater: alias,
      }).catch(() => {});
    }
    if (task.residentId) {
      await updateDoc(doc(db, "residents", task.residentId), {
        סטטוס: newStatus,
        updatedAt: serverTimestamp(),
        lastUpdater: alias,
      }).catch(() => {});
    }
  };

  const drop = async (category, taskId) => {
    if (!taskId) return;
    const task = (tasks || []).find((item) => item.id === taskId);
    if (!task || task.category === category) return;
    try {
      await updateDoc(doc(db, "tasks", taskId), {
        category,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      toast({ title: "שגיאה בעדכון קטגוריה", description: error.message, variant: "destructive" });
    }
  };

  const toggleDone = async (task, event) => {
    event?.stopPropagation?.();
    const checked = !task.done;
    const now = new Date();
    const newStatus = checked ? "טופל" : "בטיפול";
    await updateDoc(doc(db, "tasks", task.id), {
      done: checked,
      status: task.residentId ? task.status || newStatus : newStatus,
      completedAt: checked ? now : null,
      completedBy: checked ? alias : null,
      updatedAt: now,
    });
    if (task.eventId) {
      await updateDoc(doc(db, "eventLogs", task.eventId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        lastUpdater: alias,
      }).catch(() => {});
    }
    if (checked && task.creatorId) {
      createUserNotification(task.creatorId, {
        message: `משימה הושלמה: ${task.title}`,
        type: "task",
        subType: "done",
        link: `/tasks?open=${task.id}`,
      });
    }
  };

  const submitTask = async (event) => {
    event.preventDefault();
    if (!currentUser || !form.title.trim()) return;
    const dueDate = form.date ? new Date(`${form.date}T${form.time || "09:00"}`) : null;
    try {
      if (editingId) {
        const task = (tasks || []).find((item) => item.id === editingId);
        const updateData = {
          title: form.title.trim(),
          subtitle: form.subtitle,
          priority: form.priority,
          category: form.category,
          department: form.department || form.category,
          assignTo: form.department || form.category,
          status: form.status,
          link: form.link,
          updatedAt: serverTimestamp(),
        };
        if (dueDate) updateData.dueDate = dueDate.toISOString();
        await updateDoc(doc(db, "tasks", editingId), updateData);
        if (task) await syncLinkedStatus(task, form.status);
        toast({ title: "משימה עודכנה" });
      } else {
        await createTask({
          currentUser,
          alias,
          department,
          fallbackCategories: columns,
          taskData: {
            title: form.title.trim(),
            subtitle: form.subtitle,
            priority: form.priority,
            category: form.category,
            department: form.department || form.category,
            assignTo: form.department || form.category,
            status: form.status,
            dueDate,
            link: form.link,
          },
        });
        toast({ title: "משימה נוצרה" });
      }
      closeForm();
    } catch (error) {
      toast({ title: "שגיאה בשמירת משימה", description: error.message, variant: "destructive" });
    }
  };

  const addReply = async () => {
    if (!editingId || !replyText.trim() || !currentUser) return;
    await postReply(editingId, replyText);
    setReplyText("");
  };

  const postReply = async (taskId, textValue) => {
    if (!taskId || !textValue.trim() || !currentUser) return;
    const now = new Date();
    const task = (tasks || []).find((item) => item.id === taskId);
    const text = textValue.trim();
    await updateDoc(doc(db, "tasks", taskId), {
      replies: arrayUnion({
        text,
        timestamp: now,
        userId: currentUser.uid,
        userAlias: alias,
        isRead: false,
      }),
      hasNewReply: true,
      lastReplyAt: now,
      updatedAt: now,
    });
    if (task?.residentId) {
      await updateDoc(doc(db, "residents", task.residentId), {
        comments: arrayUnion({
          text: `[תגובה ממשימה] ${text}`,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias,
          fromTaskId: taskId,
        }),
        hasNewComment: true,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    if (task?.creatorId && task.creatorId !== currentUser.uid) {
      createUserNotification(task.creatorId, {
        message: `תגובה חדשה על משימה: ${task.title}`,
        type: "task",
        subType: "replied",
        link: `/tasks?open=${task.id}`,
      });
    }
    toast({ title: "תגובה נשלחה" });
  };

  const changeCardStatus = async (task, newStatus, event) => {
    event?.stopPropagation?.();
    if (!task || !newStatus || task.status === newStatus) return;
    try {
      await updateDoc(doc(db, "tasks", task.id), {
        status: newStatus,
        done: newStatus === "טופל",
        updatedAt: serverTimestamp(),
      });
      await syncLinkedStatus(task, newStatus);
    } catch (error) {
      toast({ title: "שגיאה בעדכון סטטוס", description: error.message, variant: "destructive" });
    }
  };

  const submitInlineReply = async (task, event) => {
    event?.stopPropagation?.();
    if (!inlineReplyText.trim()) return;
    await postReply(task.id, inlineReplyText);
    setInlineReplyText("");
    setInlineReplyId(null);
  };

  const nudge = async (task) => {
    const target = task || (editingId ? (tasks || []).find((item) => item.id === editingId) : null);
    if (!target || !currentUser) return;
    const now = new Date();
    await updateDoc(doc(db, "tasks", target.id), {
      nudges: arrayUnion({ timestamp: now, userId: currentUser.uid, userAlias: alias }),
      lastNudgedAt: now,
      updatedAt: now,
    });
    if (target.department) {
      await notifyUsersInDepartment(target.department, {
        message: `תזכורת למשימה: ${target.title}`,
        type: "task",
        subType: "created",
        link: `/tasks?open=${target.id}`,
      });
    }
    toast({ title: "תזכורת נשלחה" });
  };

  const clearDone = async () => {
    const done = (tasks || []).filter((task) =>
      task.done && (
        task.userId === currentUser?.uid ||
        task.creatorId === currentUser?.uid ||
        task.assignTo === currentUser?.email ||
        task.assignTo === alias
      )
    );
    await Promise.all(
      done.map(async (task) => {
        await setDoc(doc(db, "archivedTasks", task.id), {
          ...task,
          completedByAlias: task.completedByAlias || task.completedBy || task.creatorAlias || alias,
          archivedAt: new Date(),
        });
        await deleteDoc(doc(db, "tasks", task.id));
      })
    );
    setClearConfirm(false);
    toast({ title: "משימות שבוצעו הועברו לארכיון" });
  };

  const restoreTask = async (archivedTask) => {
    if (role !== "admin") {
      toast({ title: "רק אדמין יכול לשחזר משימות", variant: "destructive" });
      return;
    }
    try {
      const { archivedAt: _archivedAt, ...rest } = archivedTask;
      await setDoc(doc(db, "tasks", archivedTask.id), {
        ...rest,
        done: false,
        completedAt: null,
        completedBy: null,
        archivedAt: null,
        updatedAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, "archivedTasks", archivedTask.id));
      toast({ title: "משימה שוחזרה" });
    } catch (error) {
      toast({ title: "שגיאה בשחזור", description: error.message, variant: "destructive" });
    }
  };

  const editingTask = editingId ? (tasks || []).find((item) => item.id === editingId) : null;
  const highlightId = openTaskId || editingId;

  const TaskLinks = ({ task }) => {
    const tel = phoneHref(task.residentPhone);
    return (
      <div className="v2-task-links">
        {task.residentId && (
          <div className="v2-task-resident" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
            <Link className="v2-task-link" href={`/residents?open=${task.residentId}`}>
              תושב: {task.residentName || "פתח כרטיס"}
            </Link>
            {(task.residentPhone || task.residentNeighborhood) && (
              <div className="v2-task-resident-meta">
                {task.residentPhone && (
                  tel ? <a href={tel} className="v2-phone">{task.residentPhone}</a> : <span>{task.residentPhone}</span>
                )}
                {task.residentNeighborhood && <span>שכונה: {task.residentNeighborhood}</span>}
              </div>
            )}
          </div>
        )}
        {task.eventId && (
          <Link
            className="v2-task-link"
            href={`/events?open=${task.eventId}`}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {eventLabel(task)}
          </Link>
        )}
        {task.link && (
          <a
            className="v2-task-link"
            href={externalLink(task.link)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            קישור חיצוני
          </a>
        )}
      </div>
    );
  };

  const renderTaskCard = (task, { compact = false } = {}) => {
    const unread = Array.isArray(task.replies) && task.replies.some((reply) => reply && reply.isRead === false && reply.userId !== currentUser?.uid);
    const dueAbs = formatDateTime(task.dueDate);
    return (
      <div
        key={task.id}
        className={`v2-task-item ${highlightId === task.id ? "ring-2 ring-[var(--v2-cyan)]" : ""} ${task.done ? "done" : ""} ${isOverdue12h(task) ? "overdue-12" : isOverdue(task) ? "overdue" : ""} ${compact ? "is-compact" : ""}`}
        draggable={!compact}
        onDragStart={compact ? undefined : (e) => {
          draggingRef.current = true;
          e.dataTransfer.setData("taskId", task.id);
          e.dataTransfer.setData("text/plain", task.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={compact ? undefined : () => {
          window.setTimeout(() => { draggingRef.current = false; }, 150);
        }}
        onClick={() => {
          if (draggingRef.current) return;
          openEdit(task);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <strong className="min-w-0 flex-1">
            {unread && <i className="v2-task-unread inline-block align-middle ms-1" title="תגובה חדשה" />}
            {task.title}
            {unread ? <span className="v2-task-new"> (חדש)</span> : null}
          </strong>
          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            {!task.done && (
              <button
                className="v2-btn v2-btn-icon"
                type="button"
                title="שלח תזכורת"
                aria-label="שלח תזכורת"
                onClick={() => nudge(task)}
              >
                <Bell className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              className="v2-btn v2-btn-sm"
              type="button"
              onClick={(e) => toggleDone(task, e)}
            >
              {task.done ? "↩" : "✓"}
            </button>
          </div>
        </div>
        {task.subtitle && <div style={{ color: "var(--v2-muted)", fontSize: 12, marginTop: 4 }}>{task.subtitle}</div>}
        <div className="v2-task-card-controls" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <select
            className="v2-select v2-select-sm"
            value={task.status || (task.done ? "טופל" : "מחכה")}
            onChange={(e) => changeCardStatus(task, e.target.value, e)}
            aria-label="סטטוס משימה"
          >
            {statusOptions(task).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button
            className="v2-btn v2-btn-sm"
            type="button"
            title="הוסף תגובה"
            onClick={() => {
              setInlineReplyId((prev) => (prev === task.id ? null : task.id));
              setInlineReplyText("");
            }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>תגובה</span>
          </button>
        </div>
        {inlineReplyId === task.id && (
          <div className="v2-inline-reply" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <textarea
              className="v2-textarea"
              rows={2}
              value={inlineReplyText}
              onChange={(e) => setInlineReplyText(e.target.value)}
              placeholder="כתוב תגובה…"
            />
            <div className="v2-row mt-1">
              <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={(e) => submitInlineReply(task, e)}>שלח</button>
              <button className="v2-btn v2-btn-sm" type="button" onClick={() => setInlineReplyId(null)}>ביטול</button>
            </div>
          </div>
        )}
        <div className="meta" style={{ color: "var(--v2-muted)", fontSize: 11, marginTop: 4 }}>
          {[
            task.priority,
            dueAbs || relativeTime(task.dueDate || task.createdAt),
            task.department || task.assignTo || null,
            task.creatorAlias || null,
            task.replies?.length ? `${task.replies.length} תגובות` : null,
            task.nudges?.length ? "תזכורת" : null,
          ].filter(Boolean).join(" · ")}
        </div>
        {currentUser && (
          <div className="mt-1" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <TaskTabs taskId={task.id} currentUser={currentUser} />
          </div>
        )}
        <TaskLinks task={task} />
      </div>
    );
  };

  return (
    <div>
      <div className="v2-toolbar">
        <div>
          <h1 className="v2-h1">משימות</h1>
          <p className="v2-sub">{filtered.length} משימות מוצגות</p>
        </div>
        <div className="v2-row">
          <div className="v2-seg">
            <button type="button" className={boardView === "kanban" ? "on" : ""} onClick={() => setBoardView("kanban")} title="עבור לתצוגת קנבן">
              תצוגה מלאה
            </button>
            <button type="button" className={boardView === "list" ? "on" : ""} onClick={() => setBoardView("list")} title="עבור לתצוגה מקוצרת">
              תצוגה מוקטנת
            </button>
          </div>
          <button className="v2-btn v2-btn-primary" type="button" onClick={() => openNew(columns[0])}>
            + משימה
          </button>
        </div>
      </div>

      <div className="v2-filters">
        <div className="v2-seg">
          <button type="button" className={taskFilter === "שלי" ? "on" : ""} onClick={() => setTaskFilter("שלי")}>המחלקה שלי</button>
          <button type="button" className={taskFilter === "הכל" ? "on" : ""} onClick={() => setTaskFilter("הכל")}>הכל</button>
          <button type="button" className={taskFilter === "אחרים" ? "on" : ""} onClick={() => setTaskFilter("אחרים")}>אחרים</button>
        </div>
        <label className="v2-toggle">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          כולל שבוצעו
        </label>
        <label className="v2-toggle">
          <input type="checkbox" checked={showOverdue} onChange={(e) => setShowOverdue(e.target.checked)} />
          סימון באיחור
        </label>
        <select className="v2-search" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">כל העדיפויות</option>
          {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="relative" ref={catMenuRef}>
          <button className="v2-btn v2-btn-sm" type="button" onClick={() => setCatMenuOpen((open) => !open)}>קטגוריה ▾</button>
          {catMenuOpen && (
            <div className="v2-menu">
              {columns.map((category) => (
                <button
                  key={category}
                  type="button"
                  className="v2-check"
                  onClick={() => setSelectedCategories((prev) => prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category])}
                >
                  <span className="flex-1">{category}</span>
                  {selectedCategories.includes(category) ? "✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        <input className="v2-search v2-q" placeholder="חפש משימות..." value={queryText} onChange={(e) => setQueryText(e.target.value)} />
        <button className="v2-btn v2-btn-sm" type="button" disabled={!(tasks || []).some((task) => task.done)} onClick={() => setClearConfirm(true)}>ארכיון שבוצעו</button>
        <button className="v2-btn v2-btn-sm" type="button" onClick={() => setShowHistory(true)}>היסטוריה</button>
      </div>

      {boardView === "list" ? (
        <div className="v2-card v2-task-list">
          {filtered.length === 0 && <p className="v2-sub p-4">אין משימות להצגה.</p>}
          {filtered.map((task) => renderTaskCard(task, { compact: true }))}
        </div>
      ) : (
        <div className="v2-board">
          {visibleColumns.map((col) => (
            <div
              key={col}
              className="v2-col"
              data-category={col}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                drop(col, e.dataTransfer.getData("taskId") || e.dataTransfer.getData("text/plain"));
              }}
            >
              <h4>
                <span>{col} <span>{grouped[col]?.length || 0}</span></span>
                <button className="v2-btn v2-btn-sm" type="button" title={`הוסף ל${col}`} onClick={() => openNew(col)}>+</button>
              </h4>
              {(grouped[col] || []).map((task) => renderTaskCard(task))}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="v2-modal" onClick={closeForm}>
          <div className="v2-card max-w-lg max-h-[90vh] overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={submitTask}>
              <h2 className="v2-h1">{editingId ? "עריכת משימה" : "משימה חדשה"}</h2>
              <div className="v2-fields">
                <label className="span-2">
                  <span className="v2-label">כותרת</span>
                  <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </label>
                <label className="span-2">
                  <span className="v2-label">פירוט</span>
                  <textarea className="v2-textarea" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
                </label>
                <label>
                  <span className="v2-label">עדיפות</span>
                  <select className="v2-search" style={{ width: "100%" }} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {TASK_PRIORITIES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span className="v2-label">מחלקה</span>
                  <select className="v2-search" style={{ width: "100%" }} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                    {columns.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span className="v2-label">קטגוריה</span>
                  <select className="v2-search" style={{ width: "100%" }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {columns.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span className="v2-label">סטטוס</span>
                  <select className="v2-search" style={{ width: "100%" }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {statusOptions(editingTask).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  <span className="v2-label">תאריך</span>
                  <input className="v2-search" type="date" style={{ width: "100%" }} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </label>
                <label>
                  <span className="v2-label">שעה</span>
                  <input className="v2-search" type="time" style={{ width: "100%" }} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </label>
                <label className="span-2">
                  <span className="v2-label">קישור</span>
                  <input className="v2-search" style={{ width: "100%", minWidth: 0 }} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
                </label>
              </div>
              {editingTask && (
                <label className="v2-toggle mb-3">
                  <input type="checkbox" checked={!!editingTask.done} onChange={(e) => toggleDone(editingTask, e)} />
                  בוצע
                </label>
              )}
              {editingTask && <TaskLinks task={editingTask} />}
              {editingTask && currentUser && (
                <div className="mb-3">
                  <TaskTabs taskId={editingTask.id} currentUser={currentUser} />
                </div>
              )}
              <div className="v2-row">
                <button className="v2-btn v2-btn-primary" type="submit">שמירה</button>
                <button className="v2-btn" type="button" onClick={closeForm}>ביטול</button>
              </div>
            </form>
            {editingTask && (
              <div className="v2-sec">
                <h3>תגובות</h3>
                {(editingTask.replies || []).map((reply, index) => (
                  <div key={index} className="mb-2 rounded-lg border border-[var(--v2-line)] p-2 text-sm">
                    <div className="text-[var(--v2-muted)]">{reply.userAlias} · {relativeTime(reply.timestamp)}</div>
                    <div>{reply.text}</div>
                  </div>
                ))}
                <textarea
                  className="v2-textarea"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="כתוב תגובה…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addReply();
                    }
                  }}
                />
                <div className="v2-row mt-2">
                  <button className="v2-btn v2-btn-sm" type="button" onClick={addReply}>שלח תגובה</button>
                  {!editingTask.done && (
                    <button className="v2-btn v2-btn-sm" type="button" onClick={() => nudge(editingTask)}>תזכורת</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {clearConfirm && (
        <div className="v2-modal" onClick={() => setClearConfirm(false)}>
          <div className="v2-card max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="v2-h1">להעביר לארכיון?</h2>
            <p className="v2-sub">המשימות שבוצעו שלך יועברו לארכיון וימחקו מהלוח.</p>
            <div className="v2-row">
              <button className="v2-btn v2-btn-primary" type="button" onClick={clearDone}>אישור</button>
              <button className="v2-btn" type="button" onClick={() => setClearConfirm(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="v2-modal" onClick={() => setShowHistory(false)}>
          <div className="v2-card max-w-lg max-h-[80vh] overflow-hidden p-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="v2-h1">היסטוריית משימות שבוצעו</h2>
            <div className="v2-history">
              {archivedTasks.length === 0 && <p className="v2-sub">אין משימות בהיסטוריה.</p>}
              {[...archivedTasks]
                .sort((a, b) => (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0))
                .map((task) => {
                  const createdAt = toDate(task.createdAt);
                  const completedAt = toDate(task.completedAt);
                  const duration = createdAt && completedAt ? formatDuration(completedAt.getTime() - createdAt.getTime()) : "";
                  const latestReply = Array.isArray(task.replies) && task.replies.length
                    ? task.replies.reduce((latest, curr) => {
                      const currTime = toDate(curr.timestamp)?.getTime() || 0;
                      const latestTime = toDate(latest?.timestamp)?.getTime() || 0;
                      return currTime > latestTime ? curr : latest;
                    }, null)
                    : null;
                  return (
                    <div key={task.id} className="mb-2 rounded-lg border border-[var(--v2-line)] p-3 text-sm">
                      <div className="font-semibold">{task.title}{task.subtitle ? ` — ${task.subtitle}` : ""}</div>
                      {latestReply?.text && <div className="mt-1 text-[var(--v2-accent)]">{latestReply.text}</div>}
                      <div className="mt-1 text-[var(--v2-muted)]">
                        בוצע על ידי {task.completedByAlias || task.completedBy || "לא ידוע"}
                        {completedAt ? ` בתאריך ${formatDateTime(completedAt)}` : ""}
                        {duration ? ` · משך: ${duration}` : ""}
                      </div>
                      {role === "admin" && (
                        <button className="v2-btn v2-btn-sm mt-2" type="button" onClick={() => restoreTask(task)}>
                          שחזר משימה
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
            <div className="v2-row">
              <button className="v2-btn" type="button" onClick={() => setShowHistory(false)}>סגור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
