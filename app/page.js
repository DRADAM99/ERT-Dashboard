// Version 8.0 - sync tasks and residents status, notifications 
"use client";

// Utility functions for layout persistence
function saveLayoutPref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* ignore */ }
}
function getLayoutPref(key, defaultValue) {
  try {
    const val = localStorage.getItem(key);
    if (val !== null) return JSON.parse(val);
  } catch (e) { /* ignore */ }
  return defaultValue;
}

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Image from 'next/image';
import { useRouter } from "next/navigation";
import { auth, db } from "../firebase";
import { FaWhatsapp, FaCodeBranch } from "react-icons/fa";
import { or, query, where, orderBy, arrayUnion } from "firebase/firestore";
import { useAuth } from "./context/AuthContext";  // Updated import path
import EventStatus from "@/components/EventStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, RotateCcw, Bell, ChevronDown, Pencil, MessageCircle, Check, X, ChevronLeft, UserPlus, Menu, Link2, Settings } from 'lucide-react';
import NotesAndLinks from "@/components/NotesAndLinks";
import AdminLogsPanel from "@/components/AdminLogsPanel";
import AdminPanel from "@/components/AdminPanel";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  setDoc,
  doc,
  deleteDoc,
  serverTimestamp
} from "firebase/firestore";
import axios from "axios";
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
import { horizontalListSortingStrategy } from "@dnd-kit/sortable";
import SortableCategoryColumn from "../components/ui/sortable-category-column";
import SortableItem from "../components/ui/sortable-item";
//CandidatesBlock
import EventLogBlock from "../components/EventLogBlock";

import moment from 'moment-timezone';
import 'moment/locale/he';

import { momentLocalizer } from 'react-big-calendar';
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
import ResidentsManagement from '../components/ResidentsManagement';
import TaskManager from "@/components/TaskManager";
import TaskManager2 from "@/components/TaskManager-2";
import SimpleEmergencyLocator from "@/components/SimpleEmergencyLocator";

import { useToast } from "@/components/ui/use-toast"

// Add to imports
import { TaskTabs } from "@/components/TaskTabs";
import NotificationBell from "@/components/NotificationBell";

// Add this import at the top with other imports
import { Switch as MuiSwitch } from '@mui/material';
import { styled } from '@mui/material/styles';

