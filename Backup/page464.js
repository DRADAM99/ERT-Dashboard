"use client";






import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from 'next/image';


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, RotateCcw, Bell, ChevronDown } from 'lucide-react';


import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";


import SortableItem from "../components/ui/sortable-item";

import DroppableCalendar from "../components/DroppableCalendar";


import moment from 'moment-timezone';
import 'moment/locale/he';

import { Calendar as BigCalendar, momentLocalizer } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';


import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    Legend,
} from 'recharts';


/*
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, Timestamp, arrayUnion } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
*/


/*
const firebaseConfig = {
  apiKey: "AIzaSyBVIjO_f5GKTal8xpG-QA7aLtWX2A9skoI",
  authDomain: "crm-dashboard-2db5f.firebaseapp.com",
  projectId: "crm-dashboard-2db5f",
  storageBucket: "crm-dashboard-2db5f.appspot.com",
  messagingSenderId: "668768143823",
  appId: "1:668768143823:web:ab8619b6ccb90de97e6aba"
};
let app;
if (!getApps().length) { app = initializeApp(firebaseConfig); } else { app = getApp(); }
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
*/


function isTaskOverdue(task) {
  if (task.done) return false;
  const now = new Date();
  const due = new Date(task.dueDate);
  return due < now;
}
function isTaskOverdue12h(task) {
  if (!task || task.done || !task.dueDate) return false;
  const now = new Date();
  const due = new Date(task.dueDate);
  const twelveHours = 12 * 60 * 60 * 1000;
  return now - due > 0 && now - due <= twelveHours;
}

