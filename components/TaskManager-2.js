"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, arrayUnion, getDocs, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db, auth } from "../firebase";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { Edit2, MessageSquare, Bell, UserPlus, Search, ChevronDown, ChevronLeft, Pencil, MessageCircle, RotateCcw } from "lucide-react";
import { TaskTabs } from "@/components/TaskTabs";
import SortableCategoryColumn from "./ui/sortable-category-column";
import SortableItem from "./ui/sortable-item";
import { createUserNotification, notifyUsersInDepartment } from "@/lib/notifications";

// Debounce utility
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
};

// Task Categories and Priorities
const TASK_CATEGORIES = ["לוגיסטיקה", "אוכלוסיה", "רפואה", "חוסן", 'חמ"ל', "אחר"];
const TASK_PRIORITIES = ["דחוף", "רגיל", "נמוך"];

// Utility Functions
const formatDateTime = (date) => {
  if (!date) return "";
  if (date.seconds) date = new Date(date.seconds * 1000);
  else date = new Date(date);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("he-IL") + " " + date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const isTaskOverdue = (task) => {
  if (task.done) return false;
  const now = new Date();
  const due = new Date(task.dueDate);
  return due < now;
};

const isTaskOverdue12h = (task) => {
  if (task.done) return false;
  const now = new Date();
  const due = new Date(task.dueDate);
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  return due < twelveHoursAgo;
};

const formatDuration = (ms) => {
  if (typeof ms !== 'number' || ms < 0 || isNaN(ms)) return "";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} ${days === 1 ? 'יום' : 'ימים'}`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
  if (minutes > 0) return `${minutes} ${minutes === 1 ? 'דקה' : 'דקות'}`;
  return "< דקה";
};

export default function TaskManager2({ 
  currentUser, 
  alias, 
  users = [], 
  department, 
  role,
  isTMFullView = false,
  setIsTMFullView = () => {},
  blockOrder = { TM: 1 },
  toggleBlockOrder = () => {},
  taskCategories = TASK_CATEGORIES,
  taskPriorities = TASK_PRIORITIES,
  assignableUsers = []
}) {
  // Trim categories on initial render and when prop changes
  const cleanTaskCategories = useMemo(() => taskCategories.map(c => c.trim()), [taskCategories]);

  // State Variables
  const [tasks, setTasks] = useState([]);
  const [replyingToTaskId, setReplyingToTaskId] = useState(null);
  const [replyInputValue, setReplyInputValue] = useState("");
  const [kanbanCollapsed, setKanbanCollapsed] = useState({});
  const [kanbanTaskCollapsed, setKanbanTaskCollapsed] = useState({});
  const [taskFilter, setTaskFilter] = useState("הכל");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("all");
  const [selectedTaskCategories, setSelectedTaskCategories] = useState([]);
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const [showOverdueEffects, setShowOverdueEffects] = useState(true);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [userHasSortedTasks, setUserHasSortedTasks] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingSubtitle, setEditingSubtitle] = useState("");
  const [editingPriority, setEditingPriority] = useState("רגיל");
  const [editingCategory, setEditingCategory] = useState("");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [editingDueTime, setEditingDueTime] = useState("");
  const [editingDepartment, setEditingDepartment] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSubtitle, setNewTaskSubtitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("רגיל");
  const [newTaskCategory, setNewTaskCategory] = useState(taskCategories[0] || "");
  const [newTaskDepartment, setNewTaskDepartment] = useState(taskCategories[0] || "");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [isPersistenceLoading, setIsPersistenceLoading] = useState(true);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);


  const sendTaskCreationNotification = async (newTask) => {
    // Send notification to the assigned department
    await notifyUsersInDepartment(newTask.department, {
      message: `משימה חדשה לקטגוריה שלך: ${newTask.title}`,
      type: 'task',
      subType: 'created',
      link: `/`
    });
  };

  // Initialize sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Task Listener
  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);
    
    const unsubscribe = onSnapshot(
      collection(db, "tasks"),
      (snapshot) => {
        try {
          const newTasks = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              dueDate: data.dueDate?.toDate?.() || new Date(data.dueDate),
              createdAt: data.createdAt?.toDate?.() || null,
              completedAt: data.completedAt?.toDate?.() || null,
              lastReplyAt: data.lastReplyAt?.toDate?.() || null,
              replies: data.replies?.map(reply => ({
                ...reply,
                timestamp: reply.timestamp?.toDate?.() || null
              })) || []
            };
          });
          console.log("TaskManager-2 received tasks:", newTasks.length, "tasks");
          if (newTasks.length > 0) {
            console.log("Sample task:", newTasks[0]);
            // Look for tasks with eventId
            const eventTasks = newTasks.filter(task => task.eventId);
            if (eventTasks.length > 0) {
              console.log("Found event-linked tasks:", eventTasks);
            }
          }
          setTasks(newTasks);
          setIsLoading(false);
        } catch (err) {
          console.error('Error processing tasks:', err);
          setError('Failed to load tasks');
          setIsLoading(false);
        }
      },
      (error) => {
        console.error('Error listening to tasks:', error);
        setError('Failed to load tasks');
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [currentUser]);

  // Archived tasks listener
  useEffect(() => {
    if (!currentUser) return;
    const archivedRef = collection(db, "archivedTasks");
    const unsubscribe = onSnapshot(archivedRef, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setArchivedTasks(data);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Restore task from archive (admin only)
  const restoreTask = async (archivedTask) => {
    if (!currentUser || role !== 'admin') {
      toast({
        title: "שגיאה",
        description: "רק אדמין יכול לשחזר משימות",
        variant: "destructive"
      });
      return;
    }
    try {
      // Restore to tasks collection
      await setDoc(doc(db, 'tasks', archivedTask.id), {
        ...archivedTask,
        done: false,
        completedAt: null,
        completedBy: null,
        archivedAt: null,
        updatedAt: serverTimestamp(),
      });
      // Remove from archive
      await deleteDoc(doc(db, 'archivedTasks', archivedTask.id));
      toast({
        title: "משימה שוחזרה",
        description: "המשימה שוחזרה בהצלחה",
      });
    } catch (error) {
      console.error('Error restoring task:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה בשחזור המשימה",
        variant: "destructive"
      });
    }
  };

  // Load user preferences for collapsed states
  useEffect(() => {
    if (!currentUser) {
      setIsPersistenceLoading(false);
      return;
    }
    const prefRef = doc(db, "userPreferences", currentUser.uid);
    getDoc(prefRef).then(docSnap => {
      if (docSnap.exists()) {
        const prefs = docSnap.data();
        if (prefs.kanbanCollapsed) {
          setKanbanCollapsed(prefs.kanbanCollapsed);
        }
        if (prefs.kanbanTaskCollapsed) {
          setKanbanTaskCollapsed(prefs.kanbanTaskCollapsed);
        }
      }
    }).catch(error => {
      console.error("Error loading user preferences:", error);
    }).finally(() => {
      setIsPersistenceLoading(false);
    });
  }, [currentUser]);

  // Debounced update function for persistence
  const debouncedUpdateUserPrefs = useCallback(debounce((data) => {
    if (!currentUser) {
      console.error("User not authenticated. Cannot save preferences.");
      return;
    }
    const prefRef = doc(db, "userPreferences", currentUser.uid);
    setDoc(prefRef, data, { merge: true }).catch(err => {
      console.error("Error updating user preferences:", err);
    });
  }, 1500), [currentUser]);

  // Task filtering and sorting logic
  const sortedAndFilteredTasks = useMemo(() => {
    const lowerSearchTerm = taskSearchTerm.toLowerCase();
    const trimmedDepartment = department ? department.trim() : '';

    let filtered = tasks.filter((task) => {
        const taskDepartment = task.department ? task.department.trim() : '';
        const taskAssignTo = task.assignTo ? task.assignTo.trim() : '';
        
        const departmentMatch =
            taskFilter === "הכל" ||
            (taskFilter === "שלי" && (taskDepartment === trimmedDepartment || taskAssignTo === trimmedDepartment)) ||
            (taskFilter === "אחרים" && taskDepartment !== trimmedDepartment && taskAssignTo !== trimmedDepartment);

        const doneMatch = showDoneTasks || !task.done;
        
        const searchTermMatch = !lowerSearchTerm ||
            (task.title && task.title.toLowerCase().includes(lowerSearchTerm)) ||
            (task.subtitle && task.subtitle.toLowerCase().includes(lowerSearchTerm));

        if (!departmentMatch || !doneMatch || !searchTermMatch) {
            return false;
        }

        // Additional filters for full view only
        if (isTMFullView) {
            const priorityMatch = taskPriorityFilter === 'all' || task.priority === taskPriorityFilter;
            if (!priorityMatch) return false;
        }

        return true;
    });

    // Sorting logic - should apply to both views if not manually sorted
    if (!userHasSortedTasks) {
        filtered = filtered.sort((a, b) => {
            const aIsDone = typeof a.done === 'boolean' ? a.done : false;
            const bIsDone = typeof b.done === 'boolean' ? b.done : false;
            if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;
            try {
                const dateA = a.dueDate instanceof Date && !isNaN(a.dueDate) ? a.dueDate.getTime() : Infinity;
                const dateB = b.dueDate instanceof Date && !isNaN(b.dueDate) ? b.dueDate.getTime() : Infinity;
                if (dateA === Infinity && dateB === Infinity) return 0;
                if (dateA === Infinity) return 1;
                if (dateB === Infinity) return -1;
                return dateA - dateB;
            } catch (e) {
                console.error("Error during task date sort:", e);
                return 0;
            }
        });
    }

    return filtered;
  }, [
    tasks, taskFilter, showDoneTasks, userHasSortedTasks, isTMFullView,
    taskPriorityFilter, taskSearchTerm, department, cleanTaskCategories // Added cleanTaskCategories dependency
  ]);

  // Standardized task creation function for external components
  const createTaskFromExternal = useCallback(async (taskData) => {
    if (!currentUser) {
      console.error("No current user found");
      return null;
    }

    try {
      const taskRef = doc(collection(db, "tasks"));
      const now = new Date();
      
      // Standardized task structure with proper field validation
      const newTask = {
        id: taskRef.id,
        userId: currentUser.uid,
        creatorId: currentUser.uid,
        title: taskData.title || "",
        subtitle: taskData.subtitle || "",
        priority: taskData.priority || "רגיל",
        category: taskData.category ? taskData.category.trim() : cleanTaskCategories[0],
        status: taskData.status || "פתוח",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        creatorAlias: alias || currentUser.email || "",
        department: (taskData.department || taskData.category) ? (taskData.department || taskData.category).trim() : cleanTaskCategories[0],
        assignTo: (taskData.assignTo || taskData.department || taskData.category) ? (taskData.assignTo || taskData.department || taskData.category).trim() : cleanTaskCategories[0],
        dueDate: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : null,
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null,
        // Optional fields with proper validation
        ...(taskData.residentId && {
          residentId: taskData.residentId,
          residentName: taskData.residentName || "",
          residentPhone: taskData.residentPhone || "",
          residentNeighborhood: taskData.residentNeighborhood || "",
          residentStatus: taskData.residentStatus || ""
        }),
        ...(taskData.eventId && {
          eventId: taskData.eventId,
          eventStatus: taskData.eventStatus || ""
        }),
        // Add status fields for all tasks
        status: taskData.status || "פתוח",
        residentStatus: taskData.residentStatus || "",
        eventStatus: taskData.eventStatus || ""
      };

      console.log("Creating standardized task:", newTask);
      console.log("Task department:", newTask.department);
      console.log("Task assignTo:", newTask.assignTo);
      console.log("Current user department:", department);
      
      await setDoc(taskRef, newTask);
      
      console.log("Task saved to Firestore with ID:", taskRef.id);
      
      // Send notification to the assigned department
      await notifyUsersInDepartment(newTask.department, {
        message: `משימה חדשה לקטגוריה שלך: ${newTask.title}`,
        type: 'task',
        subType: 'created',
        link: `/`
      });
      
      toast({
        title: "משימה נוצרה",
        description: "המשימה נוצרה בהצלחה",
      });
      
      return taskRef.id;
    } catch (error) {
      console.error("Error creating standardized task:", error);
      toast({
        title: "שגיאה",
        description: "שגיאה ביצירת המשימה",
        variant: "destructive"
      });
      return null;
    }
  }, [currentUser, alias, cleanTaskCategories]);

  // Expose the createTaskFromExternal function for other components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.createTaskFromExternal = createTaskFromExternal;
    }
    
    // Cleanup function to remove the function when component unmounts
    return () => {
      if (typeof window !== 'undefined') {
        delete window.createTaskFromExternal;
      }
    };
  }, [createTaskFromExternal]);

  // Task status change handler
  const handleTaskStatusChange = async (taskId, newStatus) => {
    if (!currentUser) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const task = tasks.find(t => t.id === taskId);
      
      await updateDoc(taskRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // If this is an event-linked task, sync the status back to the event
      if (task && task.eventId) {
        try {
          const eventRef = doc(db, 'eventLogs', task.eventId);
          await updateDoc(eventRef, {
            status: newStatus,
            updatedAt: serverTimestamp(),
            lastUpdater: alias || currentUser.email || ""
          });
          console.log(`Synced task status to event ${task.eventId}: ${newStatus}`);
        } catch (eventError) {
          console.error('Error syncing task status to event:', eventError);
        }
      }

      // If this is a resident-linked task, sync the status back to the resident
      if (task && task.residentId) {
        try {
          const residentRef = doc(db, 'residents', task.residentId);
          await updateDoc(residentRef, {
            סטטוס: newStatus,
            updatedAt: serverTimestamp(),
            lastUpdater: alias || currentUser.email || ""
          });
          console.log(`Synced task status to resident ${task.residentId}: ${newStatus}`);
        } catch (residentError) {
          console.error('Error syncing task status to resident:', residentError);
        }
      }

      toast({
        title: "סטטוס עודכן",
        description: `סטטוס המשימה עודכן ל: ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating task status:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה בעדכון סטטוס המשימה",
        variant: "destructive"
      });
    }
  };

  // Task completion handler
  const handleTaskDone = async (taskId, checked) => {
    if (!currentUser) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const now = new Date();
      
      await updateDoc(taskRef, {
        done: checked,
        completedAt: checked ? now : null,
        completedBy: checked ? (alias || currentUser.email) : null,
        updatedAt: now
      });

      // If this is an event-linked task, sync the status back to the event
      const task = tasks.find(t => t.id === taskId);
      if (task && task.eventId) {
        try {
          const eventRef = doc(db, 'eventLogs', task.eventId);
          const newEventStatus = checked ? 'טופל' : 'בטיפול';
          await updateDoc(eventRef, {
            status: newEventStatus,
            updatedAt: serverTimestamp(),
            lastUpdater: alias || currentUser.email || ""
          });
          console.log(`Synced task status to event ${task.eventId}: ${newEventStatus}`);
        } catch (eventError) {
          console.error('Error syncing task status to event:', eventError);
        }
      }

      toast({
        title: checked ? "משימה הושלמה" : "משימה נפתחה מחדש",
        description: `המשימה ${checked ? 'סומנה כהושלמה' : 'נפתחה מחדש'}`,
      });

      // Notify creator that task is done
      if (checked) {
        createUserNotification(task.creatorId, {
          message: `משימה הושלמה: ${task.title}`,
          type: 'task',
          subType: 'done',
          link: `/`
        });
      }
    } catch (error) {
      console.error('Error toggling task:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה בעדכון סטטוס המשימה",
        variant: "destructive"
      });
    }
  };

  // Task reply handler
  const handleTaskReply = async (taskId, replyText) => {
    if (!replyText.trim() || !currentUser) {
      console.log("Empty reply or no user, skipping");
      return;
    }

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        console.error('Task not found');
        return;
      }

      const taskData = taskDoc.data();
      
      // Check if user has permission to reply
      const hasPermission = 
        taskData.userId === currentUser.uid ||
        taskData.creatorId === currentUser.uid ||
        taskData.assignTo === currentUser.uid ||
        taskData.assignTo === currentUser.email ||
        taskData.assignTo === alias;
      
      if (!hasPermission) {
        console.error('No permission to reply to this task', {
          taskAssignTo: taskData.assignTo,
          currentUserUid: currentUser.uid,
          currentUserEmail: currentUser.email,
          alias: alias
        });
        toast({
          title: "שגיאה",
          description: "אין לך הרשאה להוסיף תגובה למשימה זו",
          variant: "destructive"
        });
        return;
      }

      const now = new Date();
      
      // Create the new reply object with a regular timestamp
      const newReply = {
        text: replyText,
        timestamp: now,
        userId: currentUser.uid,
        userAlias: alias || currentUser.email,
        isRead: false
      };

      await updateDoc(taskRef, {
        replies: arrayUnion(newReply),
        hasNewReply: true,
        lastReplyAt: now,
        updatedAt: now
      });

      toast({
        title: "תגובה נשלחה",
        description: "התגובה שלך נשלחה בהצלחה",
      });

      // Notify creator about the reply
      createUserNotification(taskData.creatorId, {
        message: `תגובה חדשה על משימה: ${taskData.title}`,
        type: 'task',
        subType: 'replied',
        link: `/`
      });
    } catch (error) {
      console.error('Error adding reply:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה בשליחת התגובה",
        variant: "destructive"
      });
    }
  };

  // Task nudge handler
  const handleNudgeTask = async (taskId) => {
    if (!currentUser) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const now = new Date();
      
      const newNudge = {
        timestamp: now,
        userId: currentUser.uid,
        userAlias: alias || currentUser.email
      };

      await updateDoc(taskRef, {
        nudges: arrayUnion(newNudge),
        lastNudgedAt: now,
        updatedAt: now
      });

      toast({
        title: "תזכורת נשלחה",
        description: "נשלחה תזכורת למבצע המשימה",
      });
    } catch (error) {
      console.error('Error nudging task:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה בשליחת התזכורת",
        variant: "destructive"
      });
    }
  };

  // Clear done tasks handler
  const handleClearDoneTasks = useCallback(async () => {
    if (!currentUser) {
      console.error("No user found");
      return;
    }
    if (window.confirm("האם אתה בטוח שברצונך למחוק את כל המשימות שבוצעו? לא ניתן לשחזר פעולה זו.")) {
      try {
        // Get all completed tasks that belong to the current user
        const completedTasks = tasks.filter(task => 
          task.done && (
            task.userId === currentUser.uid || 
            task.creatorId === currentUser.uid ||
            task.assignTo === currentUser.email ||
            task.assignTo === currentUser.alias
          )
        );
        if (completedTasks.length === 0) {
          console.log("No completed tasks to delete");
          return;
        }
        // Archive and delete each completed task
        const archiveAndDeletePromises = completedTasks.map(async task => {
          try {
            // Use the best available alias for archiving
            const aliasToArchive = task.completedByAlias || task.completedBy || task.creatorAlias || task.completedByEmail || task.assignTo || alias || currentUser?.alias || currentUser?.email || '';
            await setDoc(doc(db, 'archivedTasks', task.id), {
              ...task,
              completedByAlias: aliasToArchive,
              archivedAt: new Date(),
            });
            await deleteDoc(doc(db, 'tasks', task.id));
            return task.id;
          } catch (error) {
            console.error(`Failed to archive/delete task ${task.id}:`, error);
            return null;
          }
        });
        const results = await Promise.allSettled(archiveAndDeletePromises);
        const successfulDeletes = results
          .filter(result => result.status === 'fulfilled' && result.value)
          .map(result => result.value);
        setTasks(prevTasks => prevTasks.filter(task => !successfulDeletes.includes(task.id)));
        console.log(`Successfully archived and deleted ${successfulDeletes.length} of ${completedTasks.length} completed tasks`);
        if (successfulDeletes.length < completedTasks.length) {
          alert('חלק מהמשימות לא נמחקו עקב הרשאות חסרות');
        }
      } catch (error) {
        console.error('Error archiving/deleting completed tasks:', error);
        alert('שגיאה במחיקת המשימות שבוצעו');
      }
    }
  }, [tasks, currentUser, alias]);

  // Task editing handlers
  const handleSaveTask = useCallback(async (e) => {
    e.preventDefault();
    if (!currentUser || !editingTaskId) return;

    try {
      const taskRef = doc(db, 'tasks', editingTaskId);
      const updateData = {
        title: editingTitle,
        subtitle: editingSubtitle,
        priority: editingPriority,
        category: editingCategory.trim(),
        department: editingDepartment.trim(),

        updatedAt: serverTimestamp()
      };

      if (editingDueDate && editingDueTime) {
        updateData.dueDate = new Date(`${editingDueDate}T${editingDueTime}`).toISOString();
      }

      await updateDoc(taskRef, updateData);

      // If this is an event-linked task, sync the status back to the event
      const task = tasks.find(t => t.id === editingTaskId);
      if (task && task.eventId) {
        try {
          const eventRef = doc(db, 'eventLogs', task.eventId);
          // Map task status to event status
          let newEventStatus = 'בטיפול';
          if (task.done) {
            newEventStatus = 'טופל';
          } else if (editingPriority === 'דחוף') {
            newEventStatus = 'מחכה';
          }
          
          await updateDoc(eventRef, {
            status: newEventStatus,
            updatedAt: serverTimestamp(),
            lastUpdater: alias || currentUser.email || ""
          });
          console.log(`Synced task update to event ${task.eventId}: ${newEventStatus}`);
        } catch (eventError) {
          console.error('Error syncing task update to event:', eventError);
        }
      }

      // Reset editing state
      setEditingTaskId(null);
      setEditingTitle("");
      setEditingSubtitle("");
      setEditingPriority("רגיל");
      setEditingCategory("");
      setEditingDueDate("");
      setEditingDueTime("");
      setEditingDepartment("");

      toast({
        title: "משימה עודכנה",
        description: "המשימה עודכנה בהצלחה",
      });
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה בעדכון המשימה",
        variant: "destructive"
      });
    }
  }, [currentUser, editingTaskId, editingTitle, editingSubtitle, editingPriority, editingCategory, editingDueDate, editingDueTime, editingDepartment, tasks, alias]);

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingTitle("");
    setEditingSubtitle("");
    setEditingPriority("רגיל");
    setEditingCategory("");
    setEditingDueDate("");
    setEditingDueTime("");
    setEditingDepartment("");

  };

  // Kanban collapse handlers
  const handleToggleKanbanCollapse = (category) => {
    const newCollapsed = {
      ...kanbanCollapsed,
      [category]: !kanbanCollapsed[category]
    };
    setKanbanCollapsed(newCollapsed);
    debouncedUpdateUserPrefs({ kanbanCollapsed: newCollapsed });
  };

  const handleToggleTaskCollapse = (taskId) => {
    const newCollapsed = {
      ...kanbanTaskCollapsed,
      [taskId]: !kanbanTaskCollapsed[taskId]
    };
    setKanbanTaskCollapsed(newCollapsed);
    debouncedUpdateUserPrefs({ kanbanTaskCollapsed: newCollapsed });
  };

  // Drag and drop handlers
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || !active) return;

    // Get the task ID and data
    const taskId = active.id.replace('task-', '');
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Find the target category by traversing up the DOM
    let targetElement = over.data.current?.droppableContainer?.node;
    let targetCategory = null;

    // Keep looking up the DOM tree until we find the category container
    while (targetElement && !targetCategory) {
      targetCategory = targetElement.dataset?.category;
      if (!targetCategory) {
        targetElement = targetElement.parentElement;
      }
    }

    console.log("Drag end:", {
      taskId,
      currentCategory: task.category,
      targetCategory,
      overData: over.data.current,
      targetElement
    });

    // If we found a valid category and it's different from the current one
    if (targetCategory && targetCategory !== task.category) {
      try {
        console.log(`Updating task ${taskId} category from ${task.category} to ${targetCategory}`);
        
        // Update Firestore first
        const taskRef = doc(db, 'tasks', taskId);
        await updateDoc(taskRef, {
          category: targetCategory,
          updatedAt: serverTimestamp()
        });

        // Then update local state
        setTasks(prevTasks => 
          prevTasks.map(t => 
            t.id === taskId 
              ? { 
                  ...t, 
                  category: targetCategory,
                  updatedAt: new Date() // Local timestamp for immediate UI update
                }
              : t
          )
        );

        console.log("Task category updated successfully");
      } catch (error) {
        console.error("Error updating task category:", error);
        toast({
          title: "שגיאה",
          description: "שגיאה בעדכון קטגוריית המשימה",
          variant: "destructive"
        });
      }
    } else {
      console.log("No category change needed:", {
        currentCategory: task.category,
        targetCategory
      });
    }
  }, [tasks]);

  const handleCategoryDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cleanTaskCategories.indexOf(active.id);
    const newIndex = cleanTaskCategories.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(cleanTaskCategories, oldIndex, newIndex);
    // TODO: Update category order in Firestore
    console.log("Category order updated:", newOrder);
  };

  // Create task handler
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      console.error("No current user found");
      return;
    }

    try {
      console.log("Creating task with department assignment:", {
        department: newTaskDepartment,
        currentUserDepartment: department
      });

      const taskRef = doc(collection(db, "tasks"));
      const newTask = {
        id: taskRef.id,
        userId: currentUser.uid,
        creatorId: currentUser.uid,
        title: newTaskTitle,
        subtitle: newTaskSubtitle,
        priority: newTaskPriority,
        category: newTaskCategory.trim(),
        status: "פתוח",
        residentStatus: "",
        eventStatus: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        creatorAlias: alias || currentUser.email || "",
        // Assign to department instead of individual user
        department: newTaskDepartment.trim(),
        // Keep assignTo for backward compatibility but it should be the department
        assignTo: newTaskDepartment.trim(),
        dueDate: new Date().toISOString(),
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null
      };

      console.log("Saving task with data:", newTask);
      await setDoc(taskRef, newTask);

      // Send notification to the assigned department
      await notifyUsersInDepartment(newTask.department, {
        message: `משימה חדשה לקטגוריה שלך: ${newTask.title}`,
        type: 'task',
        subType: 'created',
        link: `/`
      });

      // Reset form
      setNewTaskTitle("");
      setNewTaskSubtitle("");
      setNewTaskPriority("רגיל");
      setNewTaskCategory(cleanTaskCategories[0] || "");
      setNewTaskDepartment(cleanTaskCategories[0] || "");
      setShowTaskModal(false);
    } catch (error) {
      console.error("Error creating task:", error);
      toast({
        title: "שגיאה",
        description: "שגיאה ביצירת המשימה. נסה שוב.",
        variant: "destructive"
      });
    }
  };

  const openNewTaskModal = () => {
    setNewTaskTitle("");
    setNewTaskSubtitle("");
    setNewTaskPriority("רגיל");
    setNewTaskCategory(cleanTaskCategories[0] || "");
    setNewTaskDepartment(department || cleanTaskCategories[0] || "");
    setShowTaskModal(true);
  };

  // Render task function
  const renderTask = (task) => {
    if (!task) {
      return (
        <div className="p-3 border rounded bg-blue-50 shadow-md">
          <form onSubmit={handleCreateTask} className="space-y-2">
            <div>
              <Label className="text-xs">המחלקה שלי:</Label>
              <Select 
                value={newTaskDepartment} 
                onValueChange={setNewTaskDepartment}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="בחר מחלקה" />
                </SelectTrigger>
                <SelectContent>
                  {cleanTaskCategories.map((dep) => (
                    <SelectItem key={dep} value={dep}>
                      {dep}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">כותרת:</Label>
              <Input 
                type="text" 
                value={newTaskTitle} 
                onChange={(e) => setNewTaskTitle(e.target.value)} 
                className="h-8 text-sm" 
                required 
                onKeyDown={e => { if (e.key === ' ' || e.code === 'Space') e.stopPropagation(); }}
              />
            </div>
            <div>
              <Label className="text-xs">תיאור:</Label>
              <Textarea 
                value={newTaskSubtitle} 
                onChange={(e) => setNewTaskSubtitle(e.target.value)} 
                rows={2} 
                className="text-sm" 
                onKeyDown={e => { if (e.key === ' ' || e.code === 'Space') e.stopPropagation(); }}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">עדיפות:</Label>
                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">עבור מחלקה:</Label>
                <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cleanTaskCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-start space-x-2 space-x-reverse pt-1">
              <Button 
                type="submit" 
                size="sm"
                className="bg-green-200 hover:bg-green-300"
              >
                {'צור משימה'}
              </Button>
              <Button 
                type="button" 
                size="sm" 
                onClick={() => setShowTaskModal(false)}
                className="bg-red-200 hover:bg-red-300"
              >
                {'ביטול'}
              </Button>
            </div>
          </form>
        </div>
      );
    }

    // If we're editing this task, show the edit form
    if (editingTaskId === task.id) {
      return (
        <div className="p-3 border rounded bg-blue-50 shadow-md">
          <form onSubmit={handleSaveTask} className="space-y-2">
            <div>
              <Label className="text-xs">מחלקה ל:</Label>
              <Select value={editingDepartment} onValueChange={setEditingDepartment}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="בחר מחלקה" />
                </SelectTrigger>
                <SelectContent>
                  {cleanTaskCategories.map((dep) => (
                    <SelectItem key={dep} value={dep}>
                      {dep}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">כותרת:</Label>
              <Input 
                type="text" 
                value={editingTitle} 
                onChange={(e) => setEditingTitle(e.target.value)} 
                className="h-8 text-sm" 
                required 
                onKeyDown={e => { if (e.key === ' ' || e.code === 'Space') e.stopPropagation(); }}
              />
            </div>
            <div>
              <Label className="text-xs">תיאור:</Label>
              <Textarea 
                value={editingSubtitle} 
                onChange={(e) => setEditingSubtitle(e.target.value)} 
                rows={2} 
                className="text-sm" 
                onKeyDown={e => { if (e.key === ' ' || e.code === 'Space') e.stopPropagation(); }}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">עדיפות:</Label>
                <Select value={editingPriority} onValueChange={setEditingPriority}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">קטגוריה:</Label>
                <Select value={editingCategory} onValueChange={setEditingCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cleanTaskCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">תאריך:</Label>
                <Input 
                  type="date" 
                  value={editingDueDate} 
                  onChange={(e) => setEditingDueDate(e.target.value)} 
                  className="h-8 text-sm" 
                  required 
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">שעה:</Label>
                <Input 
                  type="time" 
                  value={editingDueTime} 
                  onChange={(e) => setEditingDueTime(e.target.value)} 
                  className="h-8 text-sm" 
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 space-x-reverse pt-1">
              <Button type="submit" size="sm">{'שמור'}</Button>
              <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>{'ביטול'}</Button>
            </div>
          </form>
        </div>
      );
    }

    // Regular task display
    const hasUnreadReplies = task.replies?.some(reply => !reply.isRead);
    const isCreator = task.creatorId === currentUser?.uid;
    const isAssignee = task.assignTo === currentUser?.uid;
    const bgColor = isCreator ? 'bg-blue-50' : isAssignee ? 'bg-green-50' : 'bg-white';
    const sortedReplies = task.replies?.sort((a, b) => b.timestamp - a.timestamp) || [];

    return (
      <div key={task.id} className={`w-full p-3 rounded-lg shadow-sm border ${bgColor} relative`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-grow">
            <div className="flex items-center gap-2 mb-1">
              <Checkbox 
                checked={!!task.done} 
                onCheckedChange={(checked) => handleTaskDone(task.id, checked)}
                className="data-[state=checked]:bg-green-600"
                aria-label={`Mark task ${task.title}`} 
              />
              <span className={`font-medium ${task.done ? 'line-through text-gray-500' : ''}`}>
                {task.title}
              </span>
            </div>
            {task.subtitle && (
              <p className={`text-sm text-gray-600 mb-2 ${task.done ? 'line-through' : ''}`}>
                {task.subtitle}
              </p>
            )}
            <div className="text-xs text-gray-500 mt-1 space-x-2 space-x-reverse">
              <span>🗓️ {formatDateTime(task.dueDate)}</span>
              <span>🏢 {task.department}</span>
              {task.creatorAlias && <span className="font-medium">📝 {task.creatorAlias}</span>}
              <span>🏷️ {task.category}</span>
              <span>{task.priority === 'דחוף' ? '🔥' : task.priority === 'נמוך' ? '⬇️' : '➖'} {task.priority}</span>
              <div className="flex items-center gap-1">
                <span className="font-semibold">📊</span>
                <Select value={task.status || "מחכה"} onValueChange={(newStatus) => handleTaskStatusChange(task.id, newStatus)}>
                  <SelectTrigger className="h-6 text-xs border-0 p-0 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {task.eventId ? (
                      // Event-linked task status options
                      ["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                    ) : task.residentId ? (
                      // Resident-linked task status options
                      ["כולם בסדר", "זקוקים לסיוע", "לא בטוח"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                    ) : (
                      // Regular task status options
                      ["פתוח", "בטיפול", "הושלם"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Resident information display */}
            {task.residentId && (
              <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                <div className="text-xs font-medium text-blue-800 mb-1">תושב מקושר:</div>
                <div className="text-xs text-blue-700">{task.residentName}</div>
                <div className="text-xs text-blue-600">טלפון: {task.residentPhone}</div>
                <div className="text-xs text-blue-600">שכונה: {task.residentNeighborhood}</div>
                {task.residentStatus && (
                  <div className="text-xs text-blue-600">סטטוס: {task.residentStatus}</div>
                )}
              </div>
            )}
            
            {/* Event information display */}
            {task.eventId && (
              <div className="mt-2 p-2 bg-green-50 rounded border-l-4 border-green-400">
                <div className="text-xs font-medium text-green-800 mb-1">אירוע מקושר:</div>
                <div className="text-xs text-green-700">מזהה אירוע: {task.eventId}</div>
                {task.eventStatus && (
                  <div className="text-xs text-green-600">סטטוס אירוע: {task.eventStatus}</div>
                )}
              </div>
            )}
            
            {/* Add TaskTabs component */}
            <TaskTabs taskId={task.id} currentUser={currentUser} />
          </div>
          
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditingTaskId(task.id);
                    setEditingTitle(task.title);
                    setEditingSubtitle(task.subtitle || '');
                    setEditingPriority(task.priority);
                    setEditingCategory(task.category);
                    if (task.dueDate) {
                      const due = new Date(task.dueDate);
                      if (!isNaN(due.getTime())) {
                        setEditingDueDate(due.toLocaleDateString('en-CA'));
                        setEditingDueTime(due.toTimeString().slice(0, 5));
                      }
                    }
                    setEditingDepartment(task.department || '');
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>ערוך משימה</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 relative"
                  onClick={() => {
                    setReplyingToTaskId(task.id);
                    setReplyInputValue("");
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  {hasUnreadReplies && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>הוסף תגובה</TooltipContent>
            </Tooltip>

            {!task.done && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`w-6 h-6 relative ${task.hasUnreadNudges ? 'text-orange-500' : 'text-gray-400'} hover:text-orange-600`}
                    title="שלח תזכורת" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNudgeTask(task.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Bell className="h-4 w-4" />
                    {task.hasUnreadNudges && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 bg-orange-500 rounded-full" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>שלח תזכורת</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
            
        {/* Replies section */}
        {sortedReplies.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <div className="text-xs font-medium text-gray-500 mb-1">תגובות:</div>
            {sortedReplies.map((reply, index) => (
              <div 
                key={`${task.id}-reply-${reply.timestamp?.toMillis?.() || Date.now()}-${index}`} 
                className={`text-xs mb-1 ${!reply.isRead && reply.userId !== currentUser.uid ? 'font-bold' : ''}`}
              >
                <span className="font-bold">{reply.userAlias}:</span> {reply.text}
                <span className="text-gray-400 text-xs mr-2"> ({formatDateTime(reply.timestamp)})</span>
                {!reply.isRead && reply.userId !== currentUser.uid && (
                  <span className="text-green-500 text-xs">(חדש)</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reply input */}
        {!task.done && replyingToTaskId === task.id && (
          <div className="mt-2">
            <input
              type="text"
              placeholder="הוסף תגובה..."
              className="w-full text-sm border rounded p-1 rtl"
              autoFocus
              value={replyInputValue}
              onChange={e => setReplyInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === ' ' || e.code === 'Space') {
                  e.stopPropagation(); // Prevent DnD from hijacking spacebar in input
                }
                if (e.key === 'Enter' && replyInputValue.trim()) {
                  handleTaskReply(task.id, replyInputValue.trim());
                  setReplyInputValue("");
                  setReplyingToTaskId(null);
                } else if (e.key === 'Escape') {
                  setReplyingToTaskId(null);
                  setReplyInputValue("");
                }
              }}
              onBlur={() => {
                setReplyingToTaskId(null);
                setReplyInputValue("");
              }}
            />
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <DndContext 
      sensors={sensors} 
      collisionDetection={closestCenter} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4 p-4 bg-white rounded-lg shadow-md">
        {/* Header with title and controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <h2 className="text-xl font-bold">מנהל משימות</h2>
            {/* Mobile: Show buttons next to title */}
            <div className="flex items-center gap-2 sm:hidden">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsTMFullView(!isTMFullView)} 
                title={isTMFullView ? "עבור לתצוגה מקוצרת" : "עבור לתצוגת קנבן"}
                className="text-xs px-2 py-1"
              >
                {isTMFullView ? "תצוגה מוקטנת" : "תצוגה מלאה"}
              </Button>
              <Button 
                size="xs" 
                onClick={() => toggleBlockOrder("TM")} 
                title="שנה מיקום בלוק"
                className="text-xs px-2 py-1"
              >
                {'מיקום: '}{blockOrder.TM}
              </Button>
            </div>
          </div>
          {/* Desktop: Show buttons on the right */}
          <div className="hidden sm:flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsTMFullView(!isTMFullView)} 
              title={isTMFullView ? "עבור לתצוגה מקוצרת" : "עבור לתצוגת קנבן"}
            >
              {isTMFullView ? "תצוגה מוקטנת" : "תצוגה מלאה"}
            </Button>
            <Button 
              size="xs" 
              onClick={() => toggleBlockOrder("TM")} 
              title="שנה מיקום בלוק"
            >
              {'מיקום: '}{blockOrder.TM}
            </Button>
          </div>
        </div>
      
      {/* Filter controls */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant={taskFilter === 'הכל' ? 'default' : 'outline'} size="sm" onClick={() => setTaskFilter('הכל')}>{'הכל'}</Button>
            <Button variant={taskFilter === 'שלי' ? 'default' : 'outline'} size="sm" onClick={() => setTaskFilter('שלי')}>{'שלי'}</Button>
            <Button variant={taskFilter === 'אחרים' ? 'default' : 'outline'} size="sm" onClick={() => setTaskFilter('אחרים')}>{'אחרים'}</Button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={showDoneTasks}
                onCheckedChange={setShowDoneTasks}
              />
              <Label className="text-sm font-medium cursor-pointer select-none">{'הצג בוצעו'}</Label>
            </div>
            <div className="flex items-center gap-2 mr-4 pr-4 border-r">
              <Checkbox
                checked={showOverdueEffects}
                onCheckedChange={setShowOverdueEffects}
              />
              <Label className="text-sm font-medium cursor-pointer select-none">{'הצג חיווי איחור'}</Label>
            </div>
            {!isTMFullView && userHasSortedTasks && (
              <Button variant="ghost" size="icon" className="w-8 h-8" title="אפס סדר ידני" onClick={() => setUserHasSortedTasks(false)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t pt-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isTMFullView && (
            <Select value={taskPriorityFilter} onValue-change={setTaskPriorityFilter}>
              <SelectTrigger className="h-8 text-sm w-[120px] [&>svg]:hidden">
                <SelectValue placeholder="עדיפות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{'כל העדיפויות'}</SelectItem>
                {taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            )}
            
            <div className="relative flex-1 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-400"
                onClick={() => setIsSearchExpanded(prev => !prev)}
              >
                <Search className="h-4 w-4" />
              </Button>
              {isSearchExpanded ? (
                <Input 
                  type="search" 
                  placeholder="חפש משימות..." 
                  className="h-8 text-sm pr-8 w-full transition-all duration-300" 
                  value={taskSearchTerm} 
                  onChange={(e) => setTaskSearchTerm(e.target.value)}
                  autoFocus
                  onBlur={() => setIsSearchExpanded(false)}
                />
              ) : null}
            </div>
            <Button 
              variant="outline"
              size="sm"
              className="bg-blue-200 hover:bg-blue-300 text-gray-700 border-gray-200 text-xs px-4 py-1 font-bold" 
              onClick={() => {
                setNewTaskTitle("");
                setNewTaskSubtitle("");
                setNewTaskPriority("רגיל");
                setNewTaskCategory(cleanTaskCategories[0] || "");
                setNewTaskDepartment(department || cleanTaskCategories[0] || "");
                setShowTaskModal(true);
              }}
            >
              {'+ משימה'}
            </Button>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Button 
              variant="outline" 
              size="icon" 
              className="w-7 h-7 text-red-600 hover:bg-red-50 hover:text-red-700" 
              title="מחק משימות שבוצעו" 
              onClick={handleClearDoneTasks} 
              disabled={!tasks.some(task => task.done)}
            >
              <span role="img" aria-label="Clear Done">🧹</span>
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              className="w-7 h-7"
              title="היסטוריית משימות" 
              onClick={() => setShowHistoryModal(true)}
            >
              <span role="img" aria-label="History">📜</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Task list */}
      {isTMFullView ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleCategoryDragEnd}
        >
          <SortableContext
            items={cleanTaskCategories}
            strategy={horizontalListSortingStrategy}
          >
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-${Math.min(6, Math.max(1, cleanTaskCategories.length))} gap-3 h-full overflow-y-auto`}>
              {cleanTaskCategories.map((category) => (
                <SortableCategoryColumn key={category} id={category} className="bg-gray-100 rounded-lg p-2 flex flex-col min-w-[280px] box-border w-full min-w-0">
                  <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-100 py-1 px-1 z-10">
                    {/* Collapse/expand chevron (RTL: left side) */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-gray-500 hover:text-blue-600 shrink-0 ml-2 rtl:ml-0 rtl:mr-2"
                      title={kanbanCollapsed[category] ? 'הרחב קטגוריה' : 'צמצם קטגוריה'}
                      onClick={() => handleToggleKanbanCollapse(category)}
                      tabIndex={0}
                      aria-label={kanbanCollapsed[category] ? 'הרחב קטגוריה' : 'צמצם קטגוריה'}
                    >
                      {/* Chevron points down when expanded, left when collapsed (RTL) */}
                      {kanbanCollapsed[category] ? <ChevronLeft className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </Button>
                    <h3 className="font-semibold text-center flex-grow">{category} ({sortedAndFilteredTasks.filter(task => task.category === category).length})</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-6 h-6 text-gray-500 hover:text-blue-600 shrink-0" 
                      title={`הוסף ל${category}`} 
                      onClick={() => {
                        setNewTaskCategory(category);
                        setShowTaskModal(true);
                      }}
                    >
                      <span role="img" aria-label="Add">➕</span>
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto w-full min-w-0 box-border" data-category={category} data-droppable="true">
                    <div className="space-y-2 w-full min-w-0 box-border">
                      {showTaskModal && newTaskCategory === category && renderTask(null)}
                      {sortedAndFilteredTasks.filter(task => task.category === category).map((task) => (
                        <SortableItem key={`task-${task.id}`} id={`task-${task.id}`}> 
                          <div className="relative flex items-center group w-full min-w-0 box-border">
                            {/* Per-task collapse chevron (RTL: left) - always visible */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6 text-gray-400 hover:text-blue-600 shrink-0 ml-2 rtl:ml-0 rtl:mr-2"
                              title={kanbanTaskCollapsed[task.id] ? 'הרחב משימה' : 'צמצם משימה'}
                              onClick={(e) => { e.stopPropagation(); handleToggleTaskCollapse(task.id); }}
                              tabIndex={0}
                              aria-label={kanbanTaskCollapsed[task.id] ? 'הרחב משימה' : 'צמצם משימה'}
                            >
                              {kanbanTaskCollapsed[task.id] ? <ChevronLeft className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            {/* Category collapsed: always show collapsed block. Category expanded: show per-task state. */}
                            {kanbanCollapsed[category] || kanbanTaskCollapsed[task.id] ? (
                              <div className="flex-grow cursor-grab active:cursor-grabbing group w-full min-w-0 p-3 rounded-lg shadow-sm border bg-white flex items-center gap-2 min-h-[48px] box-border">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex-grow truncate text-right">
                                      <div className={`font-medium truncate ${task.done ? 'line-through text-gray-500' : ''}`}>{task.title}</div>
                                      {task.subtitle && (
                                        <div className={`text-xs text-gray-600 truncate ${task.done ? 'line-through' : ''}`}>{task.subtitle}</div>
                                      )}
                                      <div className="flex items-center gap-1 mt-1">
                                        <span className="text-xs">📊</span>
                                        <Select value={task.status || "מחכה"} onValueChange={(newStatus) => handleTaskStatusChange(task.id, newStatus)}>
                                          <SelectTrigger className="h-4 text-xs border-0 p-0 bg-transparent">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {task.eventId ? (
                                              ["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                                            ) : task.residentId ? (
                                              ["כולם בסדר", "זקוקים לסיוע", "לא בטוח"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                                            ) : (
                                              ["פתוח", "בטיפול", "הושלם"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                                            )}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" align="end" className="max-w-xs text-xs text-right whitespace-pre-line">
                                    {`🗓️ ${formatDateTime(task.dueDate)}\n🏢 ${task.department}\n${task.creatorAlias ? `📝 ${task.creatorAlias}\n` : ''}🏷️ ${task.category}\n${task.priority === 'דחוף' ? '🔥' : task.priority === 'נמוך' ? '⬇️' : '➖'} ${task.priority}`}
                                  </TooltipContent>
                                </Tooltip>
                                {/* Action buttons remain visible */}
                                <div className="flex items-center gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => {
                                          setEditingTaskId(task.id);
                                          setEditingTitle(task.title);
                                          setEditingSubtitle(task.subtitle || '');
                                          setEditingPriority(task.priority);
                                          setEditingCategory(task.category);
                                          if (task.dueDate) {
                                            const due = new Date(task.dueDate);
                                            if (!isNaN(due.getTime())) {
                                              setEditingDueDate(due.toLocaleDateString('en-CA'));
                                              setEditingDueTime(due.toTimeString().slice(0, 5));
                                            }
                                          }
                                          setEditingDepartment(task.department || '');
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>ערוך משימה</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 relative"
                                        onClick={() => {
                                          setReplyingToTaskId(task.id);
                                          setReplyInputValue("");
                                        }}
                                      >
                                        <MessageCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>הוסף תגובה</TooltipContent>
                                  </Tooltip>
                                  {!task.done && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="w-6 h-6 relative text-gray-400 hover:text-orange-600"
                                          title="שלח תזכורת"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleNudgeTask(task.id);
                                          }}
                                          onPointerDown={(e) => e.stopPropagation()}
                                        >
                                          <Bell className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>שלח תזכורת</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex-grow w-full min-w-0 box-border">{renderTask(task)}</div>
                            )}
                          </div>
                        </SortableItem>
                      ))}
                    </div>
                  </div>
                </SortableCategoryColumn>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="h-full overflow-y-auto pr-2">
          <div className="space-y-2 w-full">
            {showTaskModal && <div className="w-full">{renderTask(null)}</div>}
            {sortedAndFilteredTasks.length === 0 && !showTaskModal && (
              <div className="text-center text-gray-500 py-4 w-full">{'אין משימות להצגה'}</div>
            )}
            {sortedAndFilteredTasks.map((task) => {
              const overdue = isTaskOverdue(task);
              const overdue12h = isTaskOverdue12h(task);
              return (
                <SortableItem key={task.id} id={`task-${task.id}`}>
                  <div className="relative flex items-center group w-full min-w-0 box-border">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-gray-400 hover:text-blue-600 shrink-0 ml-2 rtl:ml-0 rtl:mr-2"
                      title={kanbanTaskCollapsed[task.id] ? 'הרחב משימה' : 'צמצם משימה'}
                      onClick={(e) => { e.stopPropagation(); handleToggleTaskCollapse(task.id); }}
                      tabIndex={0}
                      aria-label={kanbanTaskCollapsed[task.id] ? 'הרחב משימה' : 'צמצם משימה'}
                    >
                      {kanbanTaskCollapsed[task.id] ? <ChevronLeft className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    {kanbanTaskCollapsed[task.id] ? (
                      <div className="flex-grow cursor-grab active:cursor-grabbing group w-full min-w-0 p-3 rounded-lg shadow-sm border bg-white flex items-center gap-2 min-h-[48px] box-border">
                        <div className="flex-grow truncate text-right">
                          <div className={`font-medium truncate ${task.done ? 'line-through text-gray-500' : ''}`}>{task.title}</div>
                          {task.subtitle && (
                            <div className={`text-xs text-gray-600 truncate ${task.done ? 'line-through' : ''}`}>{task.subtitle}</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div 
                        className={`flex-grow w-full min-w-0 box-border flex items-start justify-between p-2 cursor-grab active:cursor-grabbing 
                          ${task.done ? 'bg-gray-100 opacity-70' : ''} 
                          ${overdue && showOverdueEffects ? 'after:content-[""] after:absolute after:top-0 after:bottom-0 after:right-0 after:w-1 after:bg-red-500 relative' : ''} 
                          ${overdue12h && showOverdueEffects ? 'animate-pulse bg-yellow-50' : ''}`}
                      >
                        {renderTask(task)}
                      </div>
                    )}
                  </div>
                </SortableItem>
              );
            })}
          </div>
        </div>
      )}

      {/* Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeId && activeId.startsWith('task-') ? (
          <div className="p-2 border rounded shadow-xl bg-white opacity-90">
            <div className="flex items-start space-x-3 space-x-reverse">
              <Checkbox checked={false} readOnly className="mt-1 shrink-0"/>
              <div className="flex-grow overflow-hidden">
                <div className="font-medium text-sm cursor-grabbing">Task being dragged...</div>
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 shrink-0 text-right">{'היסטוריית משימות שבוצעו'}</h2>
            <div className="overflow-y-auto flex-grow mb-4 border rounded p-2 bg-gray-50">
              <ul className="space-y-2">
                {archivedTasks
                  .sort((a, b) => {
                    const aTime = a.completedAt?.toDate ? a.completedAt.toDate().getTime() : new Date(a.completedAt).getTime();
                    const bTime = b.completedAt?.toDate ? b.completedAt.toDate().getTime() : new Date(b.completedAt).getTime();
                    return bTime - aTime;
                  })
                  .map(task => {
                    // Convert Firestore Timestamps to JS Dates if needed
                    const createdAt = task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
                    const completedAt = task.completedAt?.toDate ? task.completedAt.toDate() : new Date(task.completedAt);
                    let duration = "";
                    if (completedAt && createdAt && !isNaN(completedAt.getTime()) && !isNaN(createdAt.getTime())) {
                      try {
                        const durationMs = completedAt.getTime() - createdAt.getTime();
                        duration = formatDuration(durationMs);
                      } catch { duration = "N/A"; }
                    }
                    // Find latest reply if any
                    let latestReply = null;
                    if (Array.isArray(task.replies) && task.replies.length > 0) {
                      latestReply = task.replies.reduce((latest, curr) => {
                        const currTime = curr.timestamp?.toDate ? curr.timestamp.toDate().getTime() : new Date(curr.timestamp).getTime();
                        const latestTime = latest ? (latest.timestamp?.toDate ? latest.timestamp.toDate().getTime() : new Date(latest.timestamp).getTime()) : 0;
                        return currTime > latestTime ? curr : latest;
                      }, null);
                    }
                    // Prefer alias for completedBy if available
                    const completedBy = task.completedByAlias || task.completedBy || task.completedByEmail || 'לא ידוע';
                    return (
                      <li key={`hist-${task.id}`} className="p-2 border rounded bg-white text-sm text-right">
                        <div className="font-medium">
                          {task.title}{task.subtitle ? ` - ${task.subtitle}` : ''}
                        </div>
                        {latestReply && latestReply.text && (
                          <div className="text-xs text-blue-700 mt-1 border-b pb-1">{latestReply.text}</div>
                        )}
                        <div className="text-xs text-gray-600 mt-1">
                          {'בוצע על ידי '}
                          <span className="font-semibold">{completedBy}</span>
                          {' בתאריך '}
                          <span className="font-semibold">{formatDateTime(completedAt)}</span>
                          {duration && <span className="ml-2 mr-2 pl-2 border-l">{'משך: '}<span className="font-semibold">{duration}</span></span>}
                        </div>
                        {role === 'admin' && (
                          <Button variant="outline" size="sm" className="mt-2" onClick={() => restoreTask(task)}>
                            {'שחזר משימה'}
                          </Button>
                        )}
                      </li>
                    );
                  })
                }
                {archivedTasks.length === 0 && (
                   <li className="text-center text-gray-500 py-6">{'אין משימות בהיסטוריה.'}</li>
                )}
              </ul>
            </div>
            <div className="mt-auto pt-4 border-t flex justify-end shrink-0">
              <Button variant="outline" onClick={() => setShowHistoryModal(false)}>{'סגור'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  </DndContext>
  );
}
