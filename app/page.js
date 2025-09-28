// Version 7.0 - Collapse/expand Kanban
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
// ואז ברנדר:
// <FullCalendarDemo />
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
import { Search, RotateCcw, Bell, ChevronDown, Pencil, MessageCircle, Check, X, ChevronLeft, UserPlus } from 'lucide-react';
import NotesAndLinks from "@/components/NotesAndLinks";
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


// Updated lead statuses and colors (order matters)
const leadStatusConfig = { "אנחנו זקוקים לסיוע": { color: "bg-red-500", priority: 1 }, "אין מידע על כל בני הבית": { color: "bg-orange-500", priority: 2 }, "לא כולם בבית, כולם בסדר": { color: "bg-orange-200", priority: 3 }, "כולם בבית וכולם בסדר": { color: "bg-green-500", priority: 4 }, "אין מידע על כל בני הבית": { color: "bg-yellow-500", priority: 5 }, };
const leadColorTab = (status) => leadStatusConfig[status]?.color || leadStatusConfig.Default.color;
const leadPriorityValue = (status) => leadStatusConfig[status]?.priority || leadStatusConfig.Default.priority;


// Add after user state declarations:





const taskPriorities = ["דחוף", "רגיל", "נמוך"];








export default function Dashboard() {
  const defaultTaskCategories = ["לוגיסטיקה ", "אוכלוסיה", "רפואה", "חוסן", "חמ״ל ", "אחר"];
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
// Fetch and listen for user's Kanban category order from Firestore
useEffect(() => {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  const unsubscribe = onSnapshot(userRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.kanbanCategoryOrder) && data.kanbanCategoryOrder.length > 0) {
        setTaskCategories(data.kanbanCategoryOrder);
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
          const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxb8tOKGjnmJpu3Cbvgy_1kqvZ0tnL0okkRzcTioEjUkN_Ak9lRZJrO9mkMPnkODPm/exec"; // Your actual Google Apps Script URL
          
          console.log("🔄 Calling Google Apps Script webhook:", GOOGLE_APPS_SCRIPT_URL);
          
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

  // Green Eyes Activation Function
  const handleGreenEyesActivation = async () => {
    try {
      console.log("🚨 Activating Green Eyes emergency procedure...");
      
      // Create emergency event log entry
      await addDoc(collection(db, "eventLogs"), {
        reporter: alias || currentUser?.email || "System",
        recipient: "חמ\"ל",
        description: "הפעלת נוהל ירוק בעיניים - אירוע חירום",
        department: "חמ\"ל",
        status: "מחכה",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastUpdater: alias || currentUser?.email || "System",
        history: [{
          timestamp: new Date().toISOString(),
          text: "נוהל ירוק בעיניים הופעל",
          userAlias: alias || currentUser?.email || "System"
        }],
        emergencyType: "green_eyes",
        emergencyEventId: emergencyEventId
      });

      // Call Google Apps Script to trigger ירוק בעיניים
      const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxb8tOKGjnmJpu3Cbvgy_1kqvZ0tnL0okkRzcTioEjUkN_Ak9lRZJrO9mkMPnkODPm/exec";
      
      console.log("🔄 Calling Google Apps Script for ירוק בעיניים:", GOOGLE_APPS_SCRIPT_URL);
      
      try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'triggerGreenInEyes=1',
          mode: 'no-cors'
        });
        
        console.log("📥 ירוק בעיניים response status:", response.status);
      } catch (scriptError) {
        console.error("❌ Error calling Google Apps Script:", scriptError);
        toast({
          title: "שגיאה בקריאה לסקריפט",
          description: "לא ניתן להפעיל את נוהל ירוק בעיניים",
          variant: "destructive"
        });
      }

      // Send notification to all users (optional)
      toast({
        title: "נוהל ירוק בעיניים הופעל",
        description: "אירוע חירום נרשם במערכת",
      });

      // Close dialog
      setShowGreenEyesDialog(false);

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
//Add user button 
const [showAddUserModal, setShowAddUserModal] = useState(false);

// User creation form state
const [newUserFullName, setNewUserFullName] = useState("");
const [newUserEmail, setNewUserEmail] = useState("");
const [newUserPassword, setNewUserPassword] = useState("");
const [newUserDepartment, setNewUserDepartment] = useState("");
const [newUserRole, setNewUserRole] = useState("staff");
const [isCreatingUser, setIsCreatingUser] = useState(false);

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

  // Fetch user's alias and ensure department assignment
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
          
          // Check if user has department assigned
          if (data.department && taskCategories.includes(data.department)) {
            setDepartment(data.department);
          } else {
            // If no department or invalid department, assign default
            console.warn(`User ${currentUser.email} has no department or invalid department: ${data.department}`);
            setDepartment("אחר"); // Default department
          }
        } else {
          // Create new user with default department
          console.log("Creating new user with default department");
          await setDoc(userRef, {
            email: currentUser.email,
            alias: currentUser.email,
            role: "staff",
            department: "אחר", // Default department
            createdAt: serverTimestamp()
          });
          setAlias(currentUser.email);
          setRole("staff");
          setDepartment("אחר");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        // Set default values on error
        setAlias(currentUser.email);
        setRole("staff");
        setDepartment("אחר");
      }
    };

    fetchUserData();
  }, [currentUser, taskCategories]);

  
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

      const visibleTasks = allTasks.filter(task => {
        const isCreator = task.userId === currentUser.uid || 
                         task.creatorId === currentUser.uid;
        // Users see tasks assigned to their department
        const isDepartmentTask = task.department && department && task.department === department;
        // Also check if task is assigned to user's department via assignTo field (backward compatibility)
        const isAssignedToUserDept = task.assignTo && department && task.assignTo === department;
        return isCreator || isDepartmentTask || isAssignedToUserDept;
      });

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
        department: department || "אחר", // Ensure department is set
        createdAt: new Date()
      });
    } else {
      await updateDoc(ref, {
        alias: alias,
        department: department || "אחר" // Update department if needed
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

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword || !newUserFullName || !newUserDepartment) {
      toast({
        title: "שגיאה",
        description: "יש למלא את כל השדות הנדרשים",
        variant: "destructive",
      });
      return;
    }
    setIsCreatingUser(true);
    try {
      // Store current admin credentials
      const adminEmail = currentUser.email;
      let adminPassword = window.sessionStorage.getItem('adminPassword');
      if (!adminPassword) {
        adminPassword = prompt('הזן את סיסמת הניהול שלך כדי להמשיך ביצירת משתמש חדש:');
        if (!adminPassword) throw new Error('Admin password required');
        window.sessionStorage.setItem('adminPassword', adminPassword);
      }
      const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import("firebase/auth");
      // Create user (this will sign in as the new user)
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        newUserEmail,
        newUserPassword
      );
      const newUser = userCredential.user;
      await setDoc(doc(db, "users", newUser.uid), {
        email: newUserEmail,
        alias: newUserFullName,
        fullName: newUserFullName,
        department: newUserDepartment,
        role: newUserRole,
        createdAt: serverTimestamp(),
        createdBy: currentUser.uid,
      });

      // Auto-sync user to emergency locator
      try {
        const { autoSyncUserToEmergencyLocator } = await import("../lib/auto-sync-emergency-locator");
        await autoSyncUserToEmergencyLocator(newUser.uid, {
          email: newUserEmail,
          name: newUserFullName,
          role: newUserRole,
          alias: newUserFullName
        });
        console.log(`✅ Auto-synced new user to emergency locator: ${newUserEmail}`);
      } catch (error) {
        console.error(`❌ Failed to auto-sync user to emergency locator: ${newUserEmail}`, error);
        // Don't fail the user creation if emergency locator sync fails
      }
      toast({
        title: "משתמש נוצר בהצלחה",
        description: `המשתמש ${newUserFullName} נוצר בהצלחה במחלקת ${newUserDepartment}`,
      });
      // Immediately sign back in as the admin
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      // Reset form
      setNewUserFullName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserDepartment("");
      setNewUserRole("staff");
      setShowAddUserModal(false);
      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error("Error creating user:", error);
      let errorMessage = "שגיאה ביצירת המשתמש";
      if (error.code === "auth/email-already-in-use") {
        errorMessage = "כתובת המייל כבר קיימת במערכת";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "הסיסמה חייבת להכיל לפחות 6 תווים";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "כתובת המייל אינה תקינה";
      } else if (error.message === 'Admin password required') {
        errorMessage = "יש להזין סיסמת ניהול כדי להמשיך";
      }
      toast({
        title: "שגיאה ביצירת משתמש",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCreatingUser(false);
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
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [newLeadFullName, setNewLeadFullName] = useState("");
  const [newLeadPhone, setNewLeadPhone] = useState("");
  const [newLeadMessage, setNewLeadMessage] = useState("");
  const [newLeadStatus, setNewLeadStatus] = useState("חדש");
  const [newLeadSource, setNewLeadSource] = useState("");


  const [taskFilter, setTaskFilter] = useState("הכל");
  const [taskPriorityFilter, setTaskPriorityFilter] = useState("all");
  const [selectedTaskCategories, setSelectedTaskCategories] = useState([]);
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const [isTMFullView, setIsTMFullView] = useState(() => getLayoutPref('dashboard_isTMFullView', false));
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [userHasSortedTasks, setUserHasSortedTasks] = useState(false);
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
        status: "פתוח",
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
    let assignTo = currentUser?.alias || currentUser?.email || "עצמי";

    // Check for user assignment
    const userMatch = text.match(/\{([^}]+)\}/);
    if (userMatch) {
        const alias = userMatch[1];
        const user = assignableUsers.find(u => 
            u.alias?.toLowerCase() === alias.toLowerCase() || 
            u.email?.toLowerCase() === alias.toLowerCase()
        );
        if (user) {
            assignTo = user.alias || user.email;
        }
    }

    // Handle dates
    if (text.includes("מחר בבוקר")) {
        dueDate.setDate(dueDate.getDate() + 1);
        dueTime = "09:00";
    } else if (text.includes("מחר בערב")) {
        dueDate.setDate(dueDate.getDate() + 1);
        dueTime = "18:00";
    } else if (text.includes("מחר")) {
        dueDate.setDate(dueDate.getDate() + 1);
    } else if (text.includes("מחרתיים")) {
        dueDate.setDate(dueDate.getDate() + 2);
    }

    // Handle times
    const timeMatch = text.match(/(?:בשעה|ב)\s*(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        dueTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    } else {
        const singleHourMatch = text.match(/(?:בשעה|ב)\s*(\d{1,2})(?!\d|:)/);
        if (singleHourMatch) {
            dueTime = `${singleHourMatch[1].padStart(2, '0')}:00`;
        }
    }

    // Handle morning/afternoon/evening
    if (text.includes("בבוקר")) {
        dueTime = "09:00";
    } else if (text.includes("בצהריים")) {
        dueTime = "13:00";
    } else if (text.includes("בערב")) {
        dueTime = "18:00";
    }

    const [hours, minutes] = dueTime.split(":").map(Number);
    dueDate.setHours(hours, minutes, 0, 0);

    // Clean up title
    let title = text
        .replace(/\{([^}]+)\}/g, '') // Remove user assignments
        .replace(/מחרתיים|מחר/g, '')
        .replace(/(?:בשעה|ב)\s*(\d{1,2}):?(\d{2})?/g, '')
        .replace(/(\d{1,2})[./](\d{1,2})(?:[./](\d{4}|\d{2}))?/g,'')
        .replace(/בבוקר|בצהריים|בערב/g, '')
        .replace(new RegExp(`\\b(${taskCategories.join('|')})\\b`, 'gi'), (match, p1, offset, string) => string.trim() === match ? match : '')
        .trim();

    if (!title) {
        title = text;
    }

    // Try to determine category from title if not found
    if (category === "אחר") {
        const categoryMatch = taskCategories.find(cat => 
            title.toLowerCase().includes(cat.toLowerCase())
        );
        if (categoryMatch) {
            category = categoryMatch;
        }
    }

    return {
        assignTo,
        title: title,
        subtitle: "",
        priority: "רגיל",
        category,
        dueDate,
        done: false,
        completedBy: null,
        completedAt: null
    };
}, [taskCategories, assignableUsers, currentUser]);

  /** ✅ NLP Task Submit (with Firestore save and user assignment) */
const handleNLPSubmit = useCallback(async (e) => {
    e.preventDefault();
  console.log("🔄 Starting NLP task creation...");
  if (!nlpInput.trim() || !currentUser) {
    console.error("❌ No input or current user found");
    return;
  }

    const parsed = parseTaskFromText(nlpInput);
    const finalCategory = prefillCategory || parsed.category;
  console.log("📝 Parsed task data:", parsed);

  try {
    const taskRef = doc(collection(db, "tasks"));
    const newTask = {
      id: taskRef.id,
        userId: currentUser.uid,
        creatorId: currentUser.uid,
        creatorAlias: alias || currentUser.email || "",
        assignTo: parsed.assignTo,
        title: parsed.title || "משימה ללא שם",
        subtitle: "",  // Optional: add lead name later
        category: finalCategory,
        priority: parsed.priority,
      status: "פתוח",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
        dueDate: parsed.dueDate,
      replies: [],
      isRead: false,
      isArchived: false,
      done: false,
        completedBy: null,
      completedAt: null
    };  

    console.log("💾 Saving NLP task to Firestore...");
    await setDoc(taskRef, newTask);
    console.log("✅ NLP task saved successfully");
    
    setTasks((prev) => [...prev, newTask]);
    console.log("🔄 Local state updated");

    setNlpInput("");
    setShowNLPModal(false);
    setPrefillCategory(null);
    console.log("✨ Form reset and modal closed");
  } catch (error) {
    console.error("❌ Error creating NLP task:", error);
    alert("שגיאה בשמירת המשימה. נסה שוב.");
  }
}, [nlpInput, parseTaskFromText, prefillCategory, currentUser, alias]);

  
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
            completedBy: isNowDone ? (currentUser?.alias || currentUser?.email || 'Unknown') : null,
            completedAt: isNowDone ? new Date() : null,
          };
        }
        return task;
      })
    );
  }, [setTasks, currentUser]);

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
    setEditingDepartment(task.department || '');
    setEditingTitle(task.title);
    setEditingSubtitle(task.subtitle || "");
    setEditingPriority(task.priority);
    setEditingCategory(task.category);

    try {
        if (task.dueDate) {
            const due = new Date(task.dueDate);
            if (!isNaN(due.getTime())) {
                // Format date as YYYY-MM-DD
                const dateStr = due.toLocaleDateString('en-CA'); // en-CA gives YYYY-MM-DD format
                // Format time as HH:mm
                const timeStr = due.toTimeString().slice(0, 5);
                
                setEditingDueDate(dateStr);
                setEditingDueTime(timeStr);
                return;
            }
        }
        // If we get here, either no date or invalid date - use current date/time
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA');
        const timeStr = now.toTimeString().slice(0, 5);
        
        setEditingDueDate(dateStr);
        setEditingDueTime(timeStr);
    } catch (error) {
        console.error("Error processing task due date for editing:", task.dueDate, error);
        // On error, still use current date/time
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-CA');
        const timeStr = now.toTimeString().slice(0, 5);
        
        setEditingDueDate(dateStr);
        setEditingDueTime(timeStr);
    }
}, [setEditingTaskId, setEditingDepartment, setEditingTitle, setEditingSubtitle, setEditingPriority, setEditingCategory, setEditingDueDate, setEditingDueTime]);

  /**
  * Saves the edited task details back to the main tasks state.
  * Combines date and time inputs into a Date object.
  * @param {React.FormEvent} e - The form submission event.
  */
  const handleSaveTask = useCallback(async (e) => {
    e.preventDefault();
    if (!editingTaskId) return;

    let dueDateTime = null;
    try {
        if (editingDueDate && editingDueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const timeString = editingDueTime || "00:00";
            const dateTimeStr = `${editingDueDate}T${timeString}:00`;
            const newDate = new Date(dateTimeStr);
            
            if (!isNaN(newDate.getTime())) {
                dueDateTime = newDate;
            } else {
                console.error("Invalid date/time combination:", dateTimeStr);
            }
        }
    } catch (error) {
        console.error("Error creating due date from inputs:", editingDueDate, editingDueTime, error);
    }

    // Update Firestore
    try {
      const taskRef = doc(db, "tasks", editingTaskId);
      await updateDoc(taskRef, {
        department: editingDepartment,
        title: editingTitle,
        subtitle: editingSubtitle,
        priority: editingPriority,
        category: editingCategory,
        dueDate: dueDateTime ? dueDateTime.toISOString() : null,
        done: false, // Always reset to not done on edit, or use the previous value if you want to preserve
        completedBy: null,
        completedAt: null,
        updatedAt: serverTimestamp(),
        // Add any other fields you want to always persist
      });
    } catch (error) {
      console.error("Error updating task in Firestore:", error);
      alert("שגיאה בעדכון המשימה בשרת");
    }

    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === editingTaskId
          ? {
              ...task,
              creatorId: currentUser?.uid || task.creatorId,
              department: editingDepartment,
              title: editingTitle,
              subtitle: editingSubtitle,
              priority: editingPriority,
              category: editingCategory,
              dueDate: dueDateTime ? dueDateTime.toISOString() : null,
              done: false,
              completedBy: null,
              completedAt: null,
            }
          : task
      )
    );
    
    setEditingTaskId(null);
    setEditingDepartment("");
    setEditingTitle("");
    setEditingSubtitle("");
    setEditingPriority("רגיל");
    setEditingCategory(taskCategories[0] || "");
    setEditingDueDate("");
    setEditingDueTime("");
  }, [editingTaskId, editingDepartment, editingTitle, editingSubtitle, editingPriority, editingCategory, editingDueDate, editingDueTime, setTasks, setEditingTaskId, setEditingDepartment, setEditingTitle, setEditingSubtitle, setEditingPriority, setEditingCategory, setEditingDueDate, setEditingDueTime, currentUser]);

  /**
  * Cancels the task editing process and clears the editing form state.
  */
  const handleCancelEdit = useCallback(() => {
    setEditingTaskId(null);

     setEditingDepartment("");
     setEditingTitle("");
     setEditingSubtitle("");
     setEditingPriority("רגיל");
     setEditingCategory(taskCategories[0] || "");
     setEditingDueDate("");
     setEditingDueTime("");
  }, [setEditingTaskId, setEditingDepartment, setEditingTitle, setEditingSubtitle, setEditingPriority, setEditingCategory, setEditingDueDate, setEditingDueTime]);

  /** --- NEW: Handler for Complete & Reply --- */
  const handleCompleteAndReply = useCallback(async (taskId) => {
    console.log(`Complete & Reply action initiated for task: ${taskId}`);
    if (!currentUser) {
      console.error("Cannot reply: No current user");
      alert("שגיאה: משתמש לא מחובר");
        return;
    }

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        console.error("Task not found");
        alert("שגיאה: המשימה לא נמצאה");
        return;
      }

      const task = taskDoc.data();
    const replyMessage = prompt(`הזן תגובה עבור המשימה "${task.title}":`);

    if (replyMessage === null || !replyMessage.trim()) {
        console.log("Reply cancelled or empty");
        return;
    }

      // Create the new reply with regular Date object
      const now = new Date();
      const newReply = {
        id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: replyMessage,
        timestamp: now.toISOString(), // Use ISO string instead of serverTimestamp
        userId: currentUser.uid,
        userAlias: alias || currentUser.email,
        isRead: false
      };

      // Get existing replies
      const existingReplies = task.replies || [];

      // Update the task in Firebase
      await updateDoc(taskRef, {
        done: true,
        completedAt: serverTimestamp(), // These can still use serverTimestamp
        completedBy: currentUser?.alias || currentUser?.email || 'Unknown',
        replies: [...existingReplies, newReply],
        hasNewReply: true,
        lastReplyAt: serverTimestamp(), // This too
        updatedAt: serverTimestamp() // And this
      });

      console.log('Task completed and reply added successfully');
    } catch (error) {
      console.error('Error in Complete & Reply:', error);
      alert('שגיאה בשמירת התגובה והשלמת המשימה');
    }
  }, [currentUser, alias]);


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

  // Add state for archived tasks
  const [archivedTasks, setArchivedTasks] = useState([]);

  // Fetch archived tasks for history modal
  useEffect(() => {
    if (!currentUser) return;
    const archivedRef = collection(db, "archivedTasks");
    const unsubscribe = onSnapshot(archivedRef, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setArchivedTasks(data);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Update handleClearDoneTasks to archive before delete
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
            const aliasToArchive = task.completedByAlias || task.completedBy || task.creatorAlias || task.creatorEmail || task.assignTo || alias || currentUser?.alias || currentUser?.email || '';
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

  // Restore task from archive (admin only)
  const restoreTask = async (archivedTask) => {
    if (!currentUser || !currentUser.isAdmin) {
      alert('רק אדמין יכול לשחזר משימות');
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
      alert('המשימה שוחזרה בהצלחה');
    } catch (error) {
      console.error('Error restoring task:', error);
      alert('שגיאה בשחזור המשימה');
    }
  };

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
        return leadSortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      } catch(e) { return 0; }
    } else {
      try {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return 0;
        return leadSortDirection === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      } catch(e) { return 0; }
    }
  }, [leadSortBy, leadSortDirection]);

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

  /** Creates a follow-up task from lead edit form and saves to Firestore */
  const handleLeadNLPSubmit = useCallback(async (leadId) => {
    if (!editLeadNLP.trim() || !currentUser) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    let parsedDetails = null;
    let usedApi = false;
    try {
      // Try Anthropic NLP API
      const response = await fetch('/api/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editLeadNLP })
      });
      if (response.ok) {
        const data = await response.json();
        // Compose parsedDetails in the same format as parseTaskFromText
        parsedDetails = {
          title: data.title || '',
          category: data.category || 'אחר',
          dueDate: (data.date && data.time) ? new Date(`${data.date}T${data.time}`) : (data.date ? new Date(`${data.date}T13:00`) : new Date()),
          assignTo: currentUser.email,
          priority: 'רגיל',
          done: false,
          completedBy: null,
          completedAt: null
        };
        usedApi = true;
      }
    } catch (err) {
      // Ignore and fallback
    }
    if (!parsedDetails) {
      // Fallback to local parser
      parsedDetails = parseTaskFromText(editLeadNLP);
    }
    try {
      const taskRef = doc(collection(db, "tasks"));
      const newTask = {
        ...parsedDetails,
        id: taskRef.id,
        userId: currentUser.uid,
        creatorId: currentUser.uid,
        creatorAlias: alias || currentUser.email || "",
        assignTo: currentUser.email,
        title: `מעקב ${lead.fullName}: ${parsedDetails.title || editLeadNLP}`,
        subtitle: editLeadNLP,
        status: "פתוח",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null
      };
      await setDoc(taskRef, newTask);
      setEditLeadNLP("");
    } catch (error) {
      console.error("Error creating follow-up task:", error);
      alert("שגיאה ביצירת משימת המשך");
    }
  }, [editLeadNLP, leads, parseTaskFromText, currentUser, alias]);

  /** Saves the edited lead details back to the main leads state. Creates task if needed. */
  const handleSaveLead = useCallback(async (e, leadId) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      let appointmentDate = null;
      if (editLeadStatus === 'תור נקבע' && editLeadAppointmentDateTime) {
        appointmentDate = new Date(editLeadAppointmentDateTime);
        if (isNaN(appointmentDate.getTime())) {
          alert("תאריך פגישה לא תקין.");
          return;
        }
      }

      const leadRef = doc(db, 'leads', leadId);
      const leadDoc = await getDoc(leadRef);
      if (!leadDoc.exists()) {
        throw new Error('Lead not found');
      }

      const originalLead = leadDoc.data();
      const updateData = {
        fullName: editLeadFullName,
        phoneNumber: editLeadPhone,
        message: editLeadMessage,
        status: editLeadStatus,
        source: editLeadSource,
        appointmentDateTime: editLeadStatus === 'תור נקבע' ? (appointmentDate || null) : null,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      };
      // Reset followUpCall if status changed
      if (originalLead.status !== editLeadStatus) {
        updateData.followUpCall = { active: false, count: 0 };
      }

      await updateDoc(leadRef, updateData);

      // Create appointment task if status changed to 'תור נקבע'
      if (originalLead.status !== 'תור נקבע' && editLeadStatus === 'תור נקבע' && appointmentDate) {
        const taskRef = doc(collection(db, "tasks"));
        const newTask = {
          id: taskRef.id,
          userId: currentUser.uid,
          creatorId: currentUser.uid,
          creatorAlias: alias || currentUser.email || "",
          assignTo: currentUser.email,
          title: `פגישת ייעוץ - ${editLeadFullName}`,
          subtitle: `נקבעה פגישה מדיווח ${leadId}`,
          priority: "רגיל",
          category: "לקבוע סדרה",
          status: "פתוח",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          dueDate: appointmentDate,
          replies: [],
          isRead: false,
          isArchived: false,
          done: false,
          completedBy: null,
          completedAt: null
        };

        await setDoc(taskRef, newTask);
      }

      setEditingLeadId(null);
      setEditLeadAppointmentDateTime("");
    } catch (error) {
      console.error("Error saving lead:", error);
      alert("שגיאה בשמירת הדיווח");
    }
  }, [
    currentUser,
    alias,
    editLeadFullName,
    editLeadPhone,
    editLeadMessage,
    editLeadStatus,
    editLeadSource,
    editLeadAppointmentDateTime
  ]);

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

  /** Adds a new entry to a lead's conversation summary and saves to Firestore */
  const handleAddConversation = useCallback(async (leadId) => {
    if (!newConversationText.trim() || !currentUser) return;
    
    try {
      const leadRef = doc(db, 'leads', leadId);
      const newEntry = {
        text: newConversationText,
        timestamp: new Date(), // Use client time instead of serverTimestamp()
        userId: currentUser.uid,
        userAlias: alias || currentUser.email
      };

      // Update Firestore - add new entry to the start of the array
      await updateDoc(leadRef, {
        conversationSummary: arrayUnion(newEntry),
        updatedAt: serverTimestamp()
      });

      setNewConversationText("");
      setShowConvUpdate(leadId);
    } catch (error) {
      console.error("Error adding conversation entry:", error);
      alert("שגיאה בהוספת עדכון שיחה");
    }
  }, [newConversationText, currentUser, alias]);

  /** Handles submission of the Add New Lead modal form. */
  const handleAddNewLead = useCallback(async (e) => {
    e.preventDefault();

    if (!newLeadFullName.trim() || !newLeadPhone.trim()) {
        alert("אנא מלא שם מלא ומספר טלפון.");
        return;
    }

    try {
        const newLead = {
            fullName: newLeadFullName.trim(),
            phoneNumber: newLeadPhone.trim(),
            message: newLeadMessage.trim(),
            status: newLeadStatus,
            source: newLeadSource.trim(),
            conversationSummary: [],
            expanded: false,
            appointmentDateTime: null,
            createdAt: serverTimestamp(),
        };
        await addDoc(collection(db, "leads"), newLead);
        // No need to update local state, real-time listener will update leads
        setNewLeadFullName("");
        setNewLeadPhone("");
        setNewLeadMessage("");
        setNewLeadStatus("חדש");
        setNewLeadSource("");
        setShowAddLeadModal(false);
    } catch (error) {
        console.error("שגיאה בהוספת דיווח חדש:", error);
        alert("שגיאה בהוספת דיווח חדש. נסה שוב.");
    }
}, [
    newLeadFullName, newLeadPhone, newLeadMessage,
    newLeadStatus, newLeadSource,
    setNewLeadFullName, setNewLeadPhone, setNewLeadMessage, setNewLeadStatus, setNewLeadSource, setShowAddLeadModal
]);





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