const formatDateTime = (date) => {
  if (!date) return "";
  try {

    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  } catch (error) { console.error("Error formatting date:", date, error); return ""; }

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


moment.locale('he');
moment.tz.setDefault("Asia/Jerusalem");
const localizer = momentLocalizer(moment);
const messages = { allDay: "כל היום", previous: "הקודם", next: "הבא", today: "היום", month: "חודש", week: "שבוע", day: "יום", agenda: "סדר יום", date: "תאריך", time: "זמן", event: "אירוע", noEventsInRange: "אין אירועים בטווח זה", showMore: (total) => `+ ${total} נוספים`, };


const leadStatusConfig = { "חדש": { color: "bg-red-500", priority: 1 }, "מעקב": { color: "bg-orange-500", priority: 2 }, "ממתין ליעוץ עם אדם": { color: "bg-purple-500", priority: 3 }, "תור נקבע": { color: "bg-green-500", priority: 4 }, "בסדרת טיפולים": { color: "bg-emerald-400", priority: 6 }, "באג": { color: "bg-yellow-900", priority: 5 }, "לא מתאים": { color: "bg-gray-400", priority: 7 }, "אין מענה": { color: "bg-yellow-500", priority: 5 }, "Default": { color: "bg-gray-300", priority: 99 } };
const leadColorTab = (status) => leadStatusConfig[status]?.color || leadStatusConfig.Default.color;
const leadPriorityValue = (status) => leadStatusConfig[status]?.priority || leadStatusConfig.Default.priority;


const taskCategories = ["לקבוע סדרה", "דוחות", "תשלומים", "להתקשר", "אדם", "אחר"];
const taskPriorities = ["דחוף", "רגיל", "נמוך"];




export default function Dashboard() {

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [isFullView, setIsFullView] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState('');
  const defaultBlockOrder = { TM: 1, Calendar: 2, Leads: 3 };
  const [blockOrder, setBlockOrder] = useState(defaultBlockOrder);


  const [showNLPModal, setShowNLPModal] = useState(false);
  const [nlpInput, setNlpInput] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTaskId, setReturnTaskId] = useState(null);
  const [returnComment, setReturnComment] = useState("");
  const [returnNewAssignee, setReturnNewAssignee] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [newLeadFullName, setNewLeadFullName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadMessage, setNewLeadMessage] = useState("");
  const [newLeadStatus, setNewLeadStatus] = useState("חדש");
  const [newLeadSource, setNewLeadSource] = useState("");


  const [tasks, setTasks] = useState([

    { id: 'task-1', assignTo: "עצמי", title: "משימה 1 - לקבוע סדרה", subtitle: "תיאור משימה 1", priority: "רגיל", category: "לקבוע סדרה", dueDate: new Date(new Date().setDate(new Date().getDate() + 1)), done: false, completedBy: null, completedAt: null, createdAt: new Date(new Date().setDate(new Date().getDate() - 1)), creatorId: "creator-A", },
    { id: 'task-2', assignTo: "עצמי", title: "משימה 2 - דוחות (בוצעה)", subtitle: "תיאור משימה 2", priority: "רגיל", category: "דוחות", dueDate: new Date(new Date().setDate(new Date().getDate() - 1)), done: true, completedBy: "creator-B", completedAt: new Date(new Date().setDate(new Date().getDate() - 1)), createdAt: new Date(new Date().setDate(new Date().getDate() - 2)), creatorId: "creator-B", },
    { id: 'task-3', assignTo: "משתמש אחר", title: "משימה 3 - תשלומים (דחופה)", subtitle: "תיאור משימה 3", priority: "דחוף", category: "תשלומים", dueDate: new Date(), done: false, completedBy: null, completedAt: null, createdAt: new Date(new Date().setHours(new Date().getHours() - 5)), creatorId: "creator-A", },
    { id: 'task-4', assignTo: "אדם", title: "משימה 4 - להתקשר", subtitle: "משימה עבור אדם", priority: "רגיל", category: "להתקשר", dueDate: new Date(new Date().setDate(new Date().getDate() + 2)), done: false, completedBy: null, completedAt: null, createdAt: new Date(new Date().setDate(new Date().getDate() - 3)), creatorId: "creator-B", },
    { id: 'task-5', assignTo: "עצמי", title: "משימה 5 - אדם", subtitle: "תיאור משימה 5 לאדם", priority: "נמוך", category: "אדם", dueDate: new Date(new Date().setDate(new Date().getDate() + 5)), done: false, completedBy: null, completedAt: null, createdAt: new Date(new Date().setDate(new Date().getDate() - 7)), creatorId: "creator-A", },
    { id: 'task-6', assignTo: "עצמי", title: "משימה 6 - אחר", subtitle: "תיאור משימה 6", priority: "רגיל", category: "אחר", dueDate: new Date(new Date().setDate(new Date().getDate() + 3)), done: false, completedBy: null, completedAt: null, createdAt: new Date(), creatorId: "creator-B", },
  ]);
  const [taskFilter, setTaskFilter] = useState("הכל");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("all");
  const [selectedTaskCategories, setSelectedTaskCategories] = useState([]);
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const [isTMFullView, setIsTMFullView] = useState(false);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [userHasSortedTasks, setUserHasSortedTasks] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingAssignTo, setEditingAssignTo] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingSubtitle, setEditingSubtitle] = useState("");
  const [editingPriority, setEditingPriority] = useState("רגיל");
  const [editingCategory, setEditingCategory] = useState(taskCategories[0] || "");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [editingDueTime, setEditingDueTime] = useState("");



  const [leads, setLeads] = useState([

    { id: 'lead-1', createdAt: new Date(new Date().setDate(new Date().getDate() - 10)), fullName: "יוסי כהן", phoneNumber: "0501234567", message: "פולו-אפ על פגישה", status: "מעקב", source: "פייסבוק", conversationSummary: [ { text: "יצירת קשר ראשונית.", timestamp: new Date(new Date().setDate(new Date().getDate() - 10)) }, { text: "תיאום פגישה.", timestamp: new Date(new Date().setDate(new Date().getDate() - 9)) }, ], expanded: false, appointmentDateTime: null, },
    { id: 'lead-2', createdAt: new Date(new Date().setDate(new Date().getDate() - 5)), fullName: "שרה מזרחי", phoneNumber: "0527654321", message: "שיחת בירור מצב", status: "תור נקבע", source: "מבצע טלמרקטינג", conversationSummary: [ { text: "שוחחנו על המצב, תיאום שיחה נוספת.", timestamp: new Date(new Date().setDate(new Date().getDate() - 5)) }, ], expanded: false, appointmentDateTime: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(), },
    { id: 'lead-3', createdAt: new Date(new Date().setDate(new Date().getDate() - 2)), fullName: "בני גנץ", phoneNumber: "0509876543", message: "לא היה מענה", status: "חדש", source: "אתר אינטרנט", conversationSummary: [], expanded: false, appointmentDateTime: null, },
    { id: 'lead-4', createdAt: new Date(new Date().setDate(new Date().getDate() - 1)), fullName: "דנה לוי", phoneNumber: "0541122334", message: "קבעה פגישה לשבוע הבא", status: "תור נקבע", source: "המלצה", conversationSummary: [ { text: "שיחה ראשונית, עניין רב.", timestamp: new Date(new Date().setDate(new Date().getDate() - 1)) }, { text: "נקבעה פגישת ייעוץ ל-15/4.", timestamp: new Date(new Date().setDate(new Date().getDate() - 1)) }, ], expanded: false, appointmentDateTime: new Date(2025, 3, 15, 10, 30).toISOString(), },
  ]);
  const [editingLeadId, setEditingLeadId] = useState(null);
  const [editLeadFullName, setEditLeadFullName] = useState("");
  const [editLeadPhone, setEditLeadPhone] = useState("");
  const [editLeadMessage, setEditLeadMessage] = useState("");
  const [editLeadStatus, setEditLeadStatus] = useState("חדש");
  const [editLeadSource, setEditLeadSource] = useState("");
  const [editLeadAppointmentDateTime, setEditLeadAppointmentDateTime] = useState("");
  const [editLeadNLP, setEditLeadNLP] = useState("");
  const [newConversationText, setNewConversationText] = useState("");
  const [showConvUpdate, setShowConvUpdate] = useState(null);
  const [leadSortBy, setLeadSortBy] = useState("priority");
  const [leadTimeFilter, setLeadTimeFilter] = useState("all");
  const [leadFilterFrom, setLeadFilterFrom] = useState("");
  const [leadFilterTo, setLeadFilterTo] = useState("");
  const [leadSearchTerm, setLeadSearchTerm] = useState("");


  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState("month");
  const [analyticsFilterFrom, setAnalyticsFilterFrom] = useState("");
  const [analyticsFilterTo, setAnalyticsFilterTo] = useState("");



  const [activeId, setActiveId] = useState(null);
  const [prefillCategory, setPrefillCategory] = useState(null);


  const [assignableUsers, setAssignableUsers] = useState([]);


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, })
  );









  useEffect(() => {
    setMounted(true);
    const savedOrder = localStorage.getItem("dashboardBlockOrder");
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        if (parsedOrder.TM && parsedOrder.Calendar && parsedOrder.Leads) {
          setBlockOrder(parsedOrder);
        } else {
           console.warn("Invalid block order found in localStorage, using default.");
           localStorage.removeItem("dashboardBlockOrder");
           setBlockOrder(defaultBlockOrder);
        }
      } catch (error) {
        console.error("Failed to parse dashboard block order from localStorage:", error);
        localStorage.removeItem("dashboardBlockOrder");
        setBlockOrder(defaultBlockOrder);
      }
    } else {
        setBlockOrder(defaultBlockOrder);
    }
  }, []);


  useEffect(() => {
    const updateTime = () => {
      const formattedDateTime = moment().format('dddd, D MMMM YYYY HH:mm');
      setCurrentDateTime(formattedDateTime);
    };
    updateTime();
    const intervalId = setInterval(updateTime, 60000);
    return () => clearInterval(intervalId);
  }, []);





  /**
   * Cycles the display order position of a dashboard block (TM, Calendar, Leads)
   * and saves the new order to localStorage.
   * @param {'TM' | 'Calendar' | 'Leads'} key - The key of the block to reorder.
   */
  const toggleBlockOrder = useCallback((key) => {
    setBlockOrder((prevOrder) => {
      const currentPosition = prevOrder[key];
      const newPosition = currentPosition === 3 ? 1 : currentPosition + 1;
      const keyToSwap = Object.keys(prevOrder).find(k => prevOrder[k] === newPosition);
      const newOrder = { ...prevOrder, [key]: newPosition };
      if (keyToSwap && keyToSwap !== key) {
          newOrder[keyToSwap] = currentPosition;
      }
      if (mounted) {
        try { localStorage.setItem("dashboardBlockOrder", JSON.stringify(newOrder)); }
        catch (error) { console.error("Failed to save block order:", error); }
      }
      return newOrder;
    });
  }, [mounted]);










  /**
  * Toggles a category in the selectedTaskCategories filter state.
  * @param {string} category - The category string to toggle.
  */
  const handleCategoryToggle = useCallback((category) => {
    setSelectedTaskCategories((prevSelected) => {
      const isSelected = prevSelected.includes(category);
      if (isSelected) {

        return prevSelected.filter(c => c !== category);
      } else {

        return [...prevSelected, category];
      }
    });


  }, [setSelectedTaskCategories]);


  /**
  * Parses task details (category, due date, time) from natural language input.
  * @param {string} text - The natural language input string.
  * @returns {object} - A partial task object with extracted details.
  */
  const parseTaskFromText = useCallback((text) => {

    let category = taskCategories.find(cat => text.toLowerCase().includes(cat.toLowerCase())) || "אחר";
    let dueDate = new Date();
    let dueTime = "13:00";


    if (text.includes("מחר")) {
      dueDate.setDate(dueDate.getDate() + 1);
    } else if (text.includes("מחרתיים")) {
        dueDate.setDate(dueDate.getDate() + 2);
    }

     const dateMatch = text.match(/(\d{1,2})[./](\d{1,2})/);
     if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10) - 1;
        const currentYear = new Date().getFullYear();

        const potentialDate = new Date(currentYear, month, day);

        if (potentialDate < new Date(Date.now() - 30*24*60*60*1000) && !text.match(/(\d{4})/)) {
          dueDate.setFullYear(currentYear + 1, month, day);
        } else {
          dueDate.setFullYear(currentYear, month, day);
        }
     }



    const timeMatch = text.match(/(?:בשעה|ב)\s*(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      dueTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    } else {
        const singleHourMatch = text.match(/(?:בשעה|ב)\s*(\d{1,2})(?!\d|:)/);
        if (singleHourMatch) {
            dueTime = `${singleHourMatch[1].padStart(2, '0')}:00`;
        }
    }


    const [hours, minutes] = dueTime.split(":").map(Number);
    dueDate.setHours(hours, minutes, 0, 0);


    let title = text
        .replace(/מחרתיים|מחר/g, '')
        .replace(/(?:בשעה|ב)\s*(\d{1,2}):?(\d{2})?/g, '')
        .replace(/(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?/g,'')

        .replace(new RegExp(`\\b(${taskCategories.join('|')})\\b`, 'gi'), (match, p1, offset, string) => string.trim() === match ? match : '')
        .trim();

    if (!title) {
        title = text;
    }


    return {

      assignTo: "עצמי",
      title: title,
      subtitle: "",
      priority: "רגיל",
      category,
      dueDate,
      done: false,
      completedBy: null,
      completedAt: null

    };
  }, []);

  /**
  * Handles submission of the NLP task form.
  * Parses input, creates a new task, adds creatorId,
  * adds it to state, and closes the modal.
  * @param {React.FormEvent} e - The form submission event.
  */
  const handleNLPSubmit = useCallback((e) => {
    e.preventDefault();
    if (!nlpInput.trim()) return;

    const parsedDetails = parseTaskFromText(nlpInput);
    const finalCategory = prefillCategory || parsedDetails.category;

    const newTask = {
      ...parsedDetails,
      category: finalCategory,
      id: `task-${Date.now()}`,
      createdAt: new Date(),

      creatorId: "current-user-placeholder"
    };
    setTasks((prevTasks) => [newTask, ...prevTasks]);
    setNlpInput("");
    setShowNLPModal(false);
    setPrefillCategory(null);
  }, [nlpInput, parseTaskFromText, prefillCategory, setTasks, setNlpInput, setShowNLPModal, setPrefillCategory]);

  /**
  * Toggles the completion status of a task and records completion info.
  * @param {string} id - The ID of the task to toggle.
  */
  const toggleTaskDone = useCallback((id) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) => {
        if (task.id === id) {
          const isNowDone = !task.done;
          console.log(`Toggling task ${id} to done=${isNowDone}`);
          return {
            ...task,
            done: isNowDone,

            completedBy: isNowDone ? "current-user-placeholder" : null,
            completedAt: isNowDone ? new Date() : null,
          };
        }
        return task;
      })
    );
  }, [setTasks]);

  /**
  * Populates the editing form state when the user clicks the edit button on a task.
  * @param {object | null} task - The task object to edit, or null if not found.
  */
  const handleEditTask = useCallback((task) => {
    if (!task) {
        console.error("handleEditTask called with null task");
        setEditingTaskId(null);
        return;
    }
    console.log(`Editing task: ${task.id}`);
    setEditingTaskId(task.id);
    setEditingAssignTo(task.assignTo);
    setEditingTitle(task.title);
    setEditingSubtitle(task.subtitle || "");
    setEditingPriority(task.priority);
    setEditingCategory(task.category);

    try {
        const due = new Date(task.dueDate);
         if (isNaN(due.getTime())) throw new Error("Invalid date object");

        setEditingDueDate(due.toISOString().split("T")[0]);
        setEditingDueTime(due.toTimeString().split(" ")[0].slice(0, 5));
    } catch (error) {
        console.error("Error processing task due date for editing:", task.dueDate, error);

        setEditingDueDate("");
        setEditingDueTime("");
    }
  }, [setEditingTaskId, setEditingAssignTo, setEditingTitle, setEditingSubtitle, setEditingPriority, setEditingCategory, setEditingDueDate, setEditingDueTime]);

  /**
  * Saves the edited task details back to the main tasks state.
  * Combines date and time inputs into a Date object.
  * @param {React.FormEvent} e - The form submission event.
  */
  const handleSaveTask = useCallback((e) => {
    e.preventDefault();
    if (!editingTaskId) return;

    let dueDateTime;
    try {


        const timeString = editingDueTime || "00:00";

        if (!editingDueDate || typeof editingDueDate !== 'string' || !editingDueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {

            dueDateTime = null;
            console.log("No valid due date provided for saving task.");
        } else {
            dueDateTime = new Date(`${editingDueDate}T${timeString}:00`);
             if (isNaN(dueDateTime.getTime())) throw new Error("Invalid combined date/time");
        }
    } catch (error) {
        console.error("Error creating due date from inputs:", editingDueDate, editingDueTime, error);


        dueDateTime = null;
    }


    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === editingTaskId
          ? {
              ...task,
              assignTo: editingAssignTo,
              title: editingTitle,
              subtitle: editingSubtitle,
              priority: editingPriority,
              category: editingCategory,
              dueDate: dueDateTime,

            }
          : task
      )
    );
    setEditingTaskId(null);

     setEditingAssignTo("");
     setEditingTitle("");
     setEditingSubtitle("");
     setEditingPriority("רגיל");
     setEditingCategory(taskCategories[0] || "");
     setEditingDueDate("");
     setEditingDueTime("");
  }, [
      editingTaskId, editingAssignTo, editingTitle, editingSubtitle,
      editingPriority, editingCategory, editingDueDate, editingDueTime,
      setTasks, setEditingTaskId, setEditingAssignTo, setEditingTitle, setEditingSubtitle,
      setEditingPriority, setEditingCategory, setEditingDueDate, setEditingDueTime
  ]);

  /**
  * Cancels the task editing process and clears the editing form state.
  */
  const handleCancelEdit = useCallback(() => {
    setEditingTaskId(null);

     setEditingAssignTo("");
     setEditingTitle("");
     setEditingSubtitle("");
     setEditingPriority("רגיל");
     setEditingCategory(taskCategories[0] || "");
     setEditingDueDate("");
     setEditingDueTime("");
  }, [setEditingTaskId, setEditingAssignTo, setEditingTitle, setEditingSubtitle, setEditingPriority, setEditingCategory, setEditingDueDate, setEditingDueTime]);

  /** --- NEW: Handler for Complete & Reply --- */
  const handleCompleteAndReply = useCallback(async (taskId) => {
    console.log(`Complete & Reply action initiated for task: ${taskId}`);
    const task = tasks.find(t => t.id === taskId);
    if (!task) {
        console.error("Cannot reply: Task not found locally.");
        alert("שגיאה: המשימה לא נמצאה.");
        return;
    }

    if (!task.creatorId || task.creatorId === "current-user-placeholder") {
        alert("לא ניתן לשלוח תגובה למשימה זו (אין יוצר או שאתה היוצר).");
        return;
    }


    console.log(`Placeholder: Would open reply modal for task ${taskId} (creator: ${task.creatorId})`);
    const replyMessage = prompt(`הזן תגובה עבור המשימה "${task.title}":`);

    if (replyMessage === null || !replyMessage.trim()) {
        console.log("Reply cancelled or empty.");
        return;
    }


    console.log(`Placeholder: Would mark task ${taskId} done and create reply task for ${task.creatorId} with message: ${replyMessage}`);
    alert('פונקציונליות השלמה ותגובה עדיין בפיתוח.');








  }, [tasks, setTasks]);


  /**
  * Handles submission of the "Return Task" modal. (Placeholder)
  * @param {React.FormEvent} e - The form submission event.
  */
  const handleReturnSubmit = useCallback((e) => {
    e.preventDefault();
    if (!returnTaskId) return;
    console.log("Returning task:", returnTaskId, "to:", returnNewAssignee, "Comment:", returnComment);

    alert("פונקציונליות החזרת משימה עדיין בפיתוח.");

    setShowReturnModal(false);
    setReturnComment("");
    setReturnNewAssignee("");
    setReturnTaskId(null);
  }, [returnTaskId, returnNewAssignee, returnComment, setShowReturnModal, setReturnComment, setReturnNewAssignee, setReturnTaskId]);

  /**
  * Removes all tasks marked as 'done' from the tasks state after confirmation.
  */
  const handleClearDoneTasks = useCallback(() => {

    if (window.confirm("האם אתה בטוח שברצונך למחוק את כל המשימות שבוצעו? לא ניתן לשחזר פעולה זו.")) {
      setTasks((prevTasks) => prevTasks.filter(task => !task.done));


    }
  }, [setTasks]);






  /** Checks if a lead's creation date falls within the selected time filter range. */
  const isLeadInTimeRange = useCallback((lead) => {
    try {
        const created = new Date(lead.createdAt);
        if (isNaN(created.getTime())) return false;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (leadTimeFilter === "week") {
        const oneWeekAgo = new Date(todayStart);
        oneWeekAgo.setDate(todayStart.getDate() - 7);
        return created >= oneWeekAgo;
        } else if (leadTimeFilter === "month") {
        const oneMonthAgo = new Date(todayStart);
        oneMonthAgo.setMonth(todayStart.getMonth() - 1);
        return created >= oneMonthAgo;
        } else if (leadTimeFilter === "custom") {
        let inRange = true;
        if (leadFilterFrom) {
            const fromDate = new Date(leadFilterFrom);
            fromDate.setHours(0, 0, 0, 0);
             if (isNaN(fromDate.getTime())) { /* handle invalid date */ }
             else if (created < fromDate) inRange = false;
        }
        if (leadFilterTo) {
            const toDate = new Date(leadFilterTo);
            toDate.setHours(23, 59, 59, 999);
             if (isNaN(toDate.getTime())) { /* handle invalid date */ }
             else if (created > toDate) inRange = false;
        }
        return inRange;
        } else {

        return true;
        }
    } catch (error) {
        console.error("Error checking lead time range:", lead, error);
        return false;
    }
  }, [leadTimeFilter, leadFilterFrom, leadFilterTo]);

  /** Comparison function for sorting leads based on selected criteria */
  const compareLeads = useCallback((a, b) => {
    if (leadSortBy === "priority") {


      const priorityDiff = leadPriorityValue(a.status) - leadPriorityValue(b.status);
      if (priorityDiff !== 0) return priorityDiff;
      try {

          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
          return dateA.getTime() - dateB.getTime();
      } catch(e) { return 0; }
    } else {

      try {

          const dateA = new Date(a.createdAt);
          const dateB = new Date(b.createdAt);
          if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
          return dateA.getTime() - dateB.getTime();
      } catch(e) { return 0; }
    }
  }, [leadSortBy]);

  /** Populates the editing form state for a lead. */
  const handleEditLead = useCallback((lead) => {
    if (!lead) return;
    setEditingLeadId(lead.id);
    setEditLeadFullName(lead.fullName);
    setEditLeadPhone(lead.phoneNumber);
    setEditLeadMessage(lead.message);
    setEditLeadStatus(lead.status);
    setEditLeadSource(lead.source || "");
    setEditLeadNLP("");
    setNewConversationText("");


    if (lead.appointmentDateTime) {
        try {
            const apptDate = new Date(lead.appointmentDateTime);
            if (!isNaN(apptDate.getTime())) {
                const year = apptDate.getFullYear();
                const month = (apptDate.getMonth() + 1).toString().padStart(2, '0');
                const day = apptDate.getDate().toString().padStart(2, '0');
                const hours = apptDate.getHours().toString().padStart(2, '0');
                const minutes = apptDate.getMinutes().toString().padStart(2, '0');
                setEditLeadAppointmentDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
            } else {
                 setEditLeadAppointmentDateTime("");
            }
        } catch {
            setEditLeadAppointmentDateTime("");
        }
    } else {
        setEditLeadAppointmentDateTime("");
    }


    setLeads((prevLeads) =>
      prevLeads.map((l) => ({ ...l, expanded: l.id === lead.id }))
    );
  }, [setEditingLeadId, setEditLeadFullName, setEditLeadPhone, setEditLeadMessage, setEditLeadStatus, setEditLeadSource, setEditLeadNLP, setNewConversationText, setEditLeadAppointmentDateTime, setLeads]);

  /** Creates a follow-up task from lead edit form. Adds task to state. */
  const handleLeadNLPSubmit = useCallback((leadId) => {
    if (!editLeadNLP.trim()) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const parsedDetails = parseTaskFromText(editLeadNLP);
    const newTask = {
      ...parsedDetails,
      id: `task-${Date.now()}`,
      assignTo: "עצמי",
      title: `מעקב ${lead.fullName}: ${parsedDetails.title}`,
      subtitle: editLeadNLP,
      createdAt: new Date(),

      creatorId: "current-user-placeholder"
    };
    setTasks((prevTasks) => [...prevTasks, newTask]);
    setEditLeadNLP("");
  }, [editLeadNLP, leads, parseTaskFromText, setTasks, setEditLeadNLP]);

  /** Saves the edited lead details back to the main leads state. Creates task if needed. */
  const handleSaveLead = useCallback((e, leadId) => {
    e.preventDefault();
    let appointmentDate = null;
    if (editLeadStatus === 'תור נקבע' && editLeadAppointmentDateTime) {
        try {
            appointmentDate = new Date(editLeadAppointmentDateTime);
            if (isNaN(appointmentDate.getTime())) { alert("תאריך פגישה לא תקין."); return; }
        } catch { alert("תאריך פגישה לא תקין."); return; }
    }
    const originalLead = leads.find(l => l.id === leadId);
    setLeads((prevLeads) =>
      prevLeads.map((l) => (l.id === leadId ? {
          ...l, fullName: editLeadFullName, phoneNumber: editLeadPhone, message: editLeadMessage,
          status: editLeadStatus, source: editLeadSource,
          appointmentDateTime: editLeadStatus === 'תור נקבע' ? (appointmentDate ? appointmentDate.toISOString() : null) : null,
          expanded: false,
      } : l))
    );

    if (originalLead?.status !== 'תור נקבע' && editLeadStatus === 'תור נקבע' && appointmentDate) {
        const newTask = {
            id: `task-appt-${leadId}-${Date.now()}`, assignTo: "עצמי", title: `פגישת ייעוץ - ${editLeadFullName}`,
            subtitle: `נקבעה פגישה מליד ${leadId}`, priority: "רגיל", category: "לקבוע סדרה",
            dueDate: appointmentDate, done: false, completedBy: null, completedAt: null, createdAt: new Date(),

            creatorId: "current-user-placeholder"
        };
        setTasks((prevTasks) => [...prevTasks, newTask]);
        console.log("Auto-created task for appointment:", newTask);
    }
    setEditingLeadId(null);
    setEditLeadAppointmentDateTime("");
  }, [ leads, editLeadFullName, editLeadPhone, editLeadMessage, editLeadStatus, editLeadSource, editLeadAppointmentDateTime, setTasks, setLeads, setEditingLeadId, setEditLeadAppointmentDateTime ]);

  /** Collapses a lead's detailed/editing view. */
  const handleCollapseLead = useCallback((leadId) => {
    setLeads((prevLeads) =>
      prevLeads.map((l) => (l.id === leadId ? { ...l, expanded: false } : l))
    );

    if (editingLeadId === leadId) {
      setEditingLeadId(null);
      setEditLeadAppointmentDateTime("");
    }
  }, [editingLeadId, setLeads, setEditingLeadId, setEditLeadAppointmentDateTime]);

  /** Adds a new entry to a lead's conversation summary. */
  const handleAddConversation = useCallback((leadId) => {
    if (!newConversationText.trim()) return;
    setLeads((prevLeads) =>
      prevLeads.map((l) => {
        if (l.id === leadId) {
          const newEntry = {
            text: newConversationText,
            timestamp: new Date(),
          };

          const updatedSummaries = [newEntry, ...(l.conversationSummary || [])];
          return { ...l, conversationSummary: updatedSummaries };
        }
        return l;
      })
    );
    setNewConversationText("");

    setShowConvUpdate(leadId);
  }, [newConversationText, setLeads, setNewConversationText, setShowConvUpdate]);

  /** Handles submission of the Add New Lead modal form. */
  const handleAddNewLead = useCallback((e) => {
      e.preventDefault();

      if (!newLeadFullName.trim() || !newLeadPhone.trim()) {
          alert("אנא מלא שם מלא ומספר טלפון.");
          return;
      }


      const newLead = {
          id: `lead-${Date.now()}`,
          createdAt: new Date(),
          fullName: newLeadFullName.trim(),
          phoneNumber: newLeadPhone.trim(),
          message: newLeadMessage.trim(),
          status: newLeadStatus,
          source: newLeadSource.trim(),
          conversationSummary: [],
          expanded: false,
          appointmentDateTime: null,
      };


      setLeads(prevLeads => [newLead, ...prevLeads]);


      setNewLeadFullName("");
      setNewLeadPhone("");
      setNewLeadMessage("");
      setNewLeadStatus("חדש");
      setNewLeadSource("");
      setShowAddLeadModal(false);

  }, [
      newLeadFullName, newLeadPhone, newLeadMessage,
      newLeadStatus, newLeadSource,
      setLeads, setNewLeadFullName, setNewLeadPhone, setNewLeadMessage, setNewLeadStatus, setNewLeadSource, setShowAddLeadModal
  ]);





  const handleDragStart = useCallback((event) => { setActiveId(event.active.id); }, [setActiveId]);
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || !active || active.id === over.id) { return; }
    const activeId = active.id;
    const overId = over.id;


    const activeTaskId = typeof activeId === 'string' && activeId.startsWith('task-') ? activeId.replace('task-', '') : null;
    if (!activeTaskId) {
      console.error("Dragged item ID is not a valid task ID:", activeId);
      return;
    }
    const activeTask = tasks.find(t => t.id === activeTaskId);
    if (!activeTask) {
        console.error("Cannot find dragged task in state:", activeTaskId);
        return;
    }


    if (overId === "calendar-dropzone") {
      console.log(`Task ${activeId} dropped on Calendar`);
      const currentDueDate = new Date(activeTask.dueDate);
      const newDueDate = new Date(selectedDate);
      if (!isNaN(currentDueDate.getTime())) { newDueDate.setHours(currentDueDate.getHours(), currentDueDate.getMinutes(), 0, 0); }
      else { newDueDate.setHours(12, 0, 0, 0); }
      setTasks((prevTasks) => prevTasks.map((task) => task.id === activeTask.id ? { ...task, dueDate: newDueDate } : task ));
      return;
    }


    const overContainerId = over.data?.current?.sortable?.containerId;
    const activeContainerId = active.data?.current?.sortable?.containerId;
    if (activeContainerId && overContainerId && activeContainerId !== overContainerId) {

        console.log(`Moving task ${activeId} to category ${overContainerId}`);
        if (taskCategories.includes(overContainerId)) {
            setTasks((prevTasks) => prevTasks.map((task) => task.id === activeTask.id ? { ...task, category: overContainerId } : task ));
        }
    } else if (activeId !== overId) {


        const overTaskId = typeof overId === 'string' && overId.startsWith('task-') ? overId.replace('task-', '') : null;
        const oldIndex = tasks.findIndex((t) => t.id === activeTaskId);
        const newIndex = tasks.findIndex((t) => t.id === overTaskId);

        if (oldIndex !== -1 && newIndex !== -1) {
            console.log(`Reordering task ${activeId} from index ${oldIndex} to ${newIndex}`);
            setTasks((items) => arrayMove(items, oldIndex, newIndex));
            if (!isTMFullView) { setUserHasSortedTasks(true); }
        } else {
             console.warn("Could not find indices for reordering:", activeId, overId);
        }
    }
  }, [tasks, selectedDate, isTMFullView, setTasks, setUserHasSortedTasks, setActiveId]);









