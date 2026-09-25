import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { notifyUsersInDepartment } from "@/lib/notifications";
import { DEFAULT_TASK_CATEGORIES } from "@/lib/residents";

function toDueIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function createTask({ currentUser, alias, department, taskData = {}, fallbackCategories = DEFAULT_TASK_CATEGORIES }) {
  if (!currentUser) return null;

  const categories = Array.isArray(fallbackCategories) && fallbackCategories.length ? fallbackCategories : DEFAULT_TASK_CATEGORIES;
  const defaultCategory = categories[0];
  const category = (taskData.category || taskData.department || defaultCategory || "").trim();
  const taskRef = doc(collection(db, "tasks"));

  const newTask = {
    id: taskRef.id,
    userId: currentUser.uid,
    creatorId: currentUser.uid,
    creatorDepartment: department || "",
    title: taskData.title || "",
    subtitle: taskData.subtitle || "",
    priority: taskData.priority || "רגיל",
    category,
    status: taskData.status || "מחכה",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    creatorAlias: alias || currentUser.email || "",
    department: (taskData.department || category).trim(),
    assignTo: (taskData.assignTo || taskData.department || category).trim(),
    dueDate: toDueIso(taskData.dueDate),
    replies: [],
    nudges: [],
    isRead: false,
    isArchived: false,
    done: false,
    completedBy: null,
    completedAt: null,
    link: taskData.link || "",
    residentStatus: taskData.residentStatus || "",
    eventStatus: taskData.eventStatus || "",
    ...(taskData.residentId && {
      residentId: taskData.residentId,
      residentName: taskData.residentName || "",
      residentPhone: taskData.residentPhone || "",
      residentNeighborhood: taskData.residentNeighborhood || "",
      residentStatus: taskData.residentStatus || "",
    }),
    ...(taskData.eventId && {
      eventId: taskData.eventId,
      eventStatus: taskData.eventStatus || "",
    }),
  };

  await setDoc(taskRef, newTask);

  if (newTask.department) {
    await notifyUsersInDepartment(newTask.department, {
      message: newTask.residentId
        ? `משימה חדשה מתושב: ${newTask.title}`
        : `משימה חדשה לקטגוריה שלך: ${newTask.title}`,
      type: "task",
      subType: "created",
      link: `/tasks?open=${taskRef.id}`,
    });
  }

  return taskRef.id;
}