const sortedAndFilteredTasks = useMemo(() => {
  const lowerSearchTerm = taskSearchTerm.toLowerCase();

  let filtered = tasks.filter((task) => {
      // Department-based filtering
      const departmentMatch =
        taskFilter === "הכל" ||
        (taskFilter === "שלי" && (task.department === department || task.assignTo === department)) ||
        (taskFilter === "אחרים" && task.department !== department && task.assignTo !== department);

      const doneMatch = showDoneTasks || !task.done;
      const priorityMatch = taskPriorityFilter === 'all' || task.priority === taskPriorityFilter;
      const categoryMatch = selectedTaskCategories.length === 0 || selectedTaskCategories.includes(task.category);
      const searchTermMatch = !lowerSearchTerm ||
                            task.title.toLowerCase().includes(lowerSearchTerm) ||
                            (task.subtitle && task.subtitle.toLowerCase().includes(lowerSearchTerm));

      return departmentMatch && doneMatch && priorityMatch && categoryMatch && searchTermMatch;
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
    taskPriorityFilter, selectedTaskCategories, taskSearchTerm, currentUser, department, role
]);


const events = useMemo(() => {
  const taskEvents = tasks
    .map((task) => {
      let dueDate = null;
      if (task.dueDate) {
        if (typeof task.dueDate.toDate === 'function') {
          dueDate = task.dueDate.toDate();
        } else if (typeof task.dueDate === 'string') {
          dueDate = new Date(task.dueDate);
        } else if (task.dueDate instanceof Date) {
          dueDate = task.dueDate;
        }
      }
      if (!dueDate || isNaN(dueDate.getTime())) return null;
      const start = dueDate;
      const end = new Date(start.getTime() + 15 * 60 * 1000); // 15 minutes duration
      return {
        id: `task-${task.id}`,
        title: task.title,
        start,
        end,
        assignTo: task.assignTo, // <-- Add this line for filtering and coloring
        resource: { type: 'task', data: task },
        isDone: task.done || false
      };
    })
    .filter(Boolean);

  const leadAppointmentEvents = leads
    .filter(lead => lead.status === 'תור נקבע' && lead.appointmentDateTime)
    .map(lead => {
      try {
        const start = new Date(lead.appointmentDateTime);
        if (isNaN(start.getTime())) return null;
        const end = new Date(start.getTime() + 15 * 60 * 1000); // 15 minutes duration
        return {
          id: `lead-${lead.id}`,
          title: `פגישה: ${lead.fullName}`,
          start,
          end,
          assignTo: currentUser?.email || "", // <-- Add this line for filtering
          resource: { type: 'lead', data: lead }
        };
      } catch (error) {
        console.error('Error creating lead event:', error);
        return null;
      }
    })
    .filter(Boolean);

  return [...taskEvents, ...leadAppointmentEvents];
}, [tasks, leads]);


const leadsSorted = useMemo(() => {
    const lowerSearchTerm = leadSearchTerm.toLowerCase();
    // Filter by time, search, and selected categories
    let filtered = leads
      .filter(isLeadInTimeRange)
      .filter(lead => selectedLeadCategories.includes(lead.status))
      .filter(lead => {
        if (!lowerSearchTerm) return true;
        return (
          lead.fullName?.toLowerCase().includes(lowerSearchTerm) ||
          lead.phoneNumber?.includes(lowerSearchTerm) ||
          lead.message?.toLowerCase().includes(lowerSearchTerm) ||
          lead.source?.toLowerCase().includes(lowerSearchTerm) ||
          lead.status?.toLowerCase().includes(lowerSearchTerm)
        );
      });
    // Group by status/category, sort within each group, then flatten
    const grouped = {};
    filtered.forEach(lead => {
      if (!grouped[lead.status]) grouped[lead.status] = [];
      grouped[lead.status].push(lead);
    });
    let result = [];
    allLeadCategories.forEach(cat => {
      if (grouped[cat]) {
        result = result.concat(grouped[cat].sort(compareLeads));
      }
    });
    return result;
}, [leads, leadSearchTerm, isLeadInTimeRange, compareLeads, selectedLeadCategories, allLeadCategories]);


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
    const convertedCount = filteredLeads.filter(l => l.status === 'תור נקבע' || l.status === 'בסדרת טיפול').length;
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
     if (!mounted || loading) {
      return <div className="flex items-center justify-center min-h-screen">בודק הרשאות...</div>;
    }
    
  return (

    <TooltipProvider>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        
      <header dir="rtl" className="flex flex-col sm:flex-row items-center justify-between p-2 sm:p-4 border-b bg-white shadow-sm sticky top-0 z-20 min-h-[90px]">
  <div className="w-full sm:w-48 text-center sm:text-right text-sm text-gray-600 flex flex-col items-center sm:items-start sm:mr-0">
    <div className="w-full text-center sm:text-right">{currentDateTime || 'טוען תאריך...'}</div>
    {alias && (
      <div className="text-xs text-gray-700 w-full text-center sm:text-right">
        {`שלום, ${alias}`}
        {department && (
          <div className="text-xs text-blue-600 mt-1">{`מחלקה: ${department}`}</div>
        )}
      </div>
    )}
    {/* Admin-only: Add User Button */}
    {(currentUser?.role === 'admin' || role === 'admin') && (
      <Button size="sm" className="mt-2 w-full" variant="outline" onClick={() => setShowAddUserModal(true)}>
        הוסף משתמש חדש
      </Button>
    )}
  </div>

  <div className="flex-1 flex items-center justify-center relative px-4">
    <div className="absolute right-2 hidden sm:flex gap-2">
      <NotesAndLinks section="links" />
    </div>

    <Image
      src="/logo.png"
      alt="Logo"
      width={140}
      height={56}
      className="h-10 sm:h-14 inline-block"
    />

    <div className="absolute left-0 hidden sm:flex gap-2">
      <NotesAndLinks section="notes" />
    </div>
  </div>

  <div className="w-full sm:w-48 text-center sm:text-left text-sm text-gray-500 flex flex-col items-center sm:items-end sm:ml-0">
    <span>{'Version 7.0'}</span>
    <div className="flex flex-col gap-2 mt-2">
      <Button 
        size="sm" 
        onClick={() => setShowGreenEyesDialog(true)}
        className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium border border-red-600"
      >
        הפעלת ירוק בעיניים
      </Button>
      <Button 
        size="sm" 
        onClick={() => setShowEndEmergencyDialog(true)}
        className="text-xs bg-green-600 hover:bg-green-700 text-white font-medium border border-green-600"
      >
        סיים אירוע חירום
      </Button>
      <button
        className="text-xs text-red-600 underline"
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
</header>


        
<div dir="rtl" className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-4 p-2 sm:p-4 bg-gray-50 min-h-[calc(100vh-90px)]">
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

  
  {/* Residents/Leads Block */}
  <div style={{ order: blockOrder.Leads }} className={`col-span-1 ${isLeadsFullView ? 'lg:col-span-8' : 'lg:col-span-4'} transition-all duration-300 ease-in-out`}>
    <Card className="h-full flex flex-col">
      <CardHeader>
        
        {isLeadsFullView ? (
           <div className="flex flex-col gap-2">
               <div className="flex justify-between items-center">
                   <CardTitle>{'ניהול תושבים (מלא)'}</CardTitle>
                   <div className="flex gap-2">
                       <Button size="sm" onClick={() => setShowAddLeadModal(true)}>{'+ הוסף דיווח'}</Button>
                       <Button onClick={() => setIsLeadsFullView(false)} size="sm" variant="outline">{'תצוגה מקוצרת'}</Button>
                       
                       <Tooltip><TooltipTrigger asChild><Button size="xs" onClick={() => toggleBlockOrder("Leads")}> {'מיקום: '}{blockOrder.Leads} </Button></TooltipTrigger><TooltipContent>{'שנה מיקום בלוק'}</TooltipContent></Tooltip>
                   </div>
               </div>
               
               {/* Unified horizontal filter/search row */}
               <div className="flex flex-row-reverse flex-wrap items-center gap-x-4 gap-y-2 mt-2 border-t pt-2 w-full justify-end">
                 {/* 1. Search */}
                 <div className="relative">
                   <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                   <Input type="search" placeholder="חפש תושב..." className="h-8 text-sm pl-8 w-[180px]" value={leadSearchTerm} onChange={(e) => setLeadSearchTerm(e.target.value)} />
                 </div>
                 {/* 2. Status filter */}
                 <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                     <Button variant="outline" size="sm" className="h-8 text-sm w-[160px] justify-between">
                       <span>
                         {selectedResidentCategories.length === residentCategories.length
                           ? "כל הסטטוסים"
                           : selectedResidentCategories.length === 1
                             ? residentCategories.find(cat => cat === selectedResidentCategories[0])
                             : `${selectedResidentCategories.length} נבחרו`}
                       </span>
                       <ChevronDown className="h-4 w-4 opacity-50" />
                     </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent className="w-[160px]" dir="rtl">
                     <DropdownMenuLabel>{'סינון סטטוס'}</DropdownMenuLabel>
                     <DropdownMenuSeparator />
                     {residentCategories.map((category) => (
                       <DropdownMenuCheckboxItem
                         key={category}
                         checked={selectedResidentCategories.includes(category)}
                         onCheckedChange={() => {
                           setSelectedResidentCategories(prev =>
                             prev.includes(category)
                               ? prev.filter(c => c !== category)
                               : [...prev, category]
                           );
                         }}
                         onSelect={e => e.preventDefault()}
                         className="flex flex-row-reverse items-center justify-between"
                       >
                         {category}
                       </DropdownMenuCheckboxItem>
                     ))}
                   </DropdownMenuContent>
                 </DropdownMenu>
                 {/* 3. Time filter */}
                 <div className="flex items-center gap-2">
                   <Label className="ml-1 text-sm font-medium">{'סנן זמן:'}</Label>
                   <Select value={leadTimeFilter} onValueChange={setLeadTimeFilter}>
                     <SelectTrigger className="h-8 text-sm w-[130px]"><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">{'הכל'}</SelectItem><SelectItem value="week">{'שבוע אחרון'}</SelectItem>
                       <SelectItem value="month">{'חודש אחרון'}</SelectItem><SelectItem value="custom">{'טווח תאריכים'}</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 {/* 4. Sort direction */}
                 <div className="flex items-center gap-2">
                   <Label className="ml-1 text-sm font-medium">{'כיוון:'}</Label>
                   <Button
                     size="sm"
                     variant="outline"
                     className="h-8 text-sm w-[40px] px-2"
                     onClick={() => setLeadSortDirection(dir => dir === 'asc' ? 'desc' : 'asc')}
                     title={leadSortDirection === 'asc' ? 'סדר עולה' : 'סדר יורד'}
                   >
                     {leadSortDirection === 'asc' ? '⬆️' : '⬇️'}
                   </Button>
                 </div>
                 {/* 5. Sort by */}
                 <div>
                   <Label className="ml-1 text-sm font-medium">{'סדר לפי:'}</Label>
                   <Select value={leadSortBy} onValueChange={setLeadSortBy}>
                     <SelectTrigger className="h-8 text-sm w-[120px]"><SelectValue /></SelectTrigger>
                     <SelectContent><SelectItem value="priority">{'עדיפות'}</SelectItem><SelectItem value="date">{'תאריך יצירה'}</SelectItem></SelectContent>
                   </Select>
                 </div>
                 {/* 6. Custom time range */}
                 {leadTimeFilter === "custom" && (
                   <div className="flex items-center gap-2 flex-wrap">
                     <Label className="text-sm">{'מ:'}</Label><Input type="date" value={leadFilterFrom} onChange={(e) => setLeadFilterFrom(e.target.value)} className="h-8 text-sm w-[140px]" />
                     <Label className="text-sm">{'עד:'}</Label><Input type="date" value={leadFilterTo} onChange={(e) => setLeadFilterTo(e.target.value)} className="h-8 text-sm w-[140px]" />
                   </div>
                 )}
               </div>
           </div>
        ) : (
           <div className="flex justify-between items-center">
               <CardTitle>{'ניהול תושבים'}</CardTitle>
               <div className="flex gap-2">
                   <Button onClick={() => setIsLeadsFullView(true)} size="sm">{'תצוגה מלאה'}</Button>
                    
                   <Tooltip><TooltipTrigger asChild><Button size="xs" onClick={() => toggleBlockOrder("Leads")}> {'מיקום: '}{blockOrder.Leads} </Button></TooltipTrigger><TooltipContent>{'שנה מיקום בלוק'}</TooltipContent></Tooltip>
               </div>
           </div>
        )}
        
        <div className="mt-2 pt-2 border-t">
           <div className="flex gap-2">
             <Button variant="secondary" size="sm" onClick={() => setShowAnalytics(!showAnalytics)}>
                 {showAnalytics ? 'הסתר ניתוח תושבים' : 'הצג ניתוח תושבים'}
             </Button>
             {currentUser?.role === 'admin' && (
               <Button variant="destructive" size="sm" onClick={clearResidentsCollection}>
                   🗑️ נקה נתוני תושבים
               </Button>
             )}
           </div>
        </div>
      </CardHeader>
       <CardContent className="flex-grow flex flex-col overflow-hidden">
        
        <ResidentsManagement 
          residents={filteredResidents} 
          statusColorMap={residentStatusColorMap}
          statusKey="סטטוס"
          currentUser={currentUser}
          users={users}
        />
      </CardContent>
    </Card>
  </div> 

  {showAnalytics && (
     <div className="col-span-12 mt-4"> 
         <Card>
             <CardHeader>
                 <CardTitle>{'ניתוח תושבים'}</CardTitle>
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
                                    <tr className="border-b"><td className="p-2 font-medium">{'סה"כ תגובות:'}</td><td className="p-2">{calculatedAnalytics.totalLeads}</td></tr>
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
                            <h4 className="font-semibold mb-2 text-center">{'דיווחים נכנסים לפי יום'}</h4>
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={calculatedAnalytics.graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" style={{ fontSize: '0.75rem' }} />
                                    <YAxis allowDecimals={false} style={{ fontSize: '0.75rem' }}/>
                                    <RechartsTooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="received" name="דיווחים נכנסים" stroke="#8884d8" strokeWidth={2} activeDot={{ r: 6 }}/>
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}
             </CardContent>
         </Card>
     </div>
  )} 

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
  <div style={{ order: blockOrder.Map }} className={`col-span-1 ${isMapFullView ? 'lg:col-span-12' : 'lg:col-span-4'} transition-all duration-300 ease-in-out`}>
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>{'מפת מיקומי חירום'}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsMapFullView(v => !v)}>
              {isMapFullView ? 'תצוגה מקוצרת' : 'תצוגה מלאה'}
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
                                 {currentUser?.role === 'admin' && (
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

        
        {showAddLeadModal && (
           <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50 p-4" onClick={() => setShowAddLeadModal(false)}>
             <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                 <h2 className="text-lg font-semibold mb-4 text-right">{'הוספת דיווח חדש'}</h2>
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
                       <Button type="submit">הוסף דיווח</Button>
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

      {/* Add User Modal */}
      <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
        <DialogContent className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף משתמש חדש</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <Label htmlFor="fullName" className="text-sm font-medium">שם מלא</Label>
              <Input
                id="fullName"
                type="text"
                value={newUserFullName}
                onChange={(e) => setNewUserFullName(e.target.value)}
                placeholder="הכנס שם מלא"
                required
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="email" className="text-sm font-medium">כתובת מייל</Label>
              <Input
                id="email"
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="user@example.com"
                required
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="password" className="text-sm font-medium">סיסמה</Label>
              <Input
                id="password"
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                required
                minLength={6}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="department" className="text-sm font-medium">מחלקה</Label>
              <Select value={newUserDepartment} onValueChange={setNewUserDepartment}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="בחר מחלקה" />
                </SelectTrigger>
                <SelectContent>
                  {taskCategories.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="role" className="text-sm font-medium">תפקיד</Label>
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">עובד</SelectItem>
                  <SelectItem value="admin">מנהל</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddUserModal(false)}
                disabled={isCreatingUser}
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={isCreatingUser}
              >
                {isCreatingUser ? "יוצר משתמש..." : "צור משתמש"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Green Eyes Activation Dialog */}
      <Dialog open={showGreenEyesDialog} onOpenChange={setShowGreenEyesDialog}>
        <DialogContent className="bg-white rounded-xl shadow-xl p-8 max-w-xs w-full text-center" style={{ direction: 'rtl', textAlign: 'center' }}>
          <DialogHeader className="text-center">
            <DialogTitle className="text-lg font-semibold mb-6">הפעלת נוהל ירוק בעיניים</DialogTitle>
          </DialogHeader>
          <div className="text-lg font-semibold mb-6">האם אתה בטוח שאתה רוצה להפעיל נוהל ירוק בעיניים?</div>
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
              className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              כן
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
    </TooltipProvider>
  );
}

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

// Add a custom event component for the calendar
const CustomEvent = ({ event }) => {
  // Format the start time as HH:mm
  const startTime = event.start instanceof Date
    ? event.start.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  return (
    <div style={{ fontSize: '0.95em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, direction: 'rtl' }}>
      <span style={{ fontWeight: 'normal', marginLeft: 4 }}>{startTime}</span>
      <strong>{event.title}</strong>
    </div>
  );
};

// Add this function for click2call

  