const sortedAndFilteredTasks = useMemo(() => {
  const lowerSearchTerm = taskSearchTerm.toLowerCase();

  let filtered = tasks.filter((task) => {

      const assigneeMatch = taskFilter === "הכל" ||
                            (taskFilter === "שלי" && task.assignTo === "עצמי") ||
                            (taskFilter === "אחרים" && task.assignTo !== "עצמי");

      const doneMatch = showDoneTasks || !task.done;

      const priorityMatch = taskPriorityFilter === 'all' || task.priority === taskPriorityFilter;

      const categoryMatch = selectedTaskCategories.length === 0 || selectedTaskCategories.includes(task.category);

      const searchTermMatch = !lowerSearchTerm ||
                              task.title.toLowerCase().includes(lowerSearchTerm) ||
                              (task.subtitle && task.subtitle.toLowerCase().includes(lowerSearchTerm));


      return assigneeMatch && doneMatch && priorityMatch && categoryMatch && searchTermMatch;
  });




  if (!userHasSortedTasks || isTMFullView) {
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
          } catch(e) {
              console.error("Error during task date sort:", e);
              return 0;
          }
      });
  }



  return filtered;
}, [
    tasks, taskFilter, showDoneTasks, userHasSortedTasks, isTMFullView,
    taskPriorityFilter, selectedTaskCategories, taskSearchTerm
]);