// Add this styled component definition before the Dashboard component
const IOSSwitch = styled((props) => (
  <MuiSwitch focusVisibleClassName=".Mui-focusVisible" disableRipple {...props} />
))(({ theme }) => ({
  width: 42,
  height: 26,
  padding: 0,
  '& .MuiSwitch-switchBase': {
    padding: 0,
    margin: 2,
    transitionDuration: '300ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#fff',
      '& + .MuiSwitch-track': {
        backgroundColor: '#2196f3',
        opacity: 1,
        border: 0,
      },
      '&.Mui-disabled + .MuiSwitch-track': {
        opacity: 0.5,
      },
    },
    '&.Mui-focusVisible .MuiSwitch-thumb': {
      color: '#33cf4d',
      border: '6px solid #fff',
    },
    '&.Mui-disabled .MuiSwitch-thumb': {
      color: '#E9E9EA',
    },
    '&.Mui-disabled + .MuiSwitch-track': {
      opacity: 0.7,
    },
  },
  '& .MuiSwitch-thumb': {
    boxSizing: 'border-box',
    width: 22,
    height: 22,
  },
  '& .MuiSwitch-track': {
    borderRadius: 26 / 2,
    backgroundColor: '#E9E9EA',
    opacity: 1,
    transition: 'background-color 500ms',
  },
}));

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
const todayAt = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const formatDateTime = (date) => {
  if (!date) return "";
  try {

    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  } catch (error) { console.error("Error formatting date:", date, error); return ""; }

};
const residentStatusColorMap = {
  'כולם בבית וכולם בסדר': 'bg-green-500',
  'אנחנו זקוקים לסיוע': 'bg-red-500',
  'לא כולם בבית, כולם בסדר': 'bg-orange-400',
  'אין מידע על כל בני הבית': 'bg-yellow-400',
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

const LIVE_GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwNuUYL_Acq82G5Pb7lho-XzFIAOExn5ak6JqsQIwYUHOzErHmPO5lo4UcCinCzRqWkRA/exec";
const EMERGENCY_SETTINGS_DOC = { collection: "systemSettings", id: "emergencyMode" };
const isValidGoogleScriptExecUrl = (url) =>
  /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/.test(url.trim());


// Updated lead statuses and colors (order matters)
const leadStatusConfig = { "אנחנו זקוקים לסיוע": { color: "bg-red-500", priority: 1 }, "אין מידע על כל בני הבית": { color: "bg-orange-500", priority: 2 }, "לא כולם בבית, כולם בסדר": { color: "bg-orange-200", priority: 3 }, "כולם בבית וכולם בסדר": { color: "bg-green-500", priority: 4 }, "אין מידע על כל בני הבית": { color: "bg-yellow-500", priority: 5 }, };
const leadColorTab = (status) => leadStatusConfig[status]?.color || leadStatusConfig.Default.color;
const leadPriorityValue = (status) => leadStatusConfig[status]?.priority || leadStatusConfig.Default.priority;


// Add after user state declarations:





const taskPriorities = ["דחוף", "רגיל", "נמוך"];








const defaultTaskCategories = ["לוגיסטיקה", "אוכלוסיה", "רפואה", "חוסן", 'חמ"ל', "אחר"];

export default function Dashboard() {
  const [taskCategories, setTaskCategories] = useState(defaultTaskCategories);
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [alias, setAlias] = useState("");
  const [users, setUsers] = useState([]);
  const [department, setDepartment] = useState(""); // <-- Add this line
  
  // Single tasks state declaration
  const [tasks, setTasks] = useState([]);
  const [replyingToTaskId, setReplyingToTaskId] = useState(null);
  const [showOverdueEffects, setShowOverdueEffects] = useState(true);
  const [replyInputValue, setReplyInputValue] = useState("");
  // --- Add Kanban collapsed state ---
  const [kanbanCollapsed, setKanbanCollapsed] = useState({});
  // --- Add per-task collapsed state ---
  const [kanbanTaskCollapsed, setKanbanTaskCollapsed] = useState({});
  
  // Emergency Event End functionality
  const [showEndEmergencyDialog, setShowEndEmergencyDialog] = useState(false);
  const [emergencyEventId, setEmergencyEventId] = useState(`emergency_${new Date().toISOString().split('T')[0]}_${Date.now()}`);
  
  // Green Eyes functionality
  const [showGreenEyesDialog, setShowGreenEyesDialog] = useState(false);
  const [showEventStatus, setShowEventStatus] = useState(false);
  const [isDrillMode, setIsDrillMode] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState("exercise");
  const [exerciseGreenEyesUrl, setExerciseGreenEyesUrl] = useState("");
  const [isEmergencyConfigLoaded, setIsEmergencyConfigLoaded] = useState(false);
  const [isSavingEmergencyConfig, setIsSavingEmergencyConfig] = useState(false);
  const [showEmergencyConfigDialog, setShowEmergencyConfigDialog] = useState(false);
  const [emergencyConfigUpdatedBy, setEmergencyConfigUpdatedBy] = useState("");
  const [emergencyConfigUpdatedAt, setEmergencyConfigUpdatedAt] = useState(null);
  const isAdminUser = currentUser?.role === "admin" || role === "admin";
  const [showAdminLogs, setShowAdminLogs] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const emergencyModeLabel = emergencyMode === "live" ? "חי" : "תרגיל";
  const hasExerciseGreenEyesUrl = exerciseGreenEyesUrl.trim().length > 0;
  const isEmergencyActionsDisabled =
    !isEmergencyConfigLoaded ||
    isSavingEmergencyConfig ||
    (emergencyMode === "exercise" && !hasExerciseGreenEyesUrl);
  const getEmergencyScriptUrl = useCallback(() => {
    if (emergencyMode === "live") return LIVE_GOOGLE_APPS_SCRIPT_URL;
    return exerciseGreenEyesUrl.trim();
  }, [emergencyMode, exerciseGreenEyesUrl]);
  const formattedEmergencyConfigUpdatedAt = useMemo(() => {
    if (!emergencyConfigUpdatedAt) return "לא זמין";
    const asDate = emergencyConfigUpdatedAt?.toDate?.() || new Date(emergencyConfigUpdatedAt);
    if (Number.isNaN(asDate.getTime())) return "לא זמין";
    return asDate.toLocaleString("he-IL");
  }, [emergencyConfigUpdatedAt]);
// Add this handler for category drag end
const handleCategoryDragEnd = (event) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = taskCategories.indexOf(active.id);
  const newIndex = taskCategories.indexOf(over.id);
  if (oldIndex === -1 || newIndex === -1) return;
  const newOrder = arrayMove(taskCategories, oldIndex, newIndex);
  updateKanbanCategoryOrder(newOrder);
};
const handleClick2Call = async (phoneNumber) => {
  const apiUrl = "https://master.ippbx.co.il/ippbx_api/v1.4/api/info/click2call";
  const payload = {
    token_id: "22K3TWfeifaCPUyA",
    phone_number: phoneNumber,
    extension_number: "104",
    extension_password: "bdb307dc55bf1e679c296ee5c73215cb"
  };
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    if (response.ok) {
      toast({
        title: "התקשרות מתבצעת",
        description: `שיחה ל-${phoneNumber} הופעלה דרך המרכזיה.`
      });
    } else {
      const errorText = await response.text();
      toast({
        title: "שגיאה בהפעלת שיחה",
        description: errorText || "לא ניתן היה להפעיל שיחה דרך המרכזיה.",
        variant: "destructive"
      });
    }
  } catch (error) {
    toast({
      title: "שגיאה בהפעלת שיחה",
      description: error.message || "לא ניתן היה להפעיל שיחה דרך המרכזיה.",
      variant: "destructive"
    });
  }
};

  useEffect(() => {
    if (!currentUser) {
      setIsEmergencyConfigLoaded(false);
      setEmergencyMode("exercise");
      setExerciseGreenEyesUrl("");
      setEmergencyConfigUpdatedBy("");
      setEmergencyConfigUpdatedAt(null);
      return;
    }

    const configRef = doc(db, EMERGENCY_SETTINGS_DOC.collection, EMERGENCY_SETTINGS_DOC.id);
    const unsubscribe = onSnapshot(
      configRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const mode = data?.mode === "live" ? "live" : "exercise";
          setEmergencyMode(mode);
          setIsDrillMode(mode !== "live");
          setExerciseGreenEyesUrl(typeof data?.exerciseGreenEyesUrl === "string" ? data.exerciseGreenEyesUrl : "");
          setEmergencyConfigUpdatedBy(typeof data?.updatedBy === "string" ? data.updatedBy : "");
          setEmergencyConfigUpdatedAt(data?.updatedAt || null);
        } else {
          setEmergencyMode("exercise");
          setIsDrillMode(true);
          setExerciseGreenEyesUrl("");
          setEmergencyConfigUpdatedBy("");
          setEmergencyConfigUpdatedAt(null);
        }
        setIsEmergencyConfigLoaded(true);
      },
      (error) => {
        console.error("Error loading emergency settings:", error);
        setEmergencyMode("exercise");
        setIsDrillMode(true);
        setExerciseGreenEyesUrl("");
        setEmergencyConfigUpdatedBy("");
        setEmergencyConfigUpdatedAt(null);
        setIsEmergencyConfigLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const updateEmergencyMode = async (nextMode) => {
    if (!isAdminUser) return;
    setIsSavingEmergencyConfig(true);
    setIsDrillMode(nextMode === "exercise");
    try {
      const configRef = doc(db, EMERGENCY_SETTINGS_DOC.collection, EMERGENCY_SETTINGS_DOC.id);
      await setDoc(
        configRef,
        {
          mode: nextMode,
          updatedBy: alias || currentUser?.email || "System",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast({
        title: "מצב חירום עודכן",
        description: `המערכת עברה למצב ${nextMode === "live" ? "חי" : "תרגיל"}`,
      });
    } catch (error) {
      console.error("Error updating emergency mode:", error);
      toast({
        title: "שגיאה בעדכון מצב",
        description: error.message || "לא ניתן לעדכן מצב חירום",
        variant: "destructive",
      });
    } finally {
      setIsSavingEmergencyConfig(false);
    }
  };

  const saveExerciseGreenEyesUrl = async () => {
    if (!isAdminUser) return;
    const trimmedUrl = exerciseGreenEyesUrl.trim();

    if (!trimmedUrl) {
      toast({
        title: "נדרש קישור תרגיל",
        description: "יש להזין קישור Google Apps Script עבור תרגיל",
        variant: "destructive",
      });
      return;
    }

    if (!isValidGoogleScriptExecUrl(trimmedUrl)) {
      toast({
        title: "קישור לא תקין",
        description: "יש להזין קישור מלא שמסתיים ב-exec",
        variant: "destructive",
      });
      return;
    }

    setIsSavingEmergencyConfig(true);
    try {
      const configRef = doc(db, EMERGENCY_SETTINGS_DOC.collection, EMERGENCY_SETTINGS_DOC.id);
      await setDoc(
        configRef,
        {
          exerciseGreenEyesUrl: trimmedUrl,
          updatedBy: alias || currentUser?.email || "System",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setShowEmergencyConfigDialog(false);
      toast({
        title: "קישור תרגיל נשמר",
        description: "קישור ירוק בעיניים לתרגיל עודכן בהצלחה",
      });
    } catch (error) {
      console.error("Error saving exercise green eyes URL:", error);
      toast({
        title: "שגיאה בשמירת קישור",
        description: error.message || "לא ניתן לשמור את קישור התרגיל",
        variant: "destructive",
      });
    } finally {
      setIsSavingEmergencyConfig(false);
    }
  };

  // --- Add Kanban collapse/expand handler ---
  const handleToggleKanbanCollapse = async (category) => {
    setKanbanCollapsed((prev) => {
      const updated = { ...prev, [category]: !prev[category] };
      // Persist to Firestore
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        updateDoc(userRef, { kanbanCollapsed: updated });
      }
      return updated;
    });
  };
// Write lastSeen on mount and keep it fresh every 5 minutes while the tab is open
useEffect(() => {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const ping = () => updateDoc(userRef, { lastSeen: serverTimestamp() }).catch(() => {});
  ping();
  const interval = setInterval(ping, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, [currentUser]);

// Fetch and listen for user's Kanban category order from Firestore
useEffect(() => {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const unsubscribe = onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.kanbanCategoryOrder) && data.kanbanCategoryOrder.length > 0) {
        setTaskCategories(data.kanbanCategoryOrder.map(c => c.trim()));
      } else {
        setTaskCategories(defaultTaskCategories);
      }
    }
  });
  return () => unsubscribe();
}, [currentUser]);

// --- Follow-up phone icon logic ---
const handleFollowUpClick = async (lead) => {
  if (!currentUser) return;
  if (holdLeadId === lead.id) return;
  // Only activate if not already active and count is 0
  if (!lead.followUpCall?.active && (!lead.followUpCall || lead.followUpCall.count === 0)) {
    const leadRef = doc(db, 'leads', lead.id);
    await updateDoc(leadRef, { followUpCall: { active: true, count: 1 } });
  } else if (lead.followUpCall?.active) {
    const leadRef = doc(db, 'leads', lead.id);
    await updateDoc(leadRef, { followUpCall: { active: true, count: (lead.followUpCall.count || 1) + 1 } });
  }
};

  const handleFollowUpReset = async (lead) => {
    if (!currentUser) return;
    const leadRef = doc(db, 'leads', lead.id);
    await updateDoc(leadRef, { followUpCall: { active: false, count: 0 } });
    // Minimal delay to show completed ring, then clear
    setTimeout(() => {
      setHoldLeadId(null);
      setHoldProgress(0);
    }, 50);
  };

  // Emergency Event End Functions
  const formatDateTimeForCSV = (timestamp) => {
    if (!timestamp) return "";
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toISOString();
    }
    if (timestamp.toDate) {
      return timestamp.toDate().toISOString();
    }
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    return new Date(timestamp).toISOString();
  };

  const exportEmergencyDataToCSV = async () => {
    try {
      console.log("📤 Starting emergency data export...");
      
      const csvData = [];
      const headers = [
        'Timestamp',
        'Event Type',
        'Event ID',
        'User',
        'Action',
        'Details',
        'Status',
        'Department',
        'Priority',
        'Related IDs'
      ];
      csvData.push(headers);

      // 1. Export Event Logs
      const eventLogsSnapshot = await getDocs(collection(db, 'eventLogs'));
      eventLogsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        csvData.push([
          formatDateTimeForCSV(data.createdAt),
          'Event Log',
          doc.id,
          data.reporter || data.lastUpdater || '',
          'Event Created',
          data.description || '',
          data.status || '',
          data.department || '',
          '',
          ''
        ]);
        
        // Add status changes
        if (data.updatedAt && data.updatedAt !== data.createdAt) {
          csvData.push([
            formatDateTimeForCSV(data.updatedAt),
            'Event Log',
            doc.id,
            data.lastUpdater || '',
            'Status Updated',
            `Status: ${data.status}`,
            data.status || '',
            data.department || '',
            '',
            ''
          ]);
        }
        
        // Add history entries
        if (data.history && Array.isArray(data.history)) {
          data.history.forEach(entry => {
            csvData.push([
              formatDateTimeForCSV(entry.timestamp),
              'Event Log',
              doc.id,
              entry.userAlias || entry.userId || '',
              'Update Added',
              entry.text || '',
              data.status || '',
              data.department || '',
              '',
              ''
            ]);
          });
        }
      });

      // 2. Export Tasks
      const tasksSnapshot = await getDocs(collection(db, 'tasks'));
      tasksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        csvData.push([
          formatDateTimeForCSV(data.createdAt),
          'Task',
          doc.id,
          data.creatorAlias || data.creatorEmail || '',
          'Task Created',
          data.title || '',
          data.status || '',
          data.category || data.department || '',
          data.priority || '',
          data.residentId || ''
        ]);
        
        // Add task status changes
        if (data.updatedAt && data.updatedAt !== data.createdAt) {
          csvData.push([
            formatDateTimeForCSV(data.updatedAt),
            'Task',
            doc.id,
            data.lastUpdater || data.creatorAlias || '',
            'Task Updated',
            data.title || '',
            data.status || '',
            data.category || data.department || '',
            data.priority || '',
            data.residentId || ''
          ]);
        }
        
        // Add task completion
        if (data.completedAt) {
          csvData.push([
            formatDateTimeForCSV(data.completedAt),
            'Task',
            doc.id,
            data.completedByAlias || data.completedBy || '',
            'Task Completed',
            data.title || '',
            'Completed',
            data.category || data.department || '',
            data.priority || '',
            data.residentId || ''
          ]);
        }
        
        // Add replies
        if (data.replies && Array.isArray(data.replies)) {
          data.replies.forEach(reply => {
            csvData.push([
              formatDateTimeForCSV(reply.timestamp),
              'Task Reply',
              doc.id,
              reply.userAlias || reply.userId || '',
              'Reply Added',
              reply.text || '',
              data.status || '',
              data.category || data.department || '',
              '',
              data.residentId || ''
            ]);
          });
        }
      });

      // 3. Export Residents
      const residentsSnapshot = await getDocs(collection(db, 'residents'));
      residentsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        csvData.push([
          formatDateTimeForCSV(data.createdAt || data.syncedAt),
          'Resident',
          doc.id,
          data.syncedBy || data.createdBy || '',
          'Resident Added',
          `${data['שם פרטי'] || ''} ${data['שם משפחה'] || ''}`,
          data.סטטוס || data.status || '',
          '',
          '',
          ''
        ]);
        
        // Add status changes
        if (data.statusHistory && Array.isArray(data.statusHistory)) {
          data.statusHistory.forEach(change => {
            csvData.push([
              formatDateTimeForCSV(change.timestamp),
              'Resident Status',
              doc.id,
              change.userAlias || change.userId || '',
              'Status Changed',
              `${change.from} → ${change.to}`,
              change.to || '',
              '',
              '',
              change.updatedFromTask || ''
            ]);
          });
        }
        
        // Add comments
        if (data.comments && Array.isArray(data.comments)) {
          data.comments.forEach(comment => {
            csvData.push([
              formatDateTimeForCSV(comment.timestamp),
              'Resident Comment',
              doc.id,
              comment.userAlias || comment.userId || '',
              'Comment Added',
              comment.text || '',
              data.סטטוס || data.status || '',
              '',
              '',
              ''
            ]);
          });
        }
      });

      // 4. Export Leads
      const leadsSnapshot = await getDocs(collection(db, 'leads'));
      leadsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        csvData.push([
          formatDateTimeForCSV(data.createdAt),
          'Lead',
          doc.id,
          data.reporter || '',
          'Lead Created',
          data.fullName || data.description || '',
          data.status || '',
          data.department || '',
          '',
          ''
        ]);
        
        // Add status changes
        if (data.statusHistory && Array.isArray(data.statusHistory)) {
          data.statusHistory.forEach(change => {
            csvData.push([
              formatDateTimeForCSV(change.timestamp),
              'Lead Status',
              doc.id,
              change.userAlias || change.userId || '',
              'Status Changed',
              `${change.from} → ${change.to}`,
              change.to || '',
              '',
              '',
              ''
            ]);
          });
        }
      });

      // Sort by timestamp
      csvData.sort((a, b) => {
        if (a[0] === 'Timestamp') return -1;
        if (b[0] === 'Timestamp') return 1;
        return new Date(a[0]) - new Date(b[0]);
      });

      // Convert to CSV string
      const csvContent = csvData.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `emergency_event_${emergencyEventId}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log("✅ Emergency data exported successfully");
      return true;
    } catch (error) {
      console.error("❌ Error exporting emergency data:", error);
      return false;
    }
  };

  const handleEndEmergencyEvent = async () => {
    if (isEmergencyActionsDisabled) {
      toast({
        title: "הפעולה חסומה",
        description: emergencyMode === "exercise"
          ? "יש להזין קישור תרגיל לפני הפעלת פעולות חירום"
          : "הגדרות מצב החירום עדיין נטענות",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log("🏁 Ending emergency event...");
      
      // Export data to CSV
      const exportSuccess = await exportEmergencyDataToCSV();
      
      if (exportSuccess) {
        // Clear system for next emergency event
        console.log("🧹 Clearing system for next emergency event...");
        
        try {
          // Delete all event logs from Firestore
          console.log("🗑️ Deleting all event logs...");
          const { collection, getDocs, deleteDoc, doc } = await import("firebase/firestore");
          const { db } = await import("../firebase");
          
          // Get all event logs
          const eventLogsRef = collection(db, "eventLogs");
          const eventLogsSnapshot = await getDocs(eventLogsRef);
          
          // Delete all event logs
          const deletePromises = eventLogsSnapshot.docs.map(async (eventDoc) => {
            await deleteDoc(doc(db, "eventLogs", eventDoc.id));
          });
          
          await Promise.all(deletePromises);
          console.log("✅ All event logs deleted successfully");
          
          // Delete all residents from Firestore
          console.log("🗑️ Deleting all residents...");
          await clearResidentsCollection();
          console.log("✅ All residents deleted successfully");
          
          // Also delete any linked tasks
          try {
            const tasksRef = collection(db, "tasks");
            const tasksSnapshot = await getDocs(tasksRef);
            
            const taskDeletePromises = tasksSnapshot.docs.map(async (taskDoc) => {
              await deleteDoc(doc(db, "tasks", taskDoc.id));
            });
            
            await Promise.all(taskDeletePromises);
            console.log("✅ All linked tasks deleted successfully");
          } catch (taskError) {
            console.error('Error deleting linked tasks:', taskError);
          }
          
          // Call Google Apps Script to clear all resident statuses and residents
          const GOOGLE_APPS_SCRIPT_URL = getEmergencyScriptUrl();
          
          console.log(`🔄 Calling Google Apps Script webhook [${emergencyModeLabel}]:`, GOOGLE_APPS_SCRIPT_URL);
          
          let clearResponse;
          try {
            clearResponse = await fetch(GOOGLE_APPS_SCRIPT_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: 'clearSystem=1',
              mode: 'no-cors' // Add this to handle CORS issues
            });
            
            console.log("📥 Response status:", clearResponse.status);
            
            // Try to get response text, but handle potential errors
            let responseText = '';
            try {
              responseText = await clearResponse.text();
              console.log("📥 Response text:", responseText);
            } catch (textError) {
              console.log("📥 Could not read response text:", textError);
            }
          } catch (fetchError) {
            console.error("❌ Fetch error:", fetchError);
            throw fetchError;
          }
          
          if (clearResponse && clearResponse.ok) {
            console.log("✅ System cleared successfully");
            toast({
              title: "אירוע החירום הסתיים",
              description: "הנתונים יוצאו לקובץ CSV, כל האירועים והתושבים נמחקו והמערכת נוקתה בהצלחה",
            });
          } else {
            console.warn("⚠️ System clear failed, but export and event deletion succeeded");
            toast({
              title: "אירוע החירום הסתיים",
              description: "הנתונים יוצאו לקובץ CSV, כל האירועים והתושבים נמחקו בהצלחה, אך ניקוי המערכת נכשל",
            });
          }
        } catch (clearError) {
          console.error("❌ Error clearing system:", clearError);
          toast({
            title: "אירוע החירום הסתיים",
            description: "הנתונים יוצאו לקובץ CSV, כל האירועים והתושבים נמחקו בהצלחה, אך ניקוי המערכת נכשל",
          });
        }
        
        // Close dialog
        setShowEndEmergencyDialog(false);
      } else {
        toast({
          title: "שגיאה בייצוא הנתונים",
          description: "לא ניתן היה לייצא את הנתונים",
          variant: "destructive"
        });
        // Close dialog even if export failed
        setShowEndEmergencyDialog(false);
      }
    } catch (error) {
      console.error("❌ Error ending emergency event:", error);
      toast({
        title: "שגיאה בסיום אירוע החירום",
        description: error.message || "שגיאה לא ידועה",
        variant: "destructive"
      });
      // Close dialog even if there's an error
      setShowEndEmergencyDialog(false);
    }
  };

  // Green Eyes Activation Function (v7.0 — Firebase-centered, dual mode)
  const handleGreenEyesActivation = async () => {
    if (isEmergencyActionsDisabled) {
      toast({
        title: "הפעולה חסומה",
        description: emergencyMode === "exercise"
          ? "יש להזין קישור תרגיל לפני הפעלת נוהל ירוק בעיניים"
          : "הגדרות מצב החירום עדיין נטענות",
        variant: "destructive"
      });
      return;
    }

    setShowGreenEyesDialog(false);
    const mode = isDrillMode ? "drill" : "live";
    try {
      console.log(`🚨 Activating Green Eyes — mode: ${mode}`);
      
      // Create emergency event log entry
      await addDoc(collection(db, "eventLogs"), {
        reporter: alias || currentUser?.email || "System",
        recipient: "חמ\"ל",
        description: isDrillMode
          ? "הפעלת תרגיל ירוק בעיניים"
          : "הפעלת נוהל ירוק בעיניים - אירוע חירום",
        department: "חמ\"ל",
        status: "מחכה",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdater: alias || currentUser?.email || "System",
        history: [{
          timestamp: new Date().toISOString(),
          text: isDrillMode ? "תרגיל ירוק בעיניים הופעל" : "נוהל ירוק בעיניים הופעל",
          userAlias: alias || currentUser?.email || "System"
        }],
        emergencyType: "green_eyes",
        emergencyMode: mode,
        emergencyEventId: emergencyEventId
      });

      // Write to Firestore emergencyEvents — triggers Cloud Function
      const eventId = `ge_${mode}_${Date.now()}`;
      console.log(`🔄 Writing emergency event to Firestore: ${eventId}`);
      
      await setDoc(doc(db, "emergencyEvents", eventId), {
        type: "green_eyes",
        mode: mode,
        triggeredBy: alias || currentUser?.email || "System",
        triggeredAt: serverTimestamp(),
        status: "pending",
        emergencyEventId: emergencyEventId
      });

      console.log(`✅ Emergency event created: ${eventId}`);

      toast({
        title: isDrillMode ? "תרגיל ירוק בעיניים הופעל" : "נוהל ירוק בעיניים הופעל",
        description: isDrillMode
          ? "תרגיל נרשם במערכת — הודעות תרגיל יישלחו"
          : "אירוע חירום נרשם במערכת — הודעות חירום יישלחו",
      });

    } catch (error) {
      console.error("❌ Error activating Green Eyes:", error);
      toast({
        title: "שגיאה בהפעלת נוהל ירוק בעיניים",
        description: error.message || "שגיאה לא ידועה",
        variant: "destructive"
      });
    }
  };

  // --- Hold handlers for the button ---
  const holdDelayTimeout = useRef();

  const handleHoldStart = (lead) => {
    setHoldLeadId(lead.id);
    setHoldProgress(0);
    // Start a 0.3-second delay before animating
    holdDelayTimeout.current = setTimeout(() => {
      const start = Date.now();
      function animate() {
        const elapsed = Date.now() - start;
        const progress = Math.min(elapsed / 1200, 1); // 1.2s animation
        setHoldProgress(progress);
        if (progress < 1) {
          holdAnimationRef.current = requestAnimationFrame(animate);
        } else {
          handleFollowUpReset(lead);
        }
      }
      holdAnimationRef.current = requestAnimationFrame(animate);
    }, 300); // 0.3s delay before animation
  };
// loading user data
const fetchUsers = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    const users = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email || "",
        alias: data.alias || data.email || "",
        role: data.role || "staff",
      };
    });
    setAssignableUsers(users);
    if (typeof setUsers === 'function') setUsers(users); // Only if you have setUsers
  } catch (error) {
    console.error("שגיאה בטעינת משתמשים:", error);
  }
};
  const handleHoldEnd = () => {
    setHoldLeadId(null);
    setHoldProgress(0);
    if (holdDelayTimeout.current) clearTimeout(holdDelayTimeout.current);
    if (holdAnimationRef.current) cancelAnimationFrame(holdAnimationRef.current);
  };

const [holdLeadId, setHoldLeadId] = useState(null);
const [holdProgress, setHoldProgress] = useState(0);
const holdAnimationRef = useRef();
const HOLD_DURATION = 1500;

// When lead status changes, reset followUpCall
const handleStatusChange = async (leadId, newStatus) => {
  const leadRef = doc(db, 'leads', leadId);
  await updateDoc(leadRef, { status: newStatus, followUpCall: { active: false, count: 0 } });
};
// Function to update Kanban category order in Firestore
const updateKanbanCategoryOrder = async (newOrder) => {
  setTaskCategories(newOrder);
  if (currentUser) {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, { kanbanCategoryOrder: newOrder });
  }
};
  // --- Fetch per-task collapsed state from Firestore ---
  useEffect(() => {
    if (!currentUser) return;
    const fetchTaskCollapsed = async () => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setKanbanTaskCollapsed(data.kanbanTaskCollapsed || {});
        }
      } catch (e) {
        setKanbanTaskCollapsed({});
      }
    };
    fetchTaskCollapsed();
  }, [currentUser]);

  // --- Handler for per-task collapse/expand ---
  const handleToggleTaskCollapse = async (taskId) => {
    setKanbanTaskCollapsed((prev) => {
      const updated = { ...prev, [taskId]: !prev[taskId] };
      // Persist to Firestore
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        updateDoc(userRef, { kanbanTaskCollapsed: updated });
      }
      return updated;
    });
  };

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
      return;
    }
    setLoading(false);
  }, [loading, currentUser, router]);

  // Fetch user's alias, role, and department — runs only when the logged-in user changes
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) return;

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setAlias(data.alias || currentUser.email || "");
          setRole(data.role || "staff");
          setDepartment(data.department?.trim() || "אחר");
        } else {
          // Brand-new Google/social login with no Firestore profile yet
          await setDoc(userRef, {
            email: currentUser.email,
            alias: currentUser.email,
            role: "staff",
            department: "אחר",
            createdAt: serverTimestamp(),
          });
          setAlias(currentUser.email);
          setRole("staff");
          setDepartment("אחר");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        // Do NOT overwrite already-loaded alias/role on transient errors
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Load departments from Firestore (falls back to default list)
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const snap = await getDoc(doc(db, "systemSettings", "taskCategories"));
        if (snap.exists()) {
          const cats = snap.data().categories;
          if (Array.isArray(cats) && cats.length > 0) {
            setTaskCategories(cats);
          }
        }
      } catch {
        // Keep default categories on error
      }
    };
    loadDepartments();
  }, []);

  
  /** Task Listener with improved visibility logic */
  useEffect(() => {
    if (!currentUser || !users.length) return;

    console.log("Setting up task listener for user:", {
      uid: currentUser.uid,
      email: currentUser.email,
      alias: currentUser.alias || alias
    });

    const tasksRef = collection(db, "tasks");
    // Query all tasks - we'll filter client-side for better flexibility
    const q = query(tasksRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTasks = snapshot.docs.map(doc => {
        const data = doc.data();
        // Ensure replies are properly structured
        const replies = Array.isArray(data.replies) ? data.replies.map(reply => ({
          ...reply,
          timestamp: reply.timestamp?.toDate?.() || new Date(reply.timestamp) || new Date(),
          isRead: reply.isRead || false
        })).sort((a, b) => b.timestamp - a.timestamp) : [];

        // --- FIX: Always parse dueDate as Date object ---
        let dueDate = null;
        if (data.dueDate) {
          if (typeof data.dueDate.toDate === 'function') {
            dueDate = data.dueDate.toDate();
          } else if (typeof data.dueDate === 'string') {
            dueDate = new Date(data.dueDate);
          } else if (data.dueDate instanceof Date) {
            dueDate = data.dueDate;
          }
        }

        return {
          id: doc.id,
          ...data,
          dueDate,
          replies,
          uniqueId: `task-${doc.id}-${Date.now()}`
        };
      });
      
      console.log("All tasks with replies:", allTasks);

      // Show all tasks to all users
      const visibleTasks = allTasks;

      console.log("Filtered visible tasks with replies:", visibleTasks);
      setTasks(visibleTasks);
    }, (error) => {
      console.error("Error in task listener:", error);
    });

    return () => unsubscribe();
  }, [currentUser, users, alias, department]);

/** 🔁 Fetch logged-in user's alias */
useEffect(() => {
  if (currentUser) {
    const fetchAlias = async () => {
      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        setAlias(data.alias || data.email);
      }
    };
    fetchAlias();
  }
}, [currentUser]);


  // ✅ 1. Listen to auth state changes - REMOVED duplicate listener since we use AuthContext
  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
    }
  }, [currentUser]);

  // ✅ 2. Redirect after auth check
  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [loading, currentUser, router]);

  // ✅ 3. Optional loading screen (handled in return)

  const handleAliasUpdate = async () => {
    console.log("Clicked save alias. Current alias:", alias);
    if (!currentUser) return;
    const ref = doc(db, "users", currentUser.uid);
    const snap = await getDoc(ref);
  
    if (!snap.exists()) {
      await setDoc(ref, {
        email: currentUser.email,
        alias: alias,
        role: "staff", // Default role for new users
        department: (department || "אחר").trim(), // Ensure department is set
        createdAt: new Date()
      });
    } else {
      await updateDoc(ref, {
        alias: alias,
        department: (department || "אחר").trim() // Update department if needed
      });
    }
  };

  // Function for admins to assign departments to users
  const assignUserDepartment = async (userId, newDepartment) => {
    if (!currentUser || (currentUser.role !== 'admin' && role !== 'admin')) {
      console.error("Only admins can assign departments");
      return;
    }

    if (!taskCategories.includes(newDepartment)) {
      console.error("Invalid department:", newDepartment);
      return;
    }

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        department: newDepartment,
        updatedAt: serverTimestamp()
      });
      console.log(`Department ${newDepartment} assigned to user ${userId}`);
    } catch (error) {
      console.error("Error assigning department:", error);
    }
  };

  
  const [justClosedLeadId, setJustClosedLeadId] = useState(null);
  const justClosedLeadIdRef = useRef(null);
  const closeLeadId = (leadId) => {
    setJustClosedLeadId(leadId);
    justClosedLeadIdRef.current = leadId;
  };
const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [isFullView, setIsFullView] = useState(() => getLayoutPref('dashboard_isFullView', false));
  const [mounted, setMounted] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState('');
  const defaultBlockOrder = { TM: 1, Calendar: 2, Map: 3, Leads: 4, EventLog: 5 };
  const [blockOrder, setBlockOrder] = useState(() => getLayoutPref('dashboard_blockOrder', defaultBlockOrder));


  const [showNLPModal, setShowNLPModal] = useState(false);
  const [nlpInput, setNlpInput] = useState("");
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnTaskId, setReturnTaskId] = useState(null);
  const [returnComment, setReturnComment] = useState("");
  const [returnNewAssignee, setReturnNewAssignee] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
 


  
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const [isTMFullView, setIsTMFullView] = useState(() => getLayoutPref('dashboard_isTMFullView', false));
  
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingDepartment, setEditingDepartment] = useState("");
  const [editingTitle, setEditingTitle] = useState("");
  const [editingSubtitle, setEditingSubtitle] = useState("");
  const [editingPriority, setEditingPriority] = useState("רגיל");
  const [editingCategory, setEditingCategory] = useState(taskCategories[0] || "");
  const [editingDueDate, setEditingDueDate] = useState("");
  const [editingDueTime, setEditingDueTime] = useState("");
  const [isLeadsFullView, setIsLeadsFullView] = useState(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('dashboard_isLeadsFullView');
      return v ? JSON.parse(v) : false;
    }
    return false;
  });
  useEffect(() => {
    localStorage.setItem('dashboard_isLeadsFullView', JSON.stringify(isLeadsFullView));
  }, [isLeadsFullView]);
  // Add task creation state variables
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSubtitle, setNewTaskSubtitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("רגיל");
  const [newTaskCategory, setNewTaskCategory] = useState(taskCategories[0] || "");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskDueTime, setNewTaskDueTime] = useState("");
  const [newTaskDepartment, setNewTaskDepartment] = useState(taskCategories[0] || "");

  // First, add a new state for showing the new task form
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);

  // Add state for calendar full view
  const [isCalendarFullView, setIsCalendarFullView] = useState(() => getLayoutPref('dashboard_isCalendarFullView', false));
  // Add state for event log full view
  const [isEventLogFullView, setIsEventLogFullView] = useState(() => getLayoutPref('dashboard_isEventLogFullView', false));
useEffect(() => {
  saveLayoutPref('dashboard_isEventLogFullView', isEventLogFullView);
}, [isEventLogFullView]);
// Add state for map full view
const [isMapFullView, setIsMapFullView] = useState(() => getLayoutPref('dashboard_isMapFullView', false));
useEffect(() => {
  saveLayoutPref('dashboard_isMapFullView', isMapFullView);
}, [isMapFullView]);
  // Persist calendar full view preference
  useEffect(() => {
    saveLayoutPref('dashboard_isCalendarFullView', isCalendarFullView);
  }, [isCalendarFullView]);

  // Persist block order preference
  useEffect(() => {
    saveLayoutPref('dashboard_blockOrder', blockOrder);
  }, [blockOrder]);

  useEffect(() => {
    saveLayoutPref('dashboard_isTMFullView', isTMFullView);
  }, [isTMFullView]);

  // Persist lead manager full view preference
  useEffect(() => {
    saveLayoutPref('dashboard_isFullView', isFullView);
  }, [isFullView]);
 
  // Update task creation to use department-based assignment instead of individual users
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
        category: newTaskCategory,
        status: "מחכה",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        creatorAlias: alias || currentUser.email || "",
        // Assign to department instead of individual user
        department: newTaskDepartment,
        // Keep assignTo for backward compatibility but it should be the department
        assignTo: newTaskDepartment,
        dueDate: newTaskDueDate && newTaskDueTime
          ? new Date(`${newTaskDueDate}T${newTaskDueTime}`).toISOString()
          : null,
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null
      };

      console.log("Saving task with data:", newTask);
      await setDoc(taskRef, newTask);

      // Reset form
      setNewTaskTitle("");
      setNewTaskSubtitle("");
      setNewTaskPriority("רגיל");
      setNewTaskCategory(taskCategories[0] || "");
      setNewTaskDueDate("");
      setNewTaskDueTime("");
      setNewTaskDepartment(taskCategories[0] || "");
      setShowTaskModal(false);
    } catch (error) {
      console.error("Error creating task:", error);
      alert("שגיאה ביצירת המשימה. נסה שוב.");
    }
  };

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
        alert('אין לך הרשאה להוסיף תגובה למשימה זו');
        return;
      }

      const now = new Date();
      
      // Create the new reply object with a regular timestamp
      const newReply = {
        id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: replyText,
        timestamp: now,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userAlias: alias || currentUser.email,
        isRead: false
      };

      // Get existing replies
      const existingReplies = taskData.replies || [];

      // Update all fields in a single operation to match the rules
      await updateDoc(taskRef, {
        // Preserve existing core fields exactly as they are
        userId: taskData.userId,
        creatorId: taskData.creatorId,
        assignTo: taskData.assignTo,
        
        // Update reply-related fields
        replies: [...existingReplies, newReply],
        hasNewReply: true,
        lastReplyAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Update local state
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === taskId 
            ? {
                ...task,
                replies: [...(task.replies || []), newReply],
                hasNewReply: true,
                lastReplyAt: now
            }
            : task
        )
      );

      // Clear reply input
      setReplyingToTaskId(null);

      console.log('Reply added successfully to task:', taskId);
    } catch (error) {
      console.error('Error adding reply:', error, {
        taskId,
        currentUser: currentUser?.email,
        alias
      });
      alert('שגיאה בהוספת תגובה');
    }
  };
  // Add state to track which lead is being confirmed for deletion
  const [confirmingDeleteLeadId, setConfirmingDeleteLeadId] = useState(null);
  // ... existing code ...
  // Update handleDeleteLead to remove window.confirm and use inline confirmation
  const handleDeleteLead = async (leadId) => {
    if (!(currentUser?.role === "admin" || role === "admin")) {
      alert("רק אדמין יכול למחוק דיווח");
      return;
    }
    // Only delete if confirmingDeleteLeadId matches
    if (confirmingDeleteLeadId !== leadId) {
      setConfirmingDeleteLeadId(leadId);
      return;
    }
    try {
      await deleteDoc(doc(db, "leads", leadId));
      toast({ title: "הדיווח נמחק", description: "דיווח הוסר מהמערכת." });
      setConfirmingDeleteLeadId(null);
    } catch (error) {
      console.error("שגיאה במחיקת דיווח:", error);
      alert("שגיאה במחיקת דיווח");
      setConfirmingDeleteLeadId(null);
    }
  };
  const handleDuplicateLead = async (lead) => {
    try {
      // Prepare duplicated lead data
      const duplicatedLead = {
        ...lead,
        fullName: lead.fullName + " משוכפל", // Add 'משוכפל' to the name
        createdAt: new Date(), // New creation date
        expanded: false,
      };
      // Remove fields that should not be duplicated
      delete duplicatedLead.id;
      // Add to Firestore
      await addDoc(collection(db, "leads"), duplicatedLead);
      // No need to update local state, real-time listener will update leads
      toast({ title: "הדיווח שוכפל", description: "נוצר דיווח חדש משוכפל." });
    } catch (error) {
      console.error("שגיאה בשכפול דיווח:", error);
      alert("שגיאה בשכפול דיווח. נסה שוב.");
    }
  };
  // ... existing code ...
  // In the expanded lead row and compact list, update the delete button:
  // Replace the delete button with inline confirmation if confirmingDeleteLeadId === lead.id
  // ... existing code ...
  // In the compact list, do the same for the delete icon button:
  // ... existing code ...
// Fetch residents from Firebase
const [residents, setResidents] = useState([]);
const [residentCategories, setResidentCategories] = useState([]);
const [selectedResidentCategories, setSelectedResidentCategories] = useState([]);

// Function to clear residents collection (for debugging)
const clearResidentsCollection = async () => {
  try {
    const residentsRef = collection(db, 'residents');
    const snapshot = await getDocs(residentsRef);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    console.log('✅ Cleared residents collection');
  } catch (error) {
    console.error('❌ Error clearing residents:', error);
  }
};

useEffect(() => {
  if (!currentUser) return;

  console.log("🔄 Setting up residents listener...");
  console.log("👤 Current user:", currentUser.uid);

  const unsubscribe = onSnapshot(collection(db, "residents"), (snapshot) => {
    console.log(`📊 Residents listener triggered: ${snapshot.docs.length} documents`);
    
    const fetchedResidents = snapshot.docs.map((doc) => {
      const data = doc.data();
      console.log(`📄 Document ${doc.id}:`, data);
      return {
        id: doc.id,
        ...data,
        // Convert Firestore timestamps to Date objects
        syncedAt: data.syncedAt?.toDate?.() || new Date(),
        createdAt: data.createdAt?.toDate?.() || new Date(),
      };
    });

    console.log("📋 Fetched residents:", fetchedResidents);
    console.log("🔍 Sample resident fields:", fetchedResidents.length > 0 ? Object.keys(fetchedResidents[0]) : "No residents");
    setResidents(fetchedResidents);
    
    // Extract unique categories from the 'סטטוס' or 'status' column
    const catKey = fetchedResidents.length > 0 ? 
      Object.keys(fetchedResidents[0]).find(k => k === 'סטטוס' || k.toLowerCase() === 'status') : null;
    
    if (catKey) {
      const cats = Array.from(
        new Set(
          fetchedResidents
            .map(r => (r[catKey] || '').trim())
            .filter(Boolean)
        )
      ).sort();
      
      // Add blank status option if there are residents with empty status
      const hasBlankStatus = fetchedResidents.some(r => !(r[catKey] || '').trim());
      if (hasBlankStatus) {
        cats.unshift('ללא סטטוס'); // Add at the beginning
      }
      
      setResidentCategories(cats);
      setSelectedResidentCategories(cats); // Default: all selected
    }
  });

  return () => unsubscribe();
}, [currentUser]);
//filter residents by selected categories
const filteredResidents = useMemo(() => {
  console.log("🔍 Filtering residents:", { 
    residentsCount: residents.length, 
    selectedCategories: selectedResidentCategories 
  });
  
  if (!selectedResidentCategories.length) {
    console.log("📋 No categories selected, returning all residents");
    return residents;
  }
  
  const catKey = residents.length ? Object.keys(residents[0]).find(k => k === 'סטטוס' || k.toLowerCase() === 'status') : null;
  if (!catKey) {
    console.log("❌ No status category key found, returning all residents");
    return residents;
  }
  
  const filtered = residents.filter(r => {
    const status = (r[catKey] || '').trim();
    // Handle "ללא סטטוס" (No Status) option
    if (selectedResidentCategories.includes('ללא סטטוס')) {
      if (!status) return true; // Include residents with blank status
    }
    // Include residents with matching status
    return selectedResidentCategories.includes(status);
  });
  console.log(`📊 Filtered residents: ${filtered.length} out of ${residents.length}`);
  return filtered;
}, [residents, selectedResidentCategories]);

  const handleMarkReplyAsRead = async (taskId) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        console.error('Task not found');
        return;
      }

      const taskData = taskDoc.data();
      const updatedReplies = (taskData.replies || []).map(reply => ({
        ...reply,
        isRead: true
      }));

      await updateDoc(taskRef, {
        replies: updatedReplies,
        hasNewReply: false,
        updatedAt: serverTimestamp()
      });

      // Update local state
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === taskId 
            ? {
                ...task,
                replies: updatedReplies,
        hasNewReply: false
              }
            : task
        )
      );

    } catch (error) {
      console.error('Error marking reply as read:', error);
      alert('שגיאה בעדכון סטטוס תגובה');
    }
  };

  // Add this before the renderTask function
  const handleTaskDone = async (taskId, checked) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      if (!taskDoc.exists()) {
        console.error('Task not found');
        return;
      }
      const taskData = taskDoc.data();
      const now = new Date();
      // Use alias if available, fallback to email or assignTo
      const aliasToUse = alias || currentUser?.alias || currentUser?.email || taskData.assignTo || taskData.creatorAlias || taskData.creatorEmail || '';
      await updateDoc(taskRef, {
        done: checked,
        completedBy: checked ? (currentUser?.email || currentUser?.uid) : null,
        completedByAlias: checked ? aliasToUse : null,
        completedAt: checked ? now : null,
        updatedAt: serverTimestamp()
      });
      // Update local state
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === taskId 
            ? { 
                ...task, 
                done: checked,
                completedBy: checked ? (currentUser?.email || currentUser?.uid) : null,
                completedByAlias: checked ? aliasToUse : null,
                completedAt: checked ? now : null
            }
          : task
      ));
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('שגיאה בעדכון סטטוס המשימה');
    }
  };

  const handleNudgeTask = async (taskId) => {
    if (!currentUser) return;

    try {
      const taskRef = doc(db, "tasks", taskId);
      const now = new Date();
      
      const newNudge = {
        timestamp: now,
        userId: currentUser.uid,
        userAlias: currentUser.alias || currentUser.email
      };

      // Get current task data
      const taskDoc = await getDoc(taskRef);
      const taskData = taskDoc.data();

      await updateDoc(taskRef, {
        nudges: arrayUnion(newNudge),
        lastNudgedAt: now,
        updatedAt: now
      });

      // Create a notification for the assignee
      if (taskData.assignTo !== currentUser.email) {
        const notificationRef = doc(collection(db, "notifications"));
        await setDoc(notificationRef, {
          type: 'task_nudge',
          taskId: taskId,
          taskTitle: taskData.title,
          senderId: currentUser.uid,
          senderAlias: currentUser.alias || currentUser.email,
          recipientId: taskData.assignTo,
          createdAt: now,
          isRead: false
        });
      }

      toast({
        title: "תזכורת נשלחה",
        description: "נשלחה תזכורת למשתמש המוקצה למשימה",
      });
    } catch (error) {
      console.error('Error sending nudge:', error);
      toast({
        title: "שגיאה",
        description: "לא ניתן היה לשלוח תזכורת",
        variant: "destructive"
      });
    }
  };

  // Handle resident status update from task
  const handleUpdateResidentStatus = async (taskId, newStatus) => {
    if (!currentUser) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      const taskData = taskDoc.data();
      
      if (!taskData.residentId) {
        toast({
          title: "שגיאה",
          description: "משימה זו אינה מקושרת לתושב",
          variant: "destructive"
        });
        return;
      }

      const residentRef = doc(db, 'residents', taskData.residentId);
      const residentDoc = await getDoc(residentRef);
      const residentData = residentDoc.data();
      
      const now = new Date();
      const oldStatus = residentData.סטטוס || '';

      // Update resident status
      await updateDoc(residentRef, {
        סטטוס: newStatus,
        updatedAt: now,
        lastStatusChange: {
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias || currentUser.email,
          updatedFromTask: taskId
        },
        statusHistory: arrayUnion({
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias || currentUser.email,
          updatedFromTask: taskId
        })
      });

      // Add comment to resident about status change
      const comment = {
        text: `סטטוס עודכן ל"${newStatus}" דרך משימה: ${taskData.title}`,
        timestamp: now,
        userId: currentUser.uid,
        userAlias: alias || currentUser.email,
        updatedFromTask: taskId
      };

      await updateDoc(residentRef, {
        comments: arrayUnion(comment)
      });

      // Immediately update the task's residentStatus in the UI
      setTasks(prevTasks => 
        prevTasks.map(task => 
          task.id === taskId 
            ? { ...task, residentStatus: newStatus }
            : task
        )
      );

      toast({
        title: "סטטוס עודכן",
        description: `סטטוס התושב עודכן ל${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating resident status:', error);
      toast({
        title: "שגיאה",
        description: "לא ניתן היה לעדכן סטטוס התושב",
        variant: "destructive"
      });
    }
  };

  // Update the task rendering to show replies
  const renderTask = (task) => {
    if (!task) {
      return (
        <div className="p-3 border rounded bg-blue-50 shadow-md">
          <form onSubmit={handleCreateTask} className="space-y-2">
            <div>
              <Label className="text-xs">מחלקה ל:</Label>
              <select 
                value={newTaskDepartment} 
                onChange={(e) => setNewTaskDepartment(e.target.value)} 
                className="h-8 text-sm w-full border rounded"
              >
                <option value="">בחר מחלקה</option>
                {taskCategories.map((dep) => (
                  <option key={dep} value={dep}>
                    {dep}
                  </option>
                ))}
              </select>
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
                <Label className="text-xs">קטגוריה:</Label>
                <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">תאריך:</Label>
                <Input 
                  type="date" 
                  value={newTaskDueDate} 
                  onChange={(e) => setNewTaskDueDate(e.target.value)} 
                  className="h-8 text-sm" 
                  required 
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">שעה:</Label>
                <Input 
                  type="time" 
                  value={newTaskDueTime} 
                  onChange={(e) => setNewTaskDueTime(e.target.value)} 
                  className="h-8 text-sm" 
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 space-x-reverse pt-1">
              <Button type="submit" size="sm">{'צור משימה'}</Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => setShowTaskModal(false)}
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
                  {taskCategories.map((dep) => (
                    <SelectItem key={dep} value={dep}>
                      {dep}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">כותרת:</Label><Input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} className="h-8 text-sm" required 
              onKeyDown={e => { if (e.key === ' ' || e.code === 'Space') e.stopPropagation(); }}
            />
            <Textarea value={editingSubtitle} onChange={(e) => setEditingSubtitle(e.target.value)} rows={2} className="text-sm"
              onKeyDown={e => { if (e.key === ' ' || e.code === 'Space') e.stopPropagation(); }}
            /></div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">עדיפות:</Label>
                <Select value={editingPriority} onValueChange={setEditingPriority}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{taskPriorities.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">קטגוריה:</Label>
                <Select value={editingCategory} onValueChange={setEditingCategory}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{taskCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
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
        </div>
      );
    }

    // Regular task display
    const hasUnreadReplies = task.replies?.some(reply => !reply.readBy?.includes(currentUser?.uid));
    const isCreator = task.createdBy === currentUser?.uid;
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
            </div>
            
            {/* Resident information display */}
            {task.residentId && (
              <div className="mt-2 p-2 bg-blue-50 rounded border-l-4 border-blue-400">
                <div className="text-xs font-medium text-blue-800 mb-1">תושב מקושר:</div>
                <div className="text-xs text-blue-700">{task.residentName}</div>
                <div className="text-xs text-blue-600">טלפון: {task.residentPhone}</div>
                <div className="text-xs text-blue-600">שכונה: {task.residentNeighborhood}</div>
                <div className="mt-2 pt-2 border-t border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-800">סטטוס תושב:</span>
                    <Select
                      value={task.residentStatus || ''}
                      onValueChange={(newStatus) => {
                        if (newStatus && ['כולם בסדר', 'זקוקים לסיוע', 'לא בטוח'].includes(newStatus)) {
                          handleUpdateResidentStatus(task.id, newStatus);
                        }
                      }}
                    >
                      <SelectTrigger className={`text-xs px-2 py-1 rounded ${
                        task.residentStatus === 'כולם בסדר' ? 'bg-green-100 text-green-800 border-green-300' :
                        task.residentStatus === 'זקוקים לסיוע' ? 'bg-red-100 text-red-800 border-red-300' :
                        task.residentStatus === 'לא בטוח' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                        'bg-gray-100 text-gray-800 border-gray-300'
                      }`}>
                        <SelectValue placeholder={task.residentStatus || 'לא מוגדר'} />
                      </SelectTrigger>
                      <SelectContent className="bg-white border border-gray-200 shadow-lg">
                        <SelectItem value="כולם בסדר" className="hover:bg-gray-50">כולם בסדר</SelectItem>
                        <SelectItem value="זקוקים לסיוע" className="hover:bg-gray-50">זקוקים לסיוע</SelectItem>
                        <SelectItem value="לא בטוח" className="hover:bg-gray-50">לא בטוח</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                    setEditingPriority(task.priority || 'רגיל');
                    setEditingCategory(task.category || taskCategories[0] || '');
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

            {/* Resident status update button for task assignees */}
            {task.residentId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      const newStatus = prompt('עדכן סטטוס תושב (כולם בסדר/זקוקים לסיוע/לא בטוח):');
                      if (newStatus && ['כולם בסדר', 'זקוקים לסיוע', 'לא בטוח'].includes(newStatus)) {
                        handleUpdateResidentStatus(task.id, newStatus);
                      }
                    }}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>עדכן סטטוס תושב</TooltipContent>
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

        {/* Mark as read button */}
        {hasUnreadReplies && (
          <div className="mt-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs"
              onClick={() => handleMarkReplyAsRead(task.id)}
            >
              סמן כנקרא
            </Button>
          </div>
        )}
      </div>
    );
  };





  const [leads, setLeads] = useState([
/** 
    { id: 'lead-1', createdAt: new Date(new Date().setDate(new Date().getDate() - 10)), fullName: "יוסי כהן", phoneNumber: "0501234567", message: "פולו-אפ על פגישה", status: "מעקב", source: "פייסבוק", conversationSummary: [ { text: "יצירת קשר ראשונית.", timestamp: new Date(new Date().setDate(new Date().getDate() - 10)) }, { text: "תיאום פגישה.", timestamp: new Date(new Date().setDate(new Date().getDate() - 9)) }, ], expanded: false, appointmentDateTime: null, },
    { id: 'lead-2', createdAt: new Date(new Date().setDate(new Date().getDate() - 5)), fullName: "שרה מזרחי", phoneNumber: "0527654321", message: "שיחת בירור מצב", status: "תור נקבע", source: "מבצע טלמרקטינג", conversationSummary: [ { text: "שוחחנו על המצב, תיאום שיחה נוספת.", timestamp: new Date(new Date().setDate(new Date().getDate() - 5)) }, ], expanded: false, appointmentDateTime: new Date(new Date().setDate(new Date().getDate() + 7)).toISOString(), },
    { id: 'lead-3', createdAt: new Date(new Date().setDate(new Date().getDate() - 2)), fullName: "בני גנץ", phoneNumber: "0509876543", message: "לא היה מענה", status: "חדש", source: "אתר אינטרנט", conversationSummary: [], expanded: false, appointmentDateTime: null, },
    { id: 'lead-4', createdAt: new Date(new Date().setDate(new Date().getDate() - 1)), fullName: "דנה לוי", phoneNumber: "0541122334", message: "קבעה פגישה לשבוע הבא", status: "תור נקבע", source: "המלצה", conversationSummary: [ { text: "שיחה ראשונית, עניין רב.", timestamp: new Date(new Date().setDate(new Date().getDate() - 1)) }, { text: "נקבעה פגישת ייעוץ ל-15/4.", timestamp: new Date(new Date().setDate(new Date().getDate() - 1)) }, ], expanded: false, appointmentDateTime: new Date(2025, 3, 15, 10, 30).toISOString(), }, */
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
  const [leadSortDirection, setLeadSortDirection] = useState('desc');
  const allLeadCategories = useMemo(() => Object.keys(leadStatusConfig).filter(k => k !== 'Default'), []);
  const [selectedLeadCategories, setSelectedLeadCategories] = useState(() => getLayoutPref('dashboard_selectedLeadCategories', allLeadCategories));

  // Persist selectedLeadCategories to localStorage whenever it changes
  useEffect(() => {
    saveLayoutPref('dashboard_selectedLeadCategories', selectedLeadCategories);
  }, [selectedLeadCategories]);

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState("month");
  const [analyticsFilterFrom, setAnalyticsFilterFrom] = useState("");
  const [analyticsFilterTo, setAnalyticsFilterTo] = useState("");



  const [activeId, setActiveId] = useState(null);
  const [prefillCategory, setPrefillCategory] = useState(null);


  
  const [assignableUsers, setAssignableUsers] = useState([]);
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "users"));
        const users = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            email: data.email || "",
            alias: data.alias || data.email || "",
            role: data.role || "staff",
          };
        });
  
        setAssignableUsers(users);
      } catch (error) {
        console.error("שגיאה בטעינת משתמשים:", error);
      }
    };
  
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);
  
  /** Task Listener */
  useEffect(() => {
    if (!currentUser) return;
    console.log("Current user:", { uid: currentUser.uid, email: currentUser.email, alias });

    const tasksRef = collection(db, "tasks");
    const q = query(
      tasksRef,
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      console.log("Raw tasks from Firebase:", snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      
      const tasksData = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        // --- FIX: Always parse dueDate as Date object ---
        let dueDate = null;
        if (data.dueDate) {
          if (typeof data.dueDate.toDate === 'function') {
            dueDate = data.dueDate.toDate();
          } else if (typeof data.dueDate === 'string') {
            dueDate = new Date(data.dueDate);
          } else if (data.dueDate instanceof Date) {
            dueDate = data.dueDate;
          }
        }

        return {
          id: doc.id,
          ...data,
          dueDate,
          uniqueId: `task-${doc.id}-${Date.now()}`
        };
      }));

      const filteredTasks = tasksData.filter(task => {
        const isCreator = task.userId === currentUser.uid || task.creatorId === currentUser.uid;
        const isAssignee = 
          task.assignTo === currentUser.uid ||
          task.assignTo === currentUser.email ||
          task.assignTo === currentUser.alias ||
          task.assignTo === alias;
        
        console.log("Task visibility check:", {
          taskId: task.id,
          assignTo: task.assignTo,
          currentUser: currentUser.uid,
          currentEmail: currentUser.email,
          currentAlias: currentUser.alias,
          alias,
          isCreator,
          isAssignee
        });

        return isCreator || isAssignee;
      });

      console.log("Filtered tasks:", filteredTasks);
      setTasks(filteredTasks);
    }, (error) => {
      console.error("Error fetching tasks:", error);
    });

    return () => unsubscribe();
  }, [currentUser, alias]);

  /** Residents Listener for Task Status Sync */
  useEffect(() => {
    if (!currentUser) return;

    // Get all unique resident IDs from tasks
    const residentIds = [...new Set(tasks.filter(task => task.residentId).map(task => task.residentId))];
    
    if (residentIds.length === 0) return;

    console.log("Setting up residents listener for task sync:", residentIds);

    const residentsRef = collection(db, "residents");
    const q = query(residentsRef, where("__name__", "in", residentIds));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const residentsData = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        residentsData[doc.id] = data.סטטוס || null;
      });

      // Update tasks with latest resident status
      setTasks(prevTasks => 
        prevTasks.map(task => {
          if (task.residentId && residentsData[task.residentId] !== undefined) {
            return {
              ...task,
              residentStatus: residentsData[task.residentId]
            };
          }
          return task;
        })
      );
    }, (error) => {
      console.error("Error fetching residents for task sync:", error);
    });

    return () => unsubscribe();
  }, [currentUser, tasks.length]); // Re-run when tasks change
  /** listens to pull but not needed here
  const tasksRef = collection(db, "tasks");
const q = query(
  tasksRef,
  or(
    where("userId", "==", currentUser.uid),
    where("assignTo", "==", alias)
  )
);
*/

