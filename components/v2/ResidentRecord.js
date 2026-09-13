"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { arrayUnion, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useData } from "@/app/context/DataContext";
import { useToast } from "@/components/ui/use-toast";
import { createTask } from "@/lib/createTask";
import { createUserNotification, notifyUsersInDepartment } from "@/lib/notifications";
import {
  DEFAULT_TASK_CATEGORIES,
  EDITABLE_STATUSES,
  RESIDENTS_DEPT,
  formatResidentValue,
  getFieldValue,
  phoneHref,
  residentName,
  residentStatus,
} from "@/lib/residents";
import { formatDateTime, residentStatusDotClass } from "@/components/v2/format";

const IDENTITY_FIELDS = [
  "טלפון",
  "שכונה",
  "מספר בית",
  "הורה/ילד",
  "מסגרת",
  "מקום מסגרת",
  "תאריך לידה",
  "סטטוס מגורים",
  "הערות",
];

export default function ResidentRecord({ resident, onClose, variant = "pane" }) {
  const { currentUser } = useAuth();
  const { currentUserData, tasks, taskCategories } = useData();
  const { toast } = useToast();
  const pathname = usePathname();
  const alias = currentUserData?.alias || currentUser?.email || "";
  const department = currentUserData?.department || "";
  const sheet = variant === "sheet";
  const liveStatus = getFieldValue(resident, "סטטוס") || "NO_STATUS";
  const [status, setStatus] = useState(liveStatus || "NO_STATUS");
  const [comment, setComment] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState((taskCategories || DEFAULT_TASK_CATEGORIES)[0]);
  const [taskPriority, setTaskPriority] = useState("רגיל");
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const categories = taskCategories?.length ? taskCategories : DEFAULT_TASK_CATEGORIES;
  const onResidentsPage = pathname?.startsWith("/residents");

  useEffect(() => {
    setStatus(liveStatus || "NO_STATUS");
  }, [liveStatus]);

  useEffect(() => {
    const first = categories[0];
    if (first && !categories.includes(taskCategory)) setTaskCategory(first);
  }, [categories, taskCategory]);

  useEffect(() => {
    if (!resident?.id || (!resident.hasNewComment && !resident.hasNewReply)) return;
    updateDoc(doc(db, "residents", resident.id), {
      hasNewComment: false,
      hasNewReply: false,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }, [resident?.id, resident?.hasNewComment, resident?.hasNewReply]);

  const linkedTasks = useMemo(() => {
    const live = (tasks || []).filter((task) => task.residentId === resident?.id);
    const liveIds = new Set(live.map((task) => task.id));
    const extras = (resident?.assignedTasks || [])
      .filter((item) => item?.taskId && !liveIds.has(item.taskId))
      .map((item) => ({
        id: item.taskId,
        title: item.title,
        category: item.category,
        status: "לא בלוח",
        assignedBy: item.assignedBy,
        fromAssigned: true,
      }));
    return [...live, ...extras];
  }, [tasks, resident?.id, resident?.assignedTasks]);

  if (!resident) return null;

  const name = residentName(resident);
  const phone = getFieldValue(resident, "טלפון");
  const tel = phoneHref(phone);
  const neighborhood = getFieldValue(resident, "שכונה");

  const saveStatus = async () => {
    if (!currentUser) return;
    const newStatus = status === "NO_STATUS" ? "" : status;
    const oldStatus = getFieldValue(resident, "סטטוס") || "";
    if (newStatus === oldStatus) {
      toast({ title: "אין שינוי בסטטוס" });
      return;
    }
    setSavingStatus(true);
    try {
      const now = new Date();
      await updateDoc(doc(db, "residents", resident.id), {
        סטטוס: newStatus,
        updatedAt: now,
        lastStatusChange: {
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias,
        },
        statusHistory: arrayUnion({
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias,
        }),
      });
      const tasksSnap = await getDocs(query(collection(db, "tasks"), where("residentId", "==", resident.id)));
      await Promise.all(
        tasksSnap.docs.map((taskDoc) =>
          updateDoc(doc(db, "tasks", taskDoc.id), { residentStatus: newStatus, updatedAt: now })
        )
      );
      if (newStatus === "זקוקים לסיוע" || newStatus === "לא בטוח") {
        const payload = {
          message: `סטטוס תושב התעדכן: ${name} — ${newStatus}`,
          type: "resident",
          subType: "statusChange",
          link: `/residents?open=${resident.id}`,
        };
        await notifyUsersInDepartment(RESIDENTS_DEPT, payload);
        if (department && department !== RESIDENTS_DEPT) {
          await notifyUsersInDepartment(department, payload);
        }
      }
      toast({ title: "הסטטוס עודכן" });
    } catch (error) {
      toast({ title: "שגיאה בעדכון סטטוס", description: error.message, variant: "destructive" });
    } finally {
      setSavingStatus(false);
    }
  };

  const addComment = async () => {
    if (!comment.trim() || !currentUser || savingComment) return;
    const now = new Date();
    const text = comment.trim();
    setSavingComment(true);
    try {
      await updateDoc(doc(db, "residents", resident.id), {
        comments: arrayUnion({
          text,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias,
        }),
        updatedAt: serverTimestamp(),
      });
      const tasksSnap = await getDocs(query(collection(db, "tasks"), where("residentId", "==", resident.id)));
      await Promise.all(
        tasksSnap.docs.map(async (taskDoc) => {
          const taskData = taskDoc.data();
          await updateDoc(doc(db, "tasks", taskDoc.id), {
            replies: arrayUnion({
              text: `[הערה מתושב] ${text}`,
              timestamp: now,
              userId: currentUser.uid,
              userAlias: alias,
              isRead: false,
            }),
            hasNewReply: true,
            lastReplyAt: now,
            updatedAt: serverTimestamp(),
          });
          if (taskData.creatorId && taskData.creatorId !== currentUser.uid) {
            createUserNotification(taskData.creatorId, {
              message: `הערה חדשה על תושב במשימה: ${taskData.title || name}`,
              type: "task",
              subType: "replied",
              link: `/tasks?open=${taskDoc.id}`,
            });
          }
        })
      );
      setComment("");
      toast({ title: "ההערה נוספה" });
    } catch (error) {
      toast({ title: "שגיאה בהוספת הערה", description: error.message, variant: "destructive" });
    } finally {
      setSavingComment(false);
    }
  };

  const assignTask = async () => {
    if (!taskTitle.trim() || !currentUser) {
      toast({ title: "נא למלא כותרת משימה" });
      return;
    }
    if (savingTask) return;
    setSavingTask(true);
    try {
      const title = taskTitle.trim();
      const taskId = await createTask({
        currentUser,
        alias,
        department,
        fallbackCategories: categories,
        taskData: {
          title,
          subtitle: `תושב: ${name} - ${neighborhood}`,
          priority: taskPriority,
          category: taskCategory,
          department: taskCategory,
          status: "מחכה",
          dueDate: new Date(),
          residentId: resident.id,
          residentName: name,
          residentPhone: phone,
          residentNeighborhood: neighborhood,
          residentStatus: residentStatus(resident) === "ללא סטטוס" ? "" : residentStatus(resident),
        },
      });
      if (taskId) {
        await updateDoc(doc(db, "residents", resident.id), {
          assignedTasks: arrayUnion({
            taskId,
            title,
            category: taskCategory,
            assignedAt: new Date(),
            assignedBy: alias,
          }),
          updatedAt: new Date(),
        });
      }
      setTaskTitle("");
      toast({ title: "משימה הוקצתה" });
    } catch (error) {
      toast({ title: "שגיאה בהקצאת משימה", description: error.message, variant: "destructive" });
    } finally {
      setSavingTask(false);
    }
  };

  return (
    <aside className={sheet ? "min-h-full overflow-auto bg-white p-4" : "h-full overflow-auto bg-white p-[18px_16px]"} dir="rtl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {onClose && (
          <button className="v2-btn v2-btn-sm" type="button" onClick={onClose}>
            סגירה
          </button>
        )}
        {!onResidentsPage && (
          <Link className="v2-btn v2-btn-sm" href={`/residents?open=${resident.id}`}>
            מסך תושבים
          </Link>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-bold">{name}</h2>
          <p className="v2-sub" style={{ marginBottom: 0 }}>
            {phone || "אין טלפון"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className="v2-pill">
              <i className={`v2-dot ${residentStatusDotClass(residentStatus(resident))}`} />
              {residentStatus(resident)}
            </span>
          </div>
        </div>
        {tel && (
          <a className="v2-btn v2-btn-sm" href={tel}>
            ☎ חייג
          </a>
        )}
      </div>

      <div className="v2-fields">
        {IDENTITY_FIELDS.map((field) => (
          <label key={field} className={field === "הערות" ? "span-2" : undefined}>
            <span className="v2-label">{field}</span>
            <div className="v2-search" style={{ width: "100%", minWidth: 0 }}>
              {field === "טלפון" && tel ? (
                <a href={tel}>{formatResidentValue(getFieldValue(resident, field), field) || "—"}</a>
              ) : (
                formatResidentValue(getFieldValue(resident, field), field) || "—"
              )}
            </div>
          </label>
        ))}
        <label>
          <span className="v2-label">Event ID</span>
          <div className="v2-search" style={{ width: "100%", minWidth: 0 }}>{resident.event_id || resident.eventId || "—"}</div>
        </label>
        <label>
          <span className="v2-label">נוצר</span>
          <div className="v2-search" style={{ width: "100%", minWidth: 0 }}>{formatDateTime(resident.createdAt) || "—"}</div>
        </label>
        <label>
          <span className="v2-label">עודכן</span>
          <div className="v2-search" style={{ width: "100%", minWidth: 0 }}>
            {formatDateTime(resident.syncedAt || resident.updatedAt) || "—"}
          </div>
        </label>
      </div>

      <div className="v2-sec">
        <h3>סטטוס</h3>
        <div className="v2-row">
          <select className="v2-select" value={status || "NO_STATUS"} onChange={(e) => setStatus(e.target.value)}>
            <option value="NO_STATUS">ללא סטטוס</option>
            {EDITABLE_STATUSES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" disabled={savingStatus} onClick={saveStatus}>
            שמור סטטוס
          </button>
        </div>
        {(resident.statusHistory || []).length > 0 && (
          <div className="mt-3 space-y-2">
            {[...resident.statusHistory].reverse().map((change, index) => (
              <div key={`${change.timestamp?.seconds || change.timestamp || index}-${index}`} className="rounded-lg border border-[var(--v2-line)] bg-[var(--v2-bg)] p-2 text-sm">
                <div className="flex justify-between gap-2 text-[var(--v2-muted)]">
                  <span>{change.userAlias}</span>
                  <span>{formatDateTime(change.timestamp)}</span>
                </div>
                <div>{change.from || "ללא"} → {change.to || "ללא"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="v2-sec">
        <h3>משימות מקושרות</h3>
        {linkedTasks.length === 0 && <p className="v2-sub">אין משימות מקושרות.</p>}
        {linkedTasks.map((task) => (
          <Link key={task.id} className="v2-task-item block" href={`/tasks?open=${task.id}`}>
            <strong>{task.title}</strong>
            <div className="meta">
              {task.category} · {task.done ? "טופל" : task.status || "פתוח"}
              {task.assignedBy ? ` · ${task.assignedBy}` : ""}
            </div>
          </Link>
        ))}
        <div className="v2-fields mt-3">
          <label className="span-2">
            <span className="v2-label">משימה חדשה</span>
            <input
              className="v2-search"
              style={{ width: "100%", minWidth: 0 }}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="כותרת"
            />
          </label>
          <label>
            <span className="v2-label">קטגוריה</span>
            <select className="v2-select" value={taskCategory} onChange={(e) => setTaskCategory(e.target.value)}>
              {categories.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span className="v2-label">עדיפות</span>
            <select className="v2-select" value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
              <option>דחוף</option>
              <option>רגיל</option>
              <option>נמוך</option>
            </select>
          </label>
        </div>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" disabled={savingTask} onClick={assignTask}>
          הקצה משימה
        </button>
      </div>

      <div className="v2-sec">
        <h3>הערות</h3>
        <textarea className="v2-textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="הוסף הערה…" />
        <button className="v2-btn v2-btn-sm mt-2" type="button" onClick={addComment} disabled={!comment.trim() || savingComment}>
          הוסף
        </button>
        <div className="mt-3 space-y-2">
          {(resident.comments || []).length === 0 && <p className="v2-sub">אין הערות עדיין.</p>}
          {[...(resident.comments || [])].reverse().map((item, index) => (
            <div key={`${item.timestamp?.seconds || item.timestamp || index}-${index}`} className="rounded-lg border border-[var(--v2-line)] p-2 text-sm">
              <div className="flex justify-between gap-2 text-[var(--v2-muted)]">
                <span>{item.userAlias}</span>
                <span>{formatDateTime(item.timestamp)}</span>
              </div>
              <p className="mt-1">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