const events = useMemo(() => {

  const taskEvents = tasks
      .filter(t => t.dueDate instanceof Date && !isNaN(t.dueDate))
      .map((t) => {
          let start = t.dueDate;

          let end = new Date(start.getTime() + 60 * 60 * 1000);
          return {
              id: `task-${t.id}`,
              title: `משימה: ${t.title}`,
              start,
              end,
              resource: { type: 'task', data: t },

              isDone: typeof t.done === 'boolean' ? t.done : false
          };
      });


  const leadAppointmentEvents = leads
      .filter(l => l.status === 'תור נקבע' && l.appointmentDateTime)
      .map(l => {
            let start, end;
            try {
                start = new Date(l.appointmentDateTime);
                if (isNaN(start.getTime())) throw new Error("Invalid start date");
                end = new Date(start.getTime() + 60 * 60 * 1000);
            } catch (error) { return null; }

            return {
                id: `lead-${l.id}`,
                title: `פגישה: ${l.fullName}`,
                start,
                end,
                resource: { type: 'lead', data: l }
            };
        })
      .filter(event => event !== null);


  return [...taskEvents, ...leadAppointmentEvents];
}, [tasks, leads]);


const leadsSorted = useMemo(() => {
    const lowerSearchTerm = leadSearchTerm.toLowerCase();
    return leads
        .filter(isLeadInTimeRange)
        .filter(lead => {
            if (!lowerSearchTerm) return true;

            return (
                lead.fullName?.toLowerCase().includes(lowerSearchTerm) ||
                lead.phoneNumber?.includes(lowerSearchTerm) ||
                lead.message?.toLowerCase().includes(lowerSearchTerm) ||
                lead.source?.toLowerCase().includes(lowerSearchTerm) ||
                lead.status?.toLowerCase().includes(lowerSearchTerm)
            );
        })
        .sort(compareLeads);
}, [ leads, leadSearchTerm, isLeadInTimeRange, compareLeads ]);