// Real-time leads listener
useEffect(() => {
  if (!currentUser) return; // ⛔ Prevent running if not logged in

  const unsubscribe = onSnapshot(collection(db, "leads"), (snapshot) => {
    const fetchedLeads = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        fullName: data.fullName || "",
        phoneNumber: data.phoneNumber || "",
        message: data.message || "",
        status: data.status || "חדש",
        source: data.source || "",
        conversationSummary: data.conversationSummary?.map(entry => ({
          text: entry.text || "",
          timestamp: entry.timestamp?.toDate?.() || new Date()
        })) || [],
        appointmentDateTime: data.appointmentDateTime?.toDate?.() || null,
        expanded: false,
        followUpCall: data.followUpCall || { active: false, count: 0 },
      };
    });

    setLeads(prevLeads => {
      const expandedLead = prevLeads.find(l => l.expanded);
      const expandedId = expandedLead ? expandedLead.id : null;
      if (justClosedLeadIdRef.current && expandedId === justClosedLeadIdRef.current) {
        setJustClosedLeadId(null);
        justClosedLeadIdRef.current = null;
        return fetchedLeads.map(lead => ({ ...lead, expanded: false }));
      }
      return fetchedLeads.map(lead =>
        expandedId && lead.id === expandedId
          ? { ...lead, expanded: true }
          : { ...lead, expanded: false }
      );
    });
  });

  return () => unsubscribe(); // ✅ Clean up
}, [currentUser]); // ✅ Re-run when currentUser changes


    // 🔁 Redirect if not logged in


// ✅ First: real-time listener for leads
useEffect(() => {
  if (!currentUser) return; // 👈 prevent listener without auth

  const unsubscribe = onSnapshot(collection(db, "leads"), (snapshot) => {
    const fetchedLeads = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        createdAt: data.createdAt?.toDate?.() || new Date(),
        fullName: data.fullName || "",
        phoneNumber: data.phoneNumber || "",
        message: data.message || "",
        status: data.status || "חדש",
        source: data.source || "",
        conversationSummary: data.conversationSummary?.map((entry) => ({
          text: entry.text || "",
          timestamp: entry.timestamp?.toDate?.() || new Date(),
        })) || [],
        appointmentDateTime: data.appointmentDateTime?.toDate?.() || null,
        expanded: false,
        followUpCall: data.followUpCall || { active: false, count: 0 },
      };
    });

    setLeads(prevLeads => {
      const expandedLead = prevLeads.find(l => l.expanded);
      const expandedId = expandedLead ? expandedLead.id : null;
      if (justClosedLeadIdRef.current && expandedId === justClosedLeadIdRef.current) {
        setJustClosedLeadId(null);
        justClosedLeadIdRef.current = null;
        return fetchedLeads.map(lead => ({ ...lead, expanded: false }));
      }
      return fetchedLeads.map(lead =>
        expandedId && lead.id === expandedId
          ? { ...lead, expanded: true }
          : { ...lead, expanded: false }
      );
    });
  });

  return () => unsubscribe(); // ✅ cleanup on logout
}, [currentUser]);