const calculatedAnalytics = useMemo(() => {
    const now = moment();
    let startDate, endDate = now.clone().endOf('day');


    switch(analyticsTimeFilter) {
        case 'week': startDate = now.clone().subtract(6, 'days').startOf('day'); break;
        case 'month': startDate = now.clone().startOf('month').startOf('day'); break;
        case 'last_month':
            startDate = now.clone().subtract(1, 'month').startOf('month').startOf('day');
            endDate = now.clone().subtract(1, 'month').endOf('month').endOf('day');
            break;
        case 'custom':
            try {
                startDate = analyticsFilterFrom ? moment(analyticsFilterFrom).startOf('day') : null;
                endDate = analyticsFilterTo ? moment(analyticsFilterTo).endOf('day') : now.clone().endOf('day');

                if (startDate && !startDate.isValid()) startDate = null;
                if (endDate && !endDate.isValid()) endDate = now.clone().endOf('day');
                if (startDate && endDate && startDate.isAfter(endDate)) [startDate, endDate] = [endDate, startDate];
            } catch (e) { console.error("Error parsing custom dates for analytics", e); return null; }
            break;
        default:
             startDate = now.clone().startOf('month').startOf('day');
    }


    const filteredLeads = leads.filter(lead => {
        try {

            const createdAt = lead.createdAt instanceof Date && !isNaN(lead.createdAt) ? lead.createdAt : null;
            if (!createdAt) return false;

            const leadMoment = moment(createdAt);
            const startCheck = startDate ? leadMoment.isSameOrAfter(startDate) : true;
            const endCheck = endDate ? leadMoment.isSameOrBefore(endDate) : true;
            return startCheck && endCheck;
        } catch (e) { return false; }
    });

    const totalLeads = filteredLeads.length;

    const baseAnalytics = {
         totalLeads: 0, statusCounts: {}, sourceCounts: {}, leadsPerDay: 0, conversionRate: 0, avgAnswerTimeHours: 'N/A', graphData: [], range: { start: startDate?.format('DD/MM/YY'), end: endDate?.format('DD/MM/YY') }
    };

    if (totalLeads === 0) {
        return baseAnalytics;
    }


    const statusCounts = filteredLeads.reduce((acc, lead) => { acc[lead.status] = (acc[lead.status] || 0) + 1; return acc; }, {});
    const sourceCounts = filteredLeads.reduce((acc, lead) => { const source = lead.source || "לא ידוע"; acc[source] = (acc[source] || 0) + 1; return acc; }, {});
    const daysInRange = startDate ? Math.max(1, endDate.diff(startDate, 'days') + 1) : 1;
    const leadsPerDay = totalLeads / daysInRange;
    const convertedCount = filteredLeads.filter(l => l.status === 'תור נקבע' || l.status === 'בסדרת טיפולים').length;
    const conversionRate = (convertedCount / totalLeads) * 100;


    let totalAnswerTimeMs = 0, leadsWithAnswer = 0, avgAnswerTimeString = 'N/A';
    filteredLeads.forEach(lead => {

        if (Array.isArray(lead.conversationSummary) && lead.conversationSummary.length > 0 && lead.createdAt instanceof Date && !isNaN(lead.createdAt)) {
            try {



                const firstInteractionEntry = lead.conversationSummary[lead.conversationSummary.length - 1];

                const firstInteractionTime = firstInteractionEntry.timestamp instanceof Date && !isNaN(firstInteractionEntry.timestamp) ? firstInteractionEntry.timestamp : null;

                if (firstInteractionTime) {
                    const diffMs = firstInteractionTime.getTime() - lead.createdAt.getTime();
                    if (diffMs >= 0) {
                         totalAnswerTimeMs += diffMs;
                         leadsWithAnswer++;
                    }
                }
            } catch (e) { console.error("Error calculating answer time for lead:", lead.id, e); }
        }
    });
    const avgAnswerTimeMs = leadsWithAnswer > 0 ? totalAnswerTimeMs / leadsWithAnswer : null;
    if (avgAnswerTimeMs !== null) {
        const hours = avgAnswerTimeMs / (1000 * 60 * 60);
        avgAnswerTimeString = hours < 48 ? `${hours.toFixed(1)} שעות` : `${(hours / 24).toFixed(1)} ימים`;
    }


    const graphDataMap = new Map();
    if (startDate && endDate) {
        let currentDate = startDate.clone();
        while(currentDate.isSameOrBefore(endDate, 'day')) {
             graphDataMap.set(currentDate.format('YYYY-MM-DD'), 0);
             currentDate.add(1, 'day');
        }
    }
    filteredLeads.forEach(lead => {
        try {
            const createdAt = lead.createdAt instanceof Date && !isNaN(lead.createdAt) ? lead.createdAt : null;
            if (createdAt) {
                const day = moment(createdAt).format('YYYY-MM-DD');
                if (graphDataMap.has(day)) {
                     graphDataMap.set(day, (graphDataMap.get(day) || 0) + 1);
                }
            }
        } catch(e) { /* ignore errors during graph data mapping */ }
    });
    const graphData = Array.from(graphDataMap.entries())
        .map(([name, received]) => ({ name: moment(name).format('MMM D'), received }))
        .sort((a, b) => moment(a.name, 'MMM D').valueOf() - moment(b.name, 'MMM D').valueOf());


    return {
        totalLeads, statusCounts, sourceCounts,
        leadsPerDay: leadsPerDay.toFixed(1),
        conversionRate: conversionRate.toFixed(1),
        avgAnswerTimeHours: avgAnswerTimeString,
        graphData,
        range: { start: startDate?.format('DD/MM/YY'), end: endDate?.format('DD/MM/YY') }
    };

}, [leads, analyticsTimeFilter, analyticsFilterFrom, analyticsFilterTo]);












  if (!mounted) {
    return ( <div className="flex items-center justify-center min-h-screen">טוען...</div> );
  }








  const activeTaskForOverlay = activeId && typeof activeId === 'string' && activeId.startsWith('task-')
     ? tasks.find(task => `task-${task.id}` === activeId)
     : null;

  return (

    <TooltipProvider>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} >
        
        <header dir="rtl" className="flex items-center justify-between p-4 border-b bg-white shadow-sm sticky top-0 z-20 h-[73px]">
            <div className="text-sm text-gray-600 w-48 text-right"> {currentDateTime || 'טוען תאריך...'} </div>
            <div className="flex-grow text-center">
                 
                 <Image
                   src="/logo.png"
                   alt="Logo"
                 width={140} height={56}
                   className="h-14 inline-block"
                   onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/140x56/eeeeee/aaaaaa?text=Logo+Error'; }}
                 />
            </div>
            <div className="text-sm text-gray-500 w-48 text-left flex items-center justify-end gap-4">
                <span>{'Version 4.6.4'}</span> 
                 
            </div>
        </header>

        
        <div dir="rtl" className="grid grid-cols-12 gap-4 p-4 bg-gray-50 min-h-[calc(100vh-73px)]">

          
          <div style={{ order: blockOrder.TM }} className={`col-span-12 transition-all duration-300 ease-in-out ${ isTMFullView ? "lg:col-span-12" : "lg:col-span-4" }`} >
            <Card className="h-full flex flex-col">
              <CardHeader>
                 
                 <div className="flex justify-between items-center mb-3">
                    <CardTitle>{'מנהל משימות'}</CardTitle>
                    <div className="flex items-center gap-2">
                        
                        <Button variant="outline" size="sm" onClick={() => setIsTMFullView(!isTMFullView)} title={isTMFullView ? "עבור לתצוגה מקוצרת" : "עבור לתצוגת קנבן"}>
                            {isTMFullView ? "תצוגה מוקטנת" : "תצוגה מלאה"}
                        </Button>
                        
                        <Button size="xs" onClick={() => toggleBlockOrder("TM")} title="שנה מיקום בלוק"> {'מיקום: '}{blockOrder.TM} </Button>
                    </div>
                </div>
                
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                       <div className="flex space-x-2 space-x-reverse">
                           <Button variant={taskFilter === 'הכל' ? 'default' : 'outline'} size="sm" onClick={() => setTaskFilter('הכל')}>{'הכל'}</Button>
                           <Button variant={taskFilter === 'שלי' ? 'default' : 'outline'} size="sm" onClick={() => setTaskFilter('שלי')}>{'שלי'}</Button>
                           <Button variant={taskFilter === 'אחרים' ? 'default' : 'outline'} size="sm" onClick={() => setTaskFilter('אחרים')}>{'אחרים'}</Button>
                       </div>
                       <div className="flex items-center space-x-2 space-x-reverse">
                           <Switch id="show-done-tasks" checked={showDoneTasks} onCheckedChange={setShowDoneTasks} aria-label="הצג משימות שבוצעו" />
                           <Label htmlFor="show-done-tasks" className="text-sm cursor-pointer select-none"> {'הצג בוצעו'} </Label>
                           {!isTMFullView && userHasSortedTasks && (
                               /* Reset Sort Button without Tooltip */
                               <Button variant="ghost" size="icon" className="w-8 h-8" title="אפס סדר ידני" onClick={() => setUserHasSortedTasks(false)}> <RotateCcw className="h-4 w-4" /> </Button>
                           )}
                       </div>
                    </div>
                    
                    <div className="flex flex-wrap justify-between items-center gap-2 border-t pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                           <Select value={taskPriorityFilter} onValueChange={setTaskPriorityFilter}>
                               <SelectTrigger className="h-8 text-sm w-[100px]"><SelectValue placeholder="סינון עדיפות..." /></SelectTrigger>
                               <SelectContent>
                                   <SelectItem value="all">{'כל העדיפויות'}</SelectItem>
                                   {taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                               </SelectContent>
                           </Select>
                           <DropdownMenu>
                               <DropdownMenuTrigger asChild>
                                   <Button variant="outline" size="sm" className="h-8 text-sm w-[140px] justify-between">
                                       <span>
                                           {selectedTaskCategories.length === 0 ? "כל הקטגוריות" : selectedTaskCategories.length === 1 ? selectedTaskCategories[0] : `${selectedTaskCategories.length} נבחרו`}
                                       </span>
                                       <ChevronDown className="h-4 w-4 opacity-50" />
                                   </Button>
                               </DropdownMenuTrigger>
                               <DropdownMenuContent className="w-[140px]">
                                   <DropdownMenuLabel>{'סינון קטגוריה'}</DropdownMenuLabel><DropdownMenuSeparator />
                                   {taskCategories.map((category) => (
                                       <DropdownMenuCheckboxItem key={category} checked={selectedTaskCategories.includes(category)} onCheckedChange={() => handleCategoryToggle(category)} onSelect={(e) => e.preventDefault()}> {category} </DropdownMenuCheckboxItem>
                                   ))}
                               </DropdownMenuContent>
                           </DropdownMenu>
                           <div className="relative">
                               <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                               <Input type="search" placeholder="חפש משימות..." className="h-8 text-sm pl-8 w-[180px]" value={taskSearchTerm} onChange={(e) => setTaskSearchTerm(e.target.value)} />
                           </div>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                           
                           <Button variant="outline" size="icon" className="w-8 h-8 text-red-600 hover:bg-red-50 hover:text-red-700" title="מחק משימות שבוצעו" onClick={handleClearDoneTasks} disabled={!tasks.some(task => task.done)}> <span role="img" aria-label="Clear Done">🧹</span> </Button>
                           
                           <Button variant="outline" size="sm" title="היסטוריית משימות" onClick={() => setShowHistoryModal(true)}> <span role="img" aria-label="History">📜</span> </Button>
                           <Button size="sm" onClick={() => { setPrefillCategory(null); setNlpInput(""); setShowNLPModal(true); }}>{'+ משימה (NLP)'}</Button>
                        </div>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow overflow-hidden">
                {isTMFullView ? (

                  <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-${Math.max(1, taskCategories.length)} gap-3 h-[calc(100vh-340px)] overflow-x-auto`}>
                    {taskCategories.map((category) => {
                      const categoryTasks = sortedAndFilteredTasks.filter(task => task.category === category);
                      return (
                        <div key={category} className="bg-gray-100 rounded-lg p-2 flex flex-col">
                          
                           <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-100 py-1 px-1 z-10">
                              <h3 className="font-semibold text-center flex-grow">{category} ({categoryTasks.length})</h3>
                              
                              <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-500 hover:text-blue-600 shrink-0" title={`הוסף ל${category}`} onClick={() => { setPrefillCategory(category); setNlpInput(""); setShowNLPModal(true); }}> <span role="img" aria-label="Add">➕</span> </Button>
                          </div>
                          
                          <SortableContext items={categoryTasks.map(t => `task-${t.id}`)} strategy={verticalListSortingStrategy} id={category}>
                            <ul className="space-y-3 flex-grow overflow-y-auto pr-1">
                              {categoryTasks.length === 0 && (<li className="text-center text-gray-400 text-sm pt-4">{'אין משימות'}</li>)}
                              {categoryTasks.map((task) => {
                                const overdue = isTaskOverdue(task);
                                const overdue12h = isTaskOverdue12h(task);

                                const canReply = !task.done && task.creatorId && task.creatorId !== "current-user-placeholder";

                                if (editingTaskId === task.id) { console.log('Rendering EDIT form for task (Kanban):', task.id); }
                                return (
                                  editingTaskId === task.id ? (

                                    <li key={`edit-${task.id}`} className="p-3 border rounded bg-blue-50 shadow-md">
                                       <form onSubmit={handleSaveTask} className="space-y-2">
                                           
                                           <div><Label className="text-xs">מוקצה ל:</Label><Input type="text" value={editingAssignTo} onChange={(e) => setEditingAssignTo(e.target.value)} className="h-8 text-sm" required /></div>
                                           <div><Label className="text-xs">כותרת:</Label><Input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} className="h-8 text-sm" required /></div>
                                           <div><Label className="text-xs">תיאור:</Label><Textarea value={editingSubtitle} onChange={(e) => setEditingSubtitle(e.target.value)} rows={2} className="text-sm" /></div>
                                           <div className="flex gap-2">
                                                <div className="flex-1"><Label className="text-xs">עדיפות:</Label>
                                                    <Select value={editingPriority} onValueChange={setEditingPriority}>
                                                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                                        <SelectContent>{taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                                    </Select>
                                                </div>
                                                <div className="flex-1"><Label className="text-xs">קטגוריה:</Label><Input type="text" value={editingCategory} readOnly disabled className="h-8 text-sm bg-gray-100"/></div>
                                           </div>
                                           <div className="flex gap-2">
                                                <div className="flex-1"><Label className="text-xs">תאריך:</Label><Input type="date" value={editingDueDate} onChange={(e) => setEditingDueDate(e.target.value)} className="h-8 text-sm" required /></div>
                                                <div className="flex-1"><Label className="text-xs">שעה:</Label><Input type="time" value={editingDueTime} onChange={(e) => setEditingDueTime(e.target.value)} className="h-8 text-sm" /></div>
                                           </div>
                                           
                                           <div className="flex justify-end space-x-2 space-x-reverse pt-1">
                                               <Button type="submit" size="sm">{'שמור'}</Button>
                                               <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>{'ביטול'}</Button>
                                           </div>
                                       </form>
                                    </li>
                                  ) : (

                                    <SortableItem key={task.id} id={`task-${task.id}`}>
                                      <div className={`p-2 border rounded shadow-sm cursor-grab active:cursor-grabbing ${task.done ? 'bg-gray-200 opacity-75' : 'bg-white'} ${overdue ? 'border-l-4 border-red-500' : 'border-l-4 border-transparent'} ${overdue12h ? 'animate-pulse bg-yellow-50' : ''}`}>
                                        <div className="flex items-start space-x-3 space-x-reverse">
                                          <Checkbox checked={!!task.done} onCheckedChange={() => toggleTaskDone(task.id)} id={`task-kanban-${task.id}`} className="mt-1 shrink-0" aria-label={`Mark task ${task.title}`} />
                                          <div className="flex-grow overflow-hidden">
                                              <label htmlFor={`task-kanban-${task.id}`} className={`font-medium text-sm cursor-pointer ${task.done ? "line-through text-gray-500" : "text-gray-900"}`}>{task.title}</label>
                                              {task.subtitle && (<p className={`text-xs mt-0.5 ${task.done ? "line-through text-gray-400" : "text-gray-600"}`}>{task.subtitle}</p>)}
                                              <div className={`text-xs mt-1 space-x-2 space-x-reverse ${task.done ? 'text-gray-400' : overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                                  <span><span role="img" aria-label="Due">🗓️</span> {formatDateTime(task.dueDate)}</span>
                                                  <span><span role="img" aria-label="Assignee">👤</span> {task.assignTo}</span>
                                                  <span>{task.priority === 'דחוף' ? '🔥' : task.priority === 'נמוך' ? '⬇️' : '➖'} {task.priority}</span>
                                                  {task.done && task.completedAt && (<span className="text-green-600"><span role="img" aria-label="Done">✅</span> {formatDateTime(task.completedAt)}</span>)}
                                              </div>
                                              {!task.done && task.createdAt && (<span className="text-xs text-gray-500 mt-1 block"> {'ממתין: '}{formatDuration(new Date() - new Date(task.createdAt))} </span>)}
                                          </div>
                                          <div className="flex flex-col items-center gap-0.5 shrink-0">
                                              
                                              {!task.done && (
                                                <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-400 hover:text-orange-600" title="שלח תזכורת" onClick={() => console.log(`Notify ${task.id}`)} onPointerDown={(e) => e.stopPropagation()}> <Bell className="h-4 w-4" /> </Button>
                                              )}
                                              
                                              {canReply && (
                                                  <Button variant="ghost" size="icon" className="w-6 h-6 text-green-600 hover:text-green-700" title="השלם ושלח תגובה" onClick={() => handleCompleteAndReply(task.id)} onPointerDown={(e) => e.stopPropagation()}>
                                                      <span role="img" aria-label="Complete and Reply">↩️</span>
                                                  </Button>
                                              )}
                                              <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-500 hover:text-blue-600" title="ערוך משימה" onClick={() => handleEditTask(task)} onPointerDown={(e) => e.stopPropagation()}><span className="text-base" role="img" aria-label="Edit">✎</span></Button>
                                          </div>
                                        </div>
                                      </div>
                                    </SortableItem>
                                  )
                                );
                              })}
                            </ul>
                          </SortableContext>
                        </div>
                      );
                    })}
                  </div>
                ) : (

                  <SortableContext items={sortedAndFilteredTasks.map((t) => `task-${t.id}`)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-3 h-[calc(100vh-340px)] overflow-y-auto pr-2">
                      {sortedAndFilteredTasks.length === 0 && (<li className="text-center text-gray-500 py-4">{'אין משימות להצגה'}</li>)}
                      {sortedAndFilteredTasks.map((task) => {
                        const overdue = isTaskOverdue(task);
                        const overdue12h = isTaskOverdue12h(task);

                         const canReply = !task.done && task.creatorId && task.creatorId !== "current-user-placeholder";

                         if (editingTaskId === task.id) { console.log('Rendering EDIT form for task (Compact):', task.id); }
                        return (
                          editingTaskId === task.id ? (

                            <li key={`edit-${task.id}`} className="p-3 border rounded bg-blue-50 shadow-md">
                               <form onSubmit={handleSaveTask} className="space-y-2">
                                   
                                   <div><Label className="text-xs">מוקצה ל:</Label><Input type="text" value={editingAssignTo} onChange={(e) => setEditingAssignTo(e.target.value)} className="h-8 text-sm" required /></div>
                                   <div><Label className="text-xs">כותרת:</Label><Input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} className="h-8 text-sm" required /></div>
                                   <div><Label className="text-xs">תיאור:</Label><Textarea value={editingSubtitle} onChange={(e) => setEditingSubtitle(e.target.value)} rows={2} className="text-sm" /></div>
                                   <div className="flex gap-2">
                                        <div className="flex-1"><Label className="text-xs">עדיפות:</Label>
                                            <Select value={editingPriority} onValueChange={setEditingPriority}>
                                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>{taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex-1"><Label className="text-xs">קטגוריה:</Label>
                                            <Select value={editingCategory} onValueChange={setEditingCategory}>
                                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                                <SelectContent>{taskCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                   </div>
                                   <div className="flex gap-2">
                                        <div className="flex-1"><Label className="text-xs">תאריך:</Label><Input type="date" value={editingDueDate} onChange={(e) => setEditingDueDate(e.target.value)} className="h-8 text-sm" required /></div>
                                        <div className="flex-1"><Label className="text-xs">שעה:</Label><Input type="time" value={editingDueTime} onChange={(e) => setEditingDueTime(e.target.value)} className="h-8 text-sm" /></div>
                                   </div>
                                   
                                   <div className="flex justify-end space-x-2 space-x-reverse pt-1">
                                       <Button type="submit" size="sm">{'שמור'}</Button>
                                       <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>{'ביטול'}</Button>
                                   </div>
                               </form>
                            </li>
                          ) : (

                            <SortableItem key={task.id} id={`task-${task.id}`}>
                               <div className={`flex items-start space-x-3 space-x-reverse p-2 border rounded shadow-sm cursor-grab active:cursor-grabbing ${task.done ? 'bg-gray-100 opacity-70' : 'bg-white'} ${overdue ? 'border-l-4 border-red-500' : 'border-l-4 border-transparent'} ${overdue12h ? 'animate-pulse bg-yellow-50' : ''}`}>
                                <Checkbox checked={!!task.done} onCheckedChange={() => toggleTaskDone(task.id)} id={`task-compact-${task.id}`} className="mt-1 shrink-0" aria-label={`Mark task ${task.title}`} />
                                <div className="flex-grow overflow-hidden">
                                    <label htmlFor={`task-compact-${task.id}`} className={`font-medium text-sm cursor-pointer ${task.done ? "line-through text-gray-500" : "text-gray-900"}`}>{task.title}</label>
                                    {task.subtitle && (<p className={`text-xs mt-0.5 ${task.done ? "line-through text-gray-400" : "text-gray-600"}`}>{task.subtitle}</p>)}
                                    <div className={`text-xs mt-1 space-x-2 space-x-reverse flex flex-wrap gap-x-2 ${task.done ? 'text-gray-400' : overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                        <span><span role="img" aria-label="Due">🗓️</span> {formatDateTime(task.dueDate)}</span>
                                        <span><span role="img" aria-label="Assignee">👤</span> {task.assignTo}</span>
                                        <span><span role="img" aria-label="Category">🏷️</span> {task.category}</span>
                                        <span>{task.priority === 'דחוף' ? '🔥' : task.priority === 'נמוך' ? '⬇️' : '➖'} {task.priority}</span>
                                        {task.done && task.completedAt && (<span className="text-green-600"><span role="img" aria-label="Done">✅</span> {formatDateTime(task.completedAt)}</span>)}
                                    </div>
                                    {!task.done && task.createdAt && (<span className="text-xs text-gray-500 mt-1 block"> {'ממתין: '}{formatDuration(new Date() - new Date(task.createdAt))} </span>)}
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    
                                    {!task.done && (
                                        <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-400 hover:text-orange-600" title="שלח תזכורת" onClick={() => console.log(`Notify ${task.id}`)} onPointerDown={(e) => e.stopPropagation()}> <Bell className="h-4 w-4" /> </Button>
                                    )}
                                    
                                    {canReply && (
                                        <Button variant="ghost" size="icon" className="w-6 h-6 text-green-600 hover:text-green-700" title="השלם ושלח תגובה" onClick={() => handleCompleteAndReply(task.id)} onPointerDown={(e) => e.stopPropagation()}>
                                            <span role="img" aria-label="Complete and Reply">↩️</span>
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="icon" className="w-6 h-6 text-gray-500 hover:text-blue-600" title="ערוך משימה" onClick={() => handleEditTask(task)} onPointerDown={(e) => e.stopPropagation()}><span className="text-base" role="img" aria-label="Edit">✎</span></Button>
                                </div>
                              </div>
                            </SortableItem>
                          )
                        );
                      })}
                    </ul>
                  </SortableContext>
                )}
              </CardContent>
            </Card>
          </div>

          
          <div style={{ order: blockOrder.Calendar }} className="col-span-12 lg:col-span-4" >
             <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>{'לוח שנה'}</CardTitle>
                    
                    <Tooltip><TooltipTrigger asChild>
                        <Button size="xs" onClick={() => toggleBlockOrder("Calendar")}> {'מיקום: '}{blockOrder.Calendar} </Button>
                    </TooltipTrigger><TooltipContent>{'שנה מיקום בלוק'}</TooltipContent></Tooltip>
                </div>
                
                <div className="flex justify-between items-center mt-2 border-t pt-2">
                    <div className="flex gap-1">
                         
                        <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>{'היום'}</Button></TooltipTrigger><TooltipContent>{'עבור להיום'}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setSelectedDate(moment(selectedDate).subtract(1, view === 'month' ? 'month' : view === 'week' ? 'week' : 'day').toDate())} title="תקופה קודמת">{'<'}</Button></TooltipTrigger><TooltipContent>{'תקופה קודמת'}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="w-8 h-8" onClick={() => setSelectedDate(moment(selectedDate).add(1, view === 'month' ? 'month' : view === 'week' ? 'week' : 'day').toDate())} title="תקופה באה">{'>'}</Button></TooltipTrigger><TooltipContent>{'תקופה באה'}</TooltipContent></Tooltip>
                    </div>
                    <span className="font-semibold text-sm">
                        
                        {moment(selectedDate).format(view === 'month' ? 'MMMM YYYY' : 'D MMMM YYYY')}
                    </span>
                    <div className="flex gap-1">
                        <Button variant={view === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setView('month')}>{'חודש'}</Button>
                        <Button variant={view === 'week' ? 'default' : 'outline'} size="sm" onClick={() => setView('week')}>{'שבוע'}</Button>
                        <Button variant={view === 'day' ? 'default' : 'outline'} size="sm" onClick={() => setView('day')}>{'יום'}</Button>
                    </div>
                </div>
              </CardHeader>
              <CardContent className="flex-grow relative">
                 
                 <div className="h-[calc(100vh-300px)] min-h-[400px]">
                   
                   <DroppableCalendar
                scrollToTime={new Date()}
                eventPropGetter={() => ({
                  style: { textAlign: "right" }
                })}
                       id="calendar-dropzone"
                       localizer={localizer}
                       events={events}
                       view={view}
                       date={selectedDate}
                       onNavigate={setSelectedDate}
                       onView={(newView) => {
                  setView(newView);
                  localStorage.setItem("calendarView", newView);
                }}
                       onSelectEvent={event => {

                           const taskId = event.id.startsWith('task-') ? event.id.replace('task-', '') : null;
                           const taskData = taskId ? tasks.find(t => t.id === taskId) : null;
                           if (taskData) {
                               handleEditTask(taskData);
                           } else {
                               console.warn("Could not find task data for calendar event:", event);
                           }
                       }}
                       formats={{
                           timeGutterFormat: 'HH:mm',
                           eventTimeRangeFormat: ({ start, end }, culture, local) => local.format(start, 'HH:mm', culture) + ' - ' + local.format(end, 'HH:mm', culture),
                           agendaTimeRangeFormat: ({ start, end }, culture, local) => local.format(start, 'HH:mm', culture) + ' - ' + local.format(end, 'HH:mm', culture),
                           selectRangeFormat: ({ start, end }, culture, local) => local.format(start, 'HH:mm', culture) + ' - ' + local.format(end, 'HH:mm', culture)
                       }}
                       messages={messages}
                       style={{ height: '100%' }}
                       className="rbc-calendar-rtl"
                       selectable={true}
                   />
                 </div>
              </CardContent>
            </Card>
          </div>

          
          <div style={{ order: blockOrder.Leads }} className={`col-span-12 transition-all duration-300 ease-in-out ${ isFullView ? "lg:col-span-8" : "lg:col-span-4" }`} >
              <Card className="h-full flex flex-col">
               <CardHeader>
                 
                 {isFullView ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <CardTitle>{'ניהול לידים (מלא)'}</CardTitle>
                            <div className="flex gap-2">
                                <Button size="sm" onClick={() => setShowAddLeadModal(true)}>{'+ הוסף ליד'}</Button>
                                <Button onClick={() => setIsFullView(false)} size="sm" variant="outline">{'תצוגה מקוצרת'}</Button>
                                
                                <Tooltip><TooltipTrigger asChild><Button size="xs" onClick={() => toggleBlockOrder("Leads")}> {'מיקום: '}{blockOrder.Leads} </Button></TooltipTrigger><TooltipContent>{'שנה מיקום בלוק'}</TooltipContent></Tooltip>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2 border-t pt-2">
                           <div>
                               <Label className="ml-1 text-sm font-medium">{'סדר לפי:'}</Label>
                               <Select value={leadSortBy} onValueChange={setLeadSortBy}>
                                   <SelectTrigger className="h-8 text-sm w-[120px]"><SelectValue /></SelectTrigger>
                                   <SelectContent><SelectItem value="priority">{'עדיפות'}</SelectItem><SelectItem value="date">{'תאריך יצירה'}</SelectItem></SelectContent>
                               </Select>
                           </div>
                           <div>
                               <Label className="ml-1 text-sm font-medium">{'סנן זמן:'}</Label>
                               <Select value={leadTimeFilter} onValueChange={setLeadTimeFilter}>
                                   <SelectTrigger className="h-8 text-sm w-[130px]"><SelectValue /></SelectTrigger>
                                   <SelectContent>
                                       <SelectItem value="all">{'הכל'}</SelectItem><SelectItem value="week">{'שבוע אחרון'}</SelectItem>
                                       <SelectItem value="month">{'חודש אחרון'}</SelectItem><SelectItem value="custom">{'טווח תאריכים'}</SelectItem>
                                   </SelectContent>
                               </Select>
                           </div>
                           {leadTimeFilter === "custom" && (
                               <div className="flex items-center gap-2 flex-wrap">
                                   <Label className="text-sm">{'מ:'}</Label><Input type="date" value={leadFilterFrom} onChange={(e) => setLeadFilterFrom(e.target.value)} className="h-8 text-sm w-[140px]" />
                                   <Label className="text-sm">{'עד:'}</Label><Input type="date" value={leadFilterTo} onChange={(e) => setLeadFilterTo(e.target.value)} className="h-8 text-sm w-[140px]" />
                               </div>
                           )}
                           <div className="relative">
                               <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                               <Input type="search" placeholder="חפש לידים..." className="h-8 text-sm pl-8 w-[180px]" value={leadSearchTerm} onChange={(e) => setLeadSearchTerm(e.target.value)} />
                           </div>
                        </div>
                    </div>
                 ) : (
                    <div className="flex justify-between items-center">
                        <CardTitle>{'ניהול לידים'}</CardTitle>
                        <div className="flex gap-2">
                            <Button onClick={() => setIsFullView(true)} size="sm">{'תצוגה מלאה'}</Button>
                             
                            <Tooltip><TooltipTrigger asChild><Button size="xs" onClick={() => toggleBlockOrder("Leads")}> {'מיקום: '}{blockOrder.Leads} </Button></TooltipTrigger><TooltipContent>{'שנה מיקום בלוק'}</TooltipContent></Tooltip>
                        </div>
                    </div>
                 )}
                 
                 <div className="mt-2 pt-2 border-t">
                    <Button variant="secondary" size="sm" onClick={() => setShowAnalytics(!showAnalytics)}>
                        {showAnalytics ? 'הסתר ניתוח לידים' : 'הצג ניתוח לידים'}
                    </Button>
                 </div>
               </CardHeader>
               <CardContent className="flex-grow overflow-hidden">
                 
                 {isFullView ? (

                    <div className="overflow-auto h-[calc(100vh-400px)] min-h-[300px]">
                        <table className="w-full table-fixed text-sm border-collapse">
                           <thead className="sticky top-0 bg-gray-100 z-10">
                               <tr>
                                   <th className="px-2 py-2 text-right font-semibold w-16">{'עדיפות'}</th>
                                   <th className="px-2 py-2 text-right font-semibold w-32">{'תאריך'}</th>
                                   <th className="px-2 py-2 text-right font-semibold w-40">{'שם מלא'}</th>
                                   <th className="px-2 py-2 text-right font-semibold w-32">{'טלפון'}</th>
                                   <th className="px-2 py-2 text-right font-semibold">{'הודעה'}</th>
                                   <th className="px-2 py-2 text-right font-semibold w-36">{'סטטוס'}</th>
                                   <th className="px-2 py-2 text-right font-semibold w-28">{'פעולות'}</th>
                               </tr>
                           </thead>
                           <tbody>
                               {leadsSorted.length === 0 && ( <tr><td colSpan={7} className="text-center text-gray-500 py-6">{'אין לידים להצגה'}</td></tr> )}
                               {leadsSorted.map((lead) => {
                                   const colorTab = leadColorTab(lead.status);
                                   return (
                                       <React.Fragment key={`lead-rows-${lead.id}`}>
                                           
                                           <tr className="border-b hover:bg-gray-50 group">
                                               <td className="px-2 py-2 align-top"><div className={`w-3 h-6 ${colorTab} rounded mx-auto`} /></td>
                                               <td className="px-2 py-2 align-top whitespace-nowrap">{formatDateTime(lead.createdAt)}</td>
                                               <td className="px-2 py-2 align-top font-medium">{lead.fullName}</td>
                                               <td className="px-2 py-2 align-top whitespace-nowrap">{lead.phoneNumber}</td>
                                               <td className="px-2 py-2 align-top truncate" title={lead.message}>{lead.message}</td>
                                               <td className="px-2 py-2 align-top">{lead.status}</td>
                                               <td className="px-2 py-2 align-top">
                                                   <div className="flex items-center justify-start gap-1">
                                                        
                                                       <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="w-7 h-7 text-gray-500 hover:text-blue-600" onClick={() => handleEditLead(lead)}><span role="img" aria-label="Edit">✎</span></Button></TooltipTrigger><TooltipContent>{'פתח/ערוך ליד'}</TooltipContent></Tooltip>
                                                       <Tooltip><TooltipTrigger asChild><a href={`https: wa.me/${lead.phoneNumber}`} target="_blank" rel="noopener noreferrer"><Button size="icon" variant="ghost" className="w-7 h-7 text-green-600 hover:text-green-700"><span role="img" aria-label="WhatsApp">💬</span></Button></a></TooltipTrigger><TooltipContent>{'שלח וואטסאפ'}</TooltipContent></Tooltip> */{"}"}
                                                       <Tooltip><TooltipTrigger asChild><a href={`tel:${lead.phoneNumber}`}><Button size="icon" variant="ghost" className="w-7 h-7 text-blue-600 hover:text-blue-700"><span role="img" aria-label="Call">📞</span></Button></a></TooltipTrigger><TooltipContent>{'התקשר'}</TooltipContent></Tooltip>
                                                   </div>
                                               </td>
                                           </tr>
                                           
                                           {lead.expanded && (
                                               <tr key={`expanded-${lead.id}`} className="border-b bg-blue-50">
                                                   <td colSpan={7} className="p-4">
                                                       <form onSubmit={(e) => handleSaveLead(e, lead.id)} className="space-y-4">
                                                           
                                                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                               <Label className="block"><span className="text-gray-700 text-sm font-medium">{'שם מלא:'}</span><Input type="text" className="mt-1 h-8 text-sm" value={editLeadFullName} onChange={(ev) => setEditLeadFullName(ev.target.value)} required /></Label>
                                                               <Label className="block"><span className="text-gray-700 text-sm font-medium">{'טלפון:'}</span><Input type="tel" className="mt-1 h-8 text-sm" value={editLeadPhone} onChange={(ev) => setEditLeadPhone(ev.target.value)} required /></Label>
                                                               <Label className="block"><span className="text-gray-700 text-sm font-medium">{'הודעה ראשונית:'}</span><Input type="text" className="mt-1 h-8 text-sm" value={editLeadMessage} onChange={(ev) => setEditLeadMessage(ev.target.value)} /></Label>
                                                               <Label className="block"><span className="text-gray-700 text-sm font-medium">{'סטטוס:'}</span>
                                                                   <Select value={editLeadStatus} onValueChange={setEditLeadStatus}>
                                                                       <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                                                                       <SelectContent>{Object.keys(leadStatusConfig).filter(k => k !== 'Default').map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                                                                   </Select>
                                                               </Label>
                                                               <Label className="block"><span className="text-gray-700 text-sm font-medium">{'מקור:'}</span><Input type="text" className="mt-1 h-8 text-sm" value={editLeadSource} onChange={(ev) => setEditLeadSource(ev.target.value)} /></Label>
                                                               {editLeadStatus === 'תור נקבע' && (
                                                                   <Label className="block"><span className="text-gray-700 text-sm font-medium">{'תאריך ושעת פגישה:'}</span>
                                                                       <Input type="datetime-local" className="mt-1 h-8 text-sm" value={editLeadAppointmentDateTime} onChange={(ev) => setEditLeadAppointmentDateTime(ev.target.value)} required />
                                                                   </Label>
                                                               )}
                                                           </div>
                                                           
                                                           <div className="border-t pt-3">
                                                               <div className="flex justify-between items-center mb-2">
                                                                   <div className="font-semibold text-sm">{'היסטוריית שיחה:'}</div>
                                                                   <Button type="button" variant="link" size="sm" onClick={() => setShowConvUpdate(showConvUpdate === lead.id ? null : lead.id)} className="text-blue-600 hover:underline p-0 h-auto">{showConvUpdate === lead.id ? 'הסתר הוספה' : '+ הוסף עדכון'}</Button>
                                                               </div>
                                                               {showConvUpdate === lead.id && (
                                                                   <div className="flex gap-2 mb-3">
                                                                       <Textarea className="text-sm" rows={2} value={newConversationText} onChange={(ev) => setNewConversationText(ev.target.value)} placeholder="כתוב עדכון שיחה..." />
                                                                       <Button size="sm" type="button" onClick={() => handleAddConversation(lead.id)} className="shrink-0">{'הוסף'}</Button>
                                                                   </div>
                                                               )}
                                                               <ul className="space-y-1.5 max-h-40 overflow-y-auto border rounded p-2 bg-white">
                                                                   {(lead.conversationSummary || []).length === 0 && <li className="text-xs text-gray-500 text-center py-2">{'אין עדכוני שיחה.'}</li>}
                                                                   {(lead.conversationSummary || []).map((c, idx) => (
                                                                       <li key={idx} className="text-xs bg-gray-50 p-1.5 border rounded">
                                                                           <div className="font-semibold text-gray-700">{formatDateTime(c.timestamp)}</div>
                                                                           <div className="text-gray-800">{c.text}</div>
                                                                       </li>
                                                                   ))}
                                                               </ul>
                                                           </div>
                                                           
                                                           <div className="border-t pt-3">
                                                               <Label className="font-semibold text-sm block mb-1">{'הוסף משימת המשך (NLP):'}</Label>
                                                               <div className="flex gap-2">
                                                                   <Input type="text" className="h-8 text-sm" placeholder="לדוגמא: לקבוע פגישה מחר ב-10:00..." value={editLeadNLP} onChange={(ev) => setEditLeadNLP(ev.target.value)} />
                                                                   <Button type="button" size="sm" onClick={() => handleLeadNLPSubmit(lead.id)} className="shrink-0">{'➕ משימה'}</Button>
                                                               </div>
                                                           </div>
                                                           
                                                           <div className="flex gap-2 justify-end border-t pt-3 mt-4">
                                                               <Button type="submit" size="sm">{'שמור שינויים'}</Button>
                                                               <Button type="button" variant="outline" size="sm" onClick={() => handleCollapseLead(lead.id)}>{'סגור'}</Button>
                                                           </div>
                                                       </form>
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

                    <ul className="space-y-2 h-[calc(100vh-280px)] min-h-[400px] overflow-y-auto pr-1">
                        {leadsSorted.length === 0 && (<li className="text-center text-gray-500 py-6">{'אין לידים להצגה'}</li>)}
                        {leadsSorted.map((lead) => {
                            const colorTab = leadColorTab(lead.status);
                            return (
                                <li key={`compact-${lead.id}`} className="p-2 border rounded shadow-sm flex items-center gap-2 bg-white hover:bg-gray-50">
                                    <div className={`w-2 h-10 ${colorTab} rounded shrink-0`} />
                                    <div className="flex-grow overflow-hidden">
                                        <div className="font-bold text-sm truncate">{lead.fullName}</div>
                                        <p className="text-xs text-gray-600 truncate">{lead.message}</p>
                                        <p className="text-xs text-gray-500 truncate">{lead.status} - {formatDateTime(lead.createdAt)}</p>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                         
                                        <Button size="icon" variant="ghost" className="w-7 h-7 text-gray-500 hover:text-blue-600" title="פתח לעריכה" onClick={() => handleEditLead(lead)}><span role="img" aria-label="Edit">✎</span></Button>
                                        <Tooltip><TooltipTrigger asChild><a href={`https: wa.me/${lead.phoneNumber}`} target="_blank" rel="noopener noreferrer"><Button size="icon" variant="ghost" className="w-7 h-7 text-green-600 hover:text-green-700"><span role="img" aria-label="WhatsApp">💬</span></Button></a></TooltipTrigger><TooltipContent>{'שלח וואטסאפ'}</TooltipContent></Tooltip> 
                                        <a href={`tel:${lead.phoneNumber}`}><Button size="icon" variant="ghost" className="w-7 h-7 text-blue-600 hover:text-blue-700" title="התקשר"><span role="img" aria-label="Call">📞</span></Button></a>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                 )}
               </CardContent>
             </Card>
          </div> 

          
          {showAnalytics && (
             <div className="col-span-12 mt-4"> 
                 <Card>
                     <CardHeader>
                         <CardTitle>{'ניתוח לידים'}</CardTitle>
                     </CardHeader>
                     <CardContent>
                        
                        <div className="flex flex-wrap items-center gap-4 mb-4 pb-4 border-b">
                            <span className="font-medium text-sm">{'תקופת זמן:'}</span>
                            <div className="flex gap-2 flex-wrap">
                               <Button size="sm" variant={analyticsTimeFilter === 'week' ? 'default' : 'outline'} onClick={() => setAnalyticsTimeFilter('week')}>{'שבוע אחרון'}</Button>
                               <Button size="sm" variant={analyticsTimeFilter === 'month' ? 'default' : 'outline'} onClick={() => setAnalyticsTimeFilter('month')}>{'חודש נוכחי'}</Button>
                               <Button size="sm" variant={analyticsTimeFilter === 'last_month' ? 'default' : 'outline'} onClick={() => setAnalyticsTimeFilter('last_month')}>{'חודש קודם'}</Button>
                               <Button size="sm" variant={analyticsTimeFilter === 'custom' ? 'default' : 'outline'} onClick={() => setAnalyticsTimeFilter('custom')}>{'מותאם'}</Button>
                            </div>
                            {analyticsTimeFilter === 'custom' && (
                               <div className="flex items-center gap-2 flex-wrap">
                                   <Label className="text-sm">{'מ:'}</Label><Input type="date" value={analyticsFilterFrom} onChange={(e) => setAnalyticsFilterFrom(e.target.value)} className="h-8 text-sm w-[140px]" />
                                   <Label className="text-sm">{'עד:'}</Label><Input type="date" value={analyticsFilterTo} onChange={(e) => setAnalyticsFilterTo(e.target.value)} className="h-8 text-sm w-[140px]" />
                               </div>
                            )}
                        </div>
                        
                        {!calculatedAnalytics ? (
                            <p className="text-center text-gray-500">{'טוען נתונים...'}</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                <div>
                                    <h4 className="font-semibold mb-2 text-center">{'סיכום ('}{calculatedAnalytics.range.start} - {calculatedAnalytics.range.end}{')'}</h4>
                                    <table className="w-full text-sm text-right border">
                                        <tbody>
                                            <tr className="border-b"><td className="p-2 font-medium">{'סה"כ לידים:'}</td><td className="p-2">{calculatedAnalytics.totalLeads}</td></tr>
                                            <tr className="border-b"><td className="p-2 font-medium">{'ממוצע ליום:'}</td><td className="p-2">{calculatedAnalytics.leadsPerDay}</td></tr>
                                            <tr className="border-b"><td className="p-2 font-medium">{'שיעור המרה:'}</td><td className="p-2">{calculatedAnalytics.conversionRate}%</td></tr>
                                            <tr className="border-b"><td className="p-2 font-medium">{'זמן מענה ממוצע:'}</td><td className="p-2">{calculatedAnalytics.avgAnswerTimeHours}</td></tr>
                                            <tr className="bg-gray-100 font-medium border-b"><td className="p-2" colSpan={2}>{'סטטוסים:'}</td></tr>
                                            {Object.entries(calculatedAnalytics.statusCounts).map(([s, c]) => (<tr key={s} className="border-b"><td className="p-2 pl-4">{s}</td><td className="p-2">{c}</td></tr>))}
                                            <tr className="bg-gray-100 font-medium border-b"><td className="p-2" colSpan={2}>{'מקורות:'}</td></tr>
                                            {Object.entries(calculatedAnalytics.sourceCounts).map(([s, c]) => (<tr key={s} className="border-b"><td className="p-2 pl-4">{s}</td><td className="p-2">{c} ({calculatedAnalytics.totalLeads > 0 ? ((c / calculatedAnalytics.totalLeads) * 100).toFixed(1) : 0}%)</td></tr>))}
                                        </tbody>
                                    </table>
                                </div>
                                
                                <div className="min-h-[300px]">
                                    <h4 className="font-semibold mb-2 text-center">{'לידים נכנסים לפי יום'}</h4>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={calculatedAnalytics.graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="name" style={{ fontSize: '0.75rem' }} />
                                            <YAxis allowDecimals={false} style={{ fontSize: '0.75rem' }}/>
                                            <RechartsTooltip />
                                            <Legend />
                                            <Line type="monotone" dataKey="received" name="לידים נכנסים" stroke="#8884d8" strokeWidth={2} activeDot={{ r: 6 }}/>
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                     </CardContent>
                 </Card>
             </div>
          )} 


        </div> 

        

        
        {showNLPModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4" onClick={() => { setShowNLPModal(false); setPrefillCategory(null); }}> 
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}> 
                
                <h2 className="text-lg font-semibold mb-4 text-right">
                    {'הוסף משימה '}{prefillCategory ? `לקטגוריה: ${prefillCategory}` : 'בשפה טבעית'}
                </h2>
              <form onSubmit={handleNLPSubmit}>
                
                 {prefillCategory && <p className="text-sm text-gray-600 mb-2 text-right">קטגוריה: {prefillCategory}</p>} 
                <Input
                  type="text"
                  value={nlpInput}
                  onChange={(e) => setNlpInput(e.target.value)}
                  placeholder="לדוגמא: התקשר לדוד מחר ב-13:00 בנושא דוחות"
                  className="text-right"
                  dir="rtl"
                  autoFocus
                  required
                />
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="submit">הוסף משימה</Button>
                  <Button type="button" variant="outline" onClick={() => { setShowNLPModal(false); setPrefillCategory(null); }}>ביטול</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        
        {showReturnModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4" onClick={() => setShowReturnModal(false)}>
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold mb-4 text-right">החזר משימה עם תגובה</h2>
              <form onSubmit={handleReturnSubmit} className="space-y-3 text-right">
                <div>
                  <Label htmlFor="return-assignee" className="block text-sm font-medium mb-1">משתמש יעד:</Label>
                  <Input
                    id="return-assignee"
                    type="text"
                    value={returnNewAssignee}
                    onChange={(e) => setReturnNewAssignee(e.target.value)}
                    placeholder="הכנס שם משתמש"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="return-comment" className="block text-sm font-medium mb-1">הודעת החזרה:</Label>
                  <Textarea
                    id="return-comment"
                    value={returnComment}
                    onChange={(e) => setReturnComment(e.target.value)}
                    placeholder="כתוב תגובה..."
                    rows={3}
                    required
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="submit">שלח</Button>
                  <Button type="button" variant="outline" onClick={() => setShowReturnModal(false)}>ביטול</Button>
                </div>
              </form>
            </div>
          </div>
        )}

        
        {showHistoryModal && (
           <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4" onClick={() => setShowHistoryModal(false)}>
             <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                 <h2 className="text-lg font-semibold mb-4 shrink-0 text-right">{'היסטוריית משימות שבוצעו'}</h2>
                 <div className="overflow-y-auto flex-grow mb-4 border rounded p-2 bg-gray-50">
                     <ul className="space-y-2">
                         {tasks
                           .filter(task => task.done && task.completedAt)
                           .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                           .map(task => {

                             let duration = "";
                             if (task.completedAt && task.createdAt) {
                                 try {
                                     const durationMs = new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime();
                                     duration = formatDuration(durationMs);
                                 } catch { duration = "N/A"; }
                             }
                             return (
                               <li key={`hist-${task.id}`} className="p-2 border rounded bg-white text-sm text-right">
                                 <p className="font-medium">{task.title}</p>
                                 <p className="text-xs text-gray-600">
                                   {'בוצע על ידי: '}<span className="font-semibold">{task.completedBy || 'לא ידוע'}</span>{' בתאריך: '}<span className="font-semibold">{formatDateTime(task.completedAt)}</span>
                                   {duration && <span className="ml-2 mr-2 pl-2 border-l">{'זמן ביצוע: '}<span className="font-semibold">{duration}</span></span>} 
                                 </p>
                                 {task.subtitle && <p className="text-xs text-gray-500 pt-1 mt-1 border-t">{task.subtitle}</p>}
                               </li>
                             );
                           })
                         }
                         {tasks.filter(task => task.done && task.completedAt).length === 0 && (
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

        
        {showAddLeadModal && (
           <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4" onClick={() => setShowAddLeadModal(false)}>
             <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                 <h2 className="text-lg font-semibold mb-4 text-right">{'הוספת ליד חדש'}</h2>
                 <form onSubmit={handleAddNewLead} className="space-y-4 text-right" dir="rtl">
                     
                     <div>
                       <Label htmlFor="new-lead-name" className="block text-sm font-medium mb-1">שם מלא <span className="text-red-500">*</span></Label>
                       <Input
                         id="new-lead-name" type="text" value={newLeadFullName}
                         onChange={(e) => setNewLeadFullName(e.target.value)} required
                       />
                     </div>
                     
                     <div>
                       <Label htmlFor="new-lead-phone" className="block text-sm font-medium mb-1">מספר טלפון <span className="text-red-500">*</span></Label>
                       <Input
                         id="new-lead-phone" type="tel" value={newLeadPhone}
                         onChange={(e) => setNewLeadPhone(e.target.value)} required
                       />
                     </div>
                     
                     <div>
                       <Label htmlFor="new-lead-message" className="block text-sm font-medium mb-1">הודעה / הערה</Label>
                       <Textarea
                         id="new-lead-message" value={newLeadMessage}
                         onChange={(e) => setNewLeadMessage(e.target.value)} rows={3}
                         placeholder="פרטים ראשוניים, סיבת פניה..."
                       />
                     </div>
                     
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <div>
                         <Label htmlFor="new-lead-status" className="block text-sm font-medium mb-1">סטטוס</Label>
                          <Select value={newLeadStatus} onValueChange={setNewLeadStatus}>
                            <SelectTrigger id="new-lead-status"><SelectValue placeholder="בחר סטטוס..." /></SelectTrigger>
                            <SelectContent>
                              
                              {Object.keys(leadStatusConfig).filter(k => k !== 'Default').map(status => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                       </div>
                       <div>
                         <Label htmlFor="new-lead-source" className="block text-sm font-medium mb-1">מקור הגעה</Label>
                         <Input
                           id="new-lead-source" type="text" value={newLeadSource}
                           onChange={(e) => setNewLeadSource(e.target.value)}
                           placeholder="לדוגמא: פייסבוק, טלפון, המלצה..."
                         />
                       </div>
                     </div>
                     
                     <div className="mt-6 flex justify-end gap-3">
                       <Button type="submit">הוסף ליד</Button>
                       <Button type="button" variant="outline" onClick={() => setShowAddLeadModal(false)}>ביטול</Button>
                     </div>
                 </form>
             </div>
           </div>
        )}


        
        
        <DragOverlay dropAnimation={null}>
            {activeId && activeTaskForOverlay ? (

                <div className="p-2 border rounded shadow-xl bg-white opacity-90">
                   
                   <div className="flex items-start space-x-3 space-x-reverse">
                       <Checkbox checked={!!activeTaskForOverlay.done} readOnly id={`drag-${activeTaskForOverlay.id}`} className="mt-1 shrink-0"/>
                       <div className="flex-grow overflow-hidden">
                           <label htmlFor={`drag-${activeTaskForOverlay.id}`} className={`font-medium text-sm cursor-grabbing ${activeTaskForOverlay.done ? "line-through text-gray-500" : "text-gray-900"}`}>{activeTaskForOverlay.title}</label>
                           {activeTaskForOverlay.subtitle && (<p className={`text-xs mt-0.5 ${activeTaskForOverlay.done ? "line-through text-gray-400" : "text-gray-600"}`}>{activeTaskForOverlay.subtitle}</p>)}
                           <div className="text-xs text-gray-500 mt-1 space-x-2 space-x-reverse">
                               <span>🗓️ {formatDateTime(activeTaskForOverlay.dueDate)}</span>
                               <span>👤 {activeTaskForOverlay.assignTo}</span>
                               <span>🏷️ {activeTaskForOverlay.category}</span>
                               <span>{activeTaskForOverlay.priority === 'דחוף' ? '🔥' : activeTaskForOverlay.priority === 'נמוך' ? '⬇️' : '➖'} {activeTaskForOverlay.priority}</span>
                           </div>
                       </div>
                   </div>
                </div>
            ) : null}
        </DragOverlay>

      </DndContext>
    </TooltipProvider>
  );

}