/**  ✅ Second: redirect if not logged in
useEffect(() => {
  if (!loading && !currentUser) {
    router.push("/login");
  }
}, [currentUser, loading, router]);
*/



  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, })
  );









  useEffect(() => {
    setMounted(true);
    const savedOrder = localStorage.getItem("dashboard_blockOrder");
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        if (parsedOrder.TM && parsedOrder.Calendar && parsedOrder.Map && parsedOrder.Leads && parsedOrder.EventLog) {
          setBlockOrder(parsedOrder);
        } else {
          localStorage.removeItem("dashboard_blockOrder");
          setBlockOrder(defaultBlockOrder);
          saveLayoutPref('dashboard_blockOrder', defaultBlockOrder);
        }
      } catch (error) {
        localStorage.removeItem("dashboard_blockOrder");
        setBlockOrder(defaultBlockOrder);
        saveLayoutPref('dashboard_blockOrder', defaultBlockOrder);
      }
    } else {
      setBlockOrder(defaultBlockOrder);
      saveLayoutPref('dashboard_blockOrder', defaultBlockOrder);
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
      const newPosition = currentPosition === 5 ? 1 : currentPosition + 1;
      const keyToSwap = Object.keys(prevOrder).find(k => prevOrder[k] === newPosition);
      const newOrder = { ...prevOrder, [key]: newPosition };
      if (keyToSwap && keyToSwap !== key) {
          newOrder[keyToSwap] = currentPosition;
      }
      saveLayoutPref('dashboard_blockOrder', newOrder);
      return newOrder;
    });
  }, []);










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


  }, 


 );

    
  




  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, [setActiveId]);

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
        alert("שגיאה בעדכון קטגוריית המשימה");
      }
    } else {
      console.log("No category change needed:", {
        currentCategory: task.category,
        targetCategory
      });
    }
  }, [tasks]);


  
  if (!mounted) {
    return ( <div className="flex items-center justify-center min-h-screen">טוען...</div> );
  }



    
  return (

    <TooltipProvider>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        
      <header dir="rtl" className="border-b bg-white shadow-sm sticky top-0 z-20 w-full overflow-hidden">
        {/* Mobile Layout */}
        <div className="block sm:hidden w-full">
          {/* Top row: Logo, Info, Notifications */}
          <div className="flex items-center justify-between p-1 w-full">
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Logo"
                width={128}
                height={51}
                className="h-10 w-auto"
              />
              {alias && <div className="text-xs text-gray-700">{`שלום, ${alias}`}</div>}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
                <div className="text-right">
                    <div>{currentDateTime || 'טוען תאריך...'}</div>
                    <div className="text-gray-500">{'Version 8.5'}</div>
                    {department && <div className="text-xs text-blue-600">{`מחלקה: ${department}`}</div>}
                </div>
                <NotificationBell />
                {(currentUser?.role === 'admin' || role === 'admin') && (
                  <div className="flex items-center gap-0.5">
                    <span className="text-[10px] text-gray-500">חי</span>
                    <IOSSwitch
                      size="small"
                      checked={!isDrillMode}
                      onChange={(e) => {
                        const toLive = e.target.checked;
                        setIsDrillMode(!toLive);
                        updateEmergencyMode(toLive ? "live" : "exercise");
                      }}
                      sx={{ transform: 'scale(0.7)' }}
                    />
                    <span className="text-[10px] text-gray-500">תרגיל</span>
                  </div>
                )}
            </div>
          </div>
          {/* Action buttons row */}
          <div className="flex items-center justify-between p-2 gap-2">
            <div className="flex gap-1">
              <Button onClick={() => setShowEventStatus(true)} size="sm" variant="outline" className="text-xs px-2 py-1">תמונת מצב</Button>
              {(currentUser?.role === 'admin' || role === 'admin') && (
                <>
                  <Button 
                    size="sm" 
                    onClick={() => setShowGreenEyesDialog(true)}
                    className={`text-xs font-medium px-2 py-1 ${isDrillMode ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'} text-white`}
                  >
                    {isDrillMode ? 'תרגיל 🟡' : 'ירוק בעיניים'}
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => setShowEndEmergencyDialog(true)}
                    className="text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-2 py-1"
                  >
                    סיים אירוע
                  </Button>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-1">
              {(currentUser?.role === 'admin' || role === 'admin') && (
                <button
                  className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
                  onClick={() => setShowAdminPanel(true)}
                  title="פאנל ניהול"
                  aria-label="פאנל ניהול"
                >
                  <Settings className="h-4 w-4 text-gray-600" />
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(currentUser?.role === 'admin' || role === 'admin') && (
                    <DropdownMenuCheckboxItem
                      onSelect={() => !isEmergencyActionsDisabled && setShowGreenEyesDialog(true)}
                      disabled={isEmergencyActionsDisabled}
                    >
                      <span className="text-red-600">{`ירוק בעיניים (${emergencyModeLabel})`}</span>
                    </DropdownMenuCheckboxItem>
                  )}
                  {(currentUser?.role === 'admin' || role === 'admin') && (
                    <DropdownMenuCheckboxItem
                      onSelect={() => !isEmergencyActionsDisabled && setShowEndEmergencyDialog(true)}
                      disabled={isEmergencyActionsDisabled}
                    >
                      <span className="text-green-700">{`סיים אירוע (${emergencyModeLabel})`}</span>
                    </DropdownMenuCheckboxItem>
                  )}
                  {(currentUser?.role === 'admin' || role === 'admin') && <DropdownMenuSeparator />}
                  <DropdownMenuCheckboxItem onSelect={() => {
                    import("firebase/auth").then(({ signOut }) =>
                      signOut(auth).then(() => router.push("/login"))
                    );
                  }}>
                    <span className="text-red-600">התנתק</span>
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
            
            
        </div>

        {/* Desktop Layout */}
        <div className="hidden sm:flex items-center justify-between p-2 sm:p-3 min-h-[72px] max-w-full overflow-x-hidden">
          <div className="min-w-0 max-w-[200px] text-right text-sm text-gray-600 flex-shrink-0">
            <div className="text-right truncate text-xs">{currentDateTime || 'טוען תאריך...'}</div>
            {alias && (
              <div className="text-xs text-gray-700 text-right truncate">
                {`שלום, ${alias}`}
                {department && (
                  <div className="text-xs text-blue-600 mt-0.5 truncate">{`מחלקה: ${department}`}</div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1 mt-1.5">
              <Button onClick={() => setShowEventStatus(true)} size="sm" variant="outline" className="text-xs w-full">
                <span className="truncate">תמונת מצב</span>
              </Button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center relative px-4 min-w-0">
            <div className="absolute right-2 flex gap-2">
              <NotesAndLinks section="links" />
            </div>

            <Image
              src="/logo.png"
              alt="Logo"
              width={180}
              height={72}
              className="h-16 w-auto inline-block object-contain"
            />

            <div className="absolute left-0 flex gap-2">
              <NotesAndLinks section="notes" />
            </div>
          </div>

          <div className="min-w-0 max-w-[220px] text-left text-sm text-gray-500 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs">{'Version 8.5'}</span>
              <NotificationBell />
              {(currentUser?.role === 'admin' || role === 'admin') && (
                <div className="flex items-center gap-0.5">
                  <span className="text-[10px] text-gray-500">חי</span>
                  <IOSSwitch
                    size="small"
                    checked={!isDrillMode}
                    onChange={(e) => {
                      const toLive = e.target.checked;
                      setIsDrillMode(!toLive);
                      updateEmergencyMode(toLive ? "live" : "exercise");
                    }}
                    sx={{ transform: 'scale(0.7)' }}
                  />
                  <span className="text-[10px] text-gray-500">תרגיל</span>
                </div>
              )}
              {(currentUser?.role === 'admin' || role === 'admin') && (
                <button
                  className="rounded-full p-1 hover:bg-gray-100 transition-colors"
                  onClick={() => setShowAdminPanel(true)}
                  title="פאנל ניהול"
                  aria-label="פאנל ניהול"
                >
                  <Settings className="h-4 w-4 text-gray-600" />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {(currentUser?.role === 'admin' || role === 'admin') && (
                <>
                  <Button 
                    size="sm" 
                    onClick={() => setShowGreenEyesDialog(true)}
                    className={`text-xs font-medium border ${isDrillMode ? 'bg-yellow-500 hover:bg-yellow-600 border-yellow-500' : 'bg-red-600 hover:bg-red-700 border-red-600'} text-white`}
                  >
                    {isDrillMode ? 'תרגיל ירוק בעיניים 🟡' : 'הפעלת ירוק בעיניים'}
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => setShowEndEmergencyDialog(true)}
                    variant="success"
                    disabled={isEmergencyActionsDisabled}
                    className="text-xs w-full"
                  >
                    <span className="truncate">{`סיים אירוע (${emergencyModeLabel})`}</span>
                  </Button>
                </>
              )}
              <button
                className="text-xs text-red-600 underline truncate text-center"
                onClick={() => {
                  import("firebase/auth").then(({ signOut }) =>
                    signOut(auth).then(() => router.push("/login"))
                  );
                }}
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>


        
<div dir="rtl" className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-4 p-2 sm:p-4 bg-gray-50 min-h-[calc(100vh-120px)] sm:min-h-[calc(100vh-90px)] overflow-x-hidden max-w-full">
          {/* Task Manager Block */}
        <div style={{ order: blockOrder.TM }} className={`col-span-1 ${isTMFullView ? 'lg:col-span-12' : 'lg:col-span-4'} transition-all duration-300 ease-in-out`}>
          <TaskManager2 
            currentUser={currentUser}
            alias={alias}
            users={users}
            department={department}
            role={role}
            isTMFullView={isTMFullView}
            setIsTMFullView={setIsTMFullView}
            blockOrder={blockOrder}
            toggleBlockOrder={toggleBlockOrder}
            taskCategories={taskCategories}
            taskPriorities={taskPriorities}
            assignableUsers={assignableUsers}
          />
        </div>

  
  {/* Residents/Leads Block */}
  <div style={{ order: blockOrder.Leads }} className={`col-span-1 ${isLeadsFullView ? 'lg:col-span-8' : 'lg:col-span-4'} transition-all duration-300 ease-in-out min-w-0`}>
    <Card className="h-full flex flex-col max-w-full">
      <CardHeader>
        <div className="flex flex-wrap justify-between items-center gap-2 min-w-0">
          <CardTitle className="min-w-0">ניהול תושבים</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setIsLeadsFullView(v => !v)}>
              <span className="hidden sm:inline">{isLeadsFullView ? 'תצוגה מקוצרת' : 'תצוגה מלאה'}</span>
              <span className="sm:hidden">{isLeadsFullView ? 'מקוצרת' : 'מלאה'}</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="xs" onClick={() => toggleBlockOrder('Leads')}>{'מיקום: '}{blockOrder.Leads}</Button>
              </TooltipTrigger>
              <TooltipContent>{'שנה מיקום בלוק'}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-grow">
        <ResidentsManagement
          residents={residents}
          tasks={tasks}
          statusColorMap={leadStatusConfig}
          statusKey="סטטוס"
          currentUser={currentUser}
          alias={alias}
          users={users}
          viewMode={isLeadsFullView ? 'full' : 'compact'}
          isAdmin={isAdminUser}
        />
      </CardContent>
    </Card>
  </div>
  
  {/* Event Log Block */}
  <div style={{ order: blockOrder.EventLog }} className={`col-span-1 ${isEventLogFullView ? 'lg:col-span-12' : 'lg:col-span-4'} transition-all`}>
    <EventLogBlock
      isFullView={isEventLogFullView}
      setIsFullView={setIsEventLogFullView}
      currentUser={currentUser}
      alias={alias}
      departments={taskCategories}
      isAdmin={role === 'admin'}
      blockOrder={blockOrder.EventLog}
      emergencyEventId={emergencyEventId}
      toggleBlockOrder={() => {
        const newOrder = { ...blockOrder };
        // Cycle TM, Calendar, Leads, EventLog order
        const keys = ['TM', 'Calendar', 'Leads', 'EventLog'];
        const orders = keys.map(k => blockOrder[k] || 0);
        const cycled = orders.map((_, i, arr) => arr[(i + 1) % arr.length]);
        keys.forEach((k, i) => newOrder[k] = cycled[i]);
        setBlockOrder(newOrder);
      }}
    />
  </div>

  {/* Map Block */}
  <div style={{ order: blockOrder.Map }} className={`col-span-1 ${isMapFullView ? 'lg:col-span-12' : 'lg:col-span-4'} transition-all duration-300 ease-in-out min-w-0`}>
    <Card className="h-full flex flex-col max-w-full">
      <CardHeader>
        <div className="flex flex-wrap justify-between items-center gap-2 min-w-0">
          <CardTitle className="min-w-0">{'מפת מיקומי חירום'}</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setIsMapFullView(v => !v)}>
              <span className="hidden sm:inline">{isMapFullView ? 'תצוגה מקוצרת' : 'תצוגה מלאה'}</span>
              <span className="sm:hidden">{isMapFullView ? 'מקוצרת' : 'מלאה'}</span>
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="xs" onClick={() => toggleBlockOrder('Map')}>{'מיקום: '}{blockOrder.Map}</Button>
              </TooltipTrigger>
              <TooltipContent>{'שנה מיקום בלוק'}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-grow h-full">
        <div className="flex-1 min-h-[600px] h-[60vh]">
          <SimpleEmergencyLocator />
        </div>
      </CardContent>
    </Card>
  </div>
</div> 

    
        
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
                               <span>🏢 {assignableUsers.find(u => u.email === activeTaskForOverlay.assignTo)?.alias || activeTaskForOverlay.assignTo}</span>
                               {activeTaskForOverlay.creatorAlias && <span className="font-medium">📝 {activeTaskForOverlay.creatorAlias}</span>}
                               <span>🏷️ {activeTaskForOverlay.category}</span>
                               <span>{activeTaskForOverlay.priority === 'דחוף' ? '🔥' : activeTaskForOverlay.priority === 'נמוך' ? '⬇️' : '➖'} {activeTaskForOverlay.priority}</span>
                           </div>
                       </div>
                   </div>
                </div>
            ) : null}
        </DragOverlay>

      
      
</DndContext>

      {showNewTaskForm && (
        <div className="p-3 border rounded bg-blue-50 shadow-md mb-4">
          <form onSubmit={handleCreateTask} className="space-y-2">
            <div>
              <Label className="text-xs">מחלקה ל:</Label>
              <Select value={newTaskDepartment} onValueChange={setNewTaskDepartment}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="בחר מחלקה" />
                </SelectTrigger>
                <SelectContent>
                  {taskCategories.map((dep) => (
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
                <Label className="text-xs">קטגוריה:</Label>
                <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">תאריך:</Label>
                <Input 
                  type="date" 
                  value={newTaskDueDate} 
                  onChange={(e) => setNewTaskDueDate(e.target.value)} 
                  className="h-8 text-sm" 
                  required 
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">שעה:</Label>
                <Input 
                  type="time" 
                  value={newTaskDueTime} 
                  onChange={(e) => setNewTaskDueTime(e.target.value)} 
                  className="h-8 text-sm" 
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 space-x-reverse pt-1">
              <Button type="submit" size="sm">{'צור משימה'}</Button>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => setShowNewTaskForm(false)}
              >
                {'ביטול'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Panel */}
      <AdminPanel
        open={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        taskCategories={taskCategories}
        onCategoriesChange={setTaskCategories}
        onOpenLogs={() => setShowAdminLogs(true)}
        currentUser={currentUser}
      />
      {showEventStatus && <EventStatus onClose={() => setShowEventStatus(false)} />}
      <Dialog open={showEmergencyConfigDialog} onOpenChange={setShowEmergencyConfigDialog}>
        <DialogContent className="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full" style={{ direction: 'rtl', textAlign: 'right' }}>
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-semibold">הגדרות תרגיל - ירוק בעיניים</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="exercise-green-eyes-url">קישור Google Apps Script לתרגיל</Label>
            <Input
              id="exercise-green-eyes-url"
              dir="ltr"
              value={exerciseGreenEyesUrl}
              onChange={(e) => setExerciseGreenEyesUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
            />
            <p className="text-xs text-gray-600">
              קישור זה ישמש רק במצב תרגיל. במצב חי המערכת משתמשת בקישור הקבוע של הפרודקשן.
            </p>
            <div className="rounded border bg-gray-50 p-2 text-xs text-gray-700">
              <div>{`עודכן לאחרונה על ידי: ${emergencyConfigUpdatedBy || "לא ידוע"}`}</div>
              <div>{`תאריך עדכון: ${formattedEmergencyConfigUpdatedAt}`}</div>
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEmergencyConfigDialog(false)}>
              ביטול
            </Button>
            <Button onClick={saveExerciseGreenEyesUrl} disabled={isSavingEmergencyConfig}>
              שמור קישור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Green Eyes Activation Dialog */}
      <Dialog open={showGreenEyesDialog} onOpenChange={setShowGreenEyesDialog}>
        <DialogContent className="bg-white rounded-xl shadow-xl p-8 max-w-xs w-full text-center" style={{ direction: 'rtl', textAlign: 'center' }}>
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg font-semibold mb-4">
              {isDrillMode ? 'הפעלת תרגיל ירוק בעיניים' : 'הפעלת נוהל ירוק בעיניים'}
            </DialogTitle>
          </DialogHeader>
          {isDrillMode && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4 text-sm text-yellow-800">
              ⚠️ מצב תרגיל — תישלח הודעת תרגיל בלבד
            </div>
          )}
          <div className="text-lg font-semibold mb-6">
            {isDrillMode
              ? 'האם אתה בטוח שאתה רוצה להפעיל תרגיל?'
              : 'האם אתה בטוח שאתה רוצה להפעיל נוהל ירוק בעיניים?'}
          </div>
          <div className="flex justify-between gap-4">
            <Button 
              variant="outline" 
              onClick={() => setShowGreenEyesDialog(false)}
              className="flex-1 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 font-bold"
            >
              לא
            </Button>
            <Button 
              onClick={handleGreenEyesActivation}
              className={`flex-1 py-2 rounded-lg text-white font-bold ${isDrillMode ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {isDrillMode ? 'הפעל תרגיל' : 'כן'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Emergency Event End Confirmation Dialog */}
      <Dialog open={showEndEmergencyDialog} onOpenChange={setShowEndEmergencyDialog}>
        <DialogContent className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" style={{ direction: 'rtl', textAlign: 'right' }}>
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold mb-4 text-right text-red-600">
              סיום אירוע חירום
            </DialogTitle>
          </DialogHeader>
          <div className="mb-6">
            <p className="text-sm text-gray-700 mb-4">
              האם אתה בטוח שאתה רוצה לסיים את אירוע החירום?
            </p>
            <p className="text-xs text-gray-600 mb-4">
              <strong>מזהה אירוע:</strong> {emergencyEventId}
            </p>
            <p className="text-xs text-gray-600 mb-4">
              <strong>שם אירוע:</strong> יומן אירועים - חמ"ל ({emergencyEventId})
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <strong>שים לב:</strong> פעולה זו תייצא את כל הנתונים לקובץ CSV ותנקה את המערכת לאירוע הבא:
              </p>
              <ul className="text-xs text-yellow-700 mt-2 space-y-1 list-disc list-inside">
                <li>יומן אירועים</li>
                <li>משימות שהוקצו והושלמו</li>
                <li>שינויים בסטטוס תושבים</li>
                <li>דיווחים ותגובות</li>
                <li>כל הפעילות עם חותמות זמן</li>
                <li><strong>ניקוי כל סטטוסי התושבים</strong></li>
                <li><strong>מחיקת כל התושבים מהמערכת</strong></li>
                <li><strong>מחיקת כל יומן האירועים</strong></li>
                <li><strong>מחיקת כל המשימות והלידים</strong></li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowEndEmergencyDialog(false)}
            >
              ביטול
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleEndEmergencyEvent}
              className="bg-red-600 hover:bg-red-700"
            >
              סיים אירוע וייצא נתונים
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    <AdminLogsPanel open={showAdminLogs} onClose={() => setShowAdminLogs(false)} />
    </TooltipProvider>
  );


const renderNewTaskForm = () => {
  if (!showNewTaskForm) return null;
  
  return (
    <div className="p-3 border rounded bg-blue-50 shadow-md mb-4">
      <form onSubmit={handleCreateTask} className="space-y-2">
        <div>
          <Label className="text-xs">מחלקה ל:</Label>
          <select 
            value={newTaskDepartment} 
            onChange={(e) => setNewTaskDepartment(e.target.value)} 
            className="h-8 text-sm w-full border rounded"
          >
            <option value="">בחר מחלקה</option>
            {taskCategories.map((dep) => (
              <option key={dep} value={dep}>
                {dep}
              </option>
            ))}
          </select>
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
            <Label className="text-xs">קטגוריה:</Label>
            <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {taskCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">תאריך:</Label>
            <Input 
              type="date" 
              value={newTaskDueDate} 
              onChange={(e) => setNewTaskDueDate(e.target.value)} 
              className="h-8 text-sm" 
              required 
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs">שעה:</Label>
            <Input 
              type="time" 
              value={newTaskDueTime} 
              onChange={(e) => setNewTaskDueTime(e.target.value)} 
              className="h-8 text-sm" 
            />
          </div>
        </div>
        <div className="flex justify-end space-x-2 space-x-reverse pt-1">
          <Button type="submit" size="sm">{'צור משימה'}</Button>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={() => setShowNewTaskForm(false)}
          >
            {'ביטול'}
          </Button>
        </div>
      </form>
    </div>
  );
};
}




