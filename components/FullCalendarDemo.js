"use client"

import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { formatISO, parseISO } from 'date-fns';
import { db } from '../firebase';
import { collection, onSnapshot, doc, getDoc, updateDoc, serverTimestamp, arrayUnion, setDoc, addDoc, deleteDoc } from 'firebase/firestore';
import { ChevronDown } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Use the same categories and priorities as the main app
const taskPriorities = ["דחוף", "רגיל", "נמוך"];
const pastelColors = [
  "#eaccd8", // ורדרד
  "#bee4e5", // תכלכל
  "#c8c7ef", // סגלגל
  "#cfe8bc", // ירקרק
  "#efe9b4", // צהבהב
  "#edccb4", // כתמתם
  "#bfb599", // זהבהב
];


const USER_COLORS = [
  '#b5ead7', // green
  '#bee4e5', // blue
  '#c8c7ef', // purple
  '#efe9b4', // yellow
  '#eaccd8', // pink
];

function formatDateTime(date) {
  if (!date) return "";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("he-IL")} ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  } catch (error) { return ""; }
}

// Add a helper to convert hex to rgba
function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

// Helper for localStorage persistence
function getUserColorsFromStorage() {
  try {
    const val = localStorage.getItem('calendar_userColors');
    if (val) return JSON.parse(val);
  } catch {}
  return {};
}
function setUserColorsToStorage(colors) {
  try {
    localStorage.setItem('calendar_userColors', JSON.stringify(colors));
  } catch {}
}

function getBlockOrderFromStorage() {
  try {
    const val = localStorage.getItem('calendar_blockOrder');
    if (val) return JSON.parse(val);
  } catch {}
  return 2; // default order: 2 (middle)
}
function setBlockOrderToStorage(order) {
  try {
    localStorage.setItem('calendar_blockOrder', JSON.stringify(order));
  } catch {}
}

// 1. Add a CategoryDropdown component for category filter
function CategoryDropdown({ categories, selected, onChange, categoryColors }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);
  const toggle = cat => {
    if (selected.includes(cat)) onChange(selected.filter(c => c !== cat));
    else onChange([...selected, cat]);
  };
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 120, direction: 'rtl' }}>
      <button
        style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: '8px 16px', fontSize: 15, background: '#fff', cursor: 'pointer', minWidth: 120, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        <span>
          {selected.length === categories.length
            ? 'כל הקטגוריות'
            : selected.length === 1
              ? categories.find(cat => cat === selected[0])
              : `${selected.length} נבחרו`}
        </span>
        <ChevronDown style={{ width: 18, height: 18, opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '110%', right: 0, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, boxShadow: '0 2px 8px #0002', zIndex: 10, minWidth: 180, padding: 8, direction: 'rtl' }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>סינון קטגוריה</div>
          {categories.map(cat => (
            <label key={cat} style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', padding: '6px 0', fontSize: 15 }}>
              <input
                type="checkbox"
                checked={selected.includes(cat)}
                onChange={() => toggle(cat)}
                style={{ accentColor: categoryColors[cat], marginLeft: 8 }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 8, background: categoryColors[cat], marginLeft: 4, border: '1px solid #ccc' }} />
                {cat}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FullCalendarDemo({ isCalendarFullView, taskCategories: propTaskCategories, users: propUsers }) {
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState(propUsers || []);
  const [currentUser, setCurrentUser] = useState(null);
  const [alias, setAlias] = useState("");
  const [editEvent, setEditEvent] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [replyText, setReplyText] = useState("");
  const [userFilter, setUserFilter] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState(propTaskCategories || []);
  const [currentView, setCurrentView] = useState('timeGridDay');
  const [searchTerm, setSearchTerm] = useState('');
  const [userFilterMulti, setUserFilterMulti] = useState(['mine']);
  const [lastFullView, setLastFullView] = useState('timeGridWeek');
  const [userColors, setUserColors] = useState(() => getUserColorsFromStorage());
  const [isTouch, setIsTouch] = useState(false);
  const [blockOrder, setBlockOrder] = useState(() => getBlockOrderFromStorage());
  const calendarRef = useRef();
  const [showUserFilterModal, setShowUserFilterModal] = useState(false);
  const [pendingUserFilter, setPendingUserFilter] = useState(userFilterMulti);
  const [showEventModal, setShowEventModal] = useState(false);
  const [modalEvent, setModalEvent] = useState(null);
  const [modalUpdating, setModalUpdating] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSubtitle, setNewTaskSubtitle] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("רגיל");
  const [newTaskCategory, setNewTaskCategory] = useState(propTaskCategories[0] || "");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskDueTime, setNewTaskDueTime] = useState("");
  const [newTaskAssignTo, setNewTaskAssignTo] = useState("");
  const [modalEditing, setModalEditing] = useState(false);
  const [modalEditTitle, setModalEditTitle] = useState("");
  const [modalEditSubtitle, setModalEditSubtitle] = useState("");
  const [modalEditCategory, setModalEditCategory] = useState(propTaskCategories[0] || "");
  const [modalEditPriority, setModalEditPriority] = useState("רגיל");
  const [modalEditDueDate, setModalEditDueDate] = useState("");
  const [modalEditDueTime, setModalEditDueTime] = useState("");
  const [modalEditAssignTo, setModalEditAssignTo] = useState("");
  const [taskCategories, setTaskCategories] = useState(propTaskCategories || []);
  useEffect(() => {
    if (propTaskCategories) setTaskCategories(propTaskCategories);
  }, [propTaskCategories]);
  // Now define CATEGORY_COLORS after taskCategories is initialized
  const CATEGORY_COLORS = Object.fromEntries((taskCategories || []).map((cat, i) => [cat, pastelColors[i % pastelColors.length]]));

  // Get Firebase Auth user
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Fetch users from Firestore (for list, not for current user)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const usersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersData);
      // Set alias for current user if available
      if (currentUser) {
        const myUserDoc = usersData.find(u => u.id === currentUser.uid);
        if (myUserDoc) setAlias(myUserDoc.alias || myUserDoc.email || "");
      }
    });
    return () => unsub();
  }, [currentUser]);

  // Fetch tasks and leads
  useEffect(() => {
    const unsubTasks = onSnapshot(collection(db, "tasks"), (snap) => {
      const tasks = snap.docs.map(doc => {
        const data = doc.data();
        let dueDate = null;
        if (data.dueDate) {
          if (typeof data.dueDate.toDate === 'function') dueDate = data.dueDate.toDate();
          else if (typeof data.dueDate === 'string') dueDate = new Date(data.dueDate);
          else if (data.dueDate instanceof Date) dueDate = data.dueDate;
        }
        return {
          ...data,
          id: doc.id,
          type: 'task',
          start: dueDate,
          end: dueDate ? new Date(dueDate.getTime() + 20 * 60 * 1000) : null,
          color: CATEGORY_COLORS[data.category],
        };
      });
      setEvents(prev => {
        const leads = prev.filter(e => e.type === 'lead');
        return [...tasks, ...leads];
      });
    });
    const unsubLeads = onSnapshot(collection(db, "leads"), (snap) => {
      const leads = snap.docs.filter(doc => {
        const d = doc.data();
        return d.status === 'תור נקבע' && d.appointmentDateTime;
      }).map(doc => {
        const d = doc.data();
        let start = null;
        if (d.appointmentDateTime) {
          if (typeof d.appointmentDateTime.toDate === 'function') start = d.appointmentDateTime.toDate();
          else if (typeof d.appointmentDateTime === 'string') start = new Date(d.appointmentDateTime);
          else if (d.appointmentDateTime instanceof Date) start = d.appointmentDateTime;
        }
        return {
          id: `lead-${doc.id}`,
          type: 'lead',
          title: `פגישה: ${d.fullName}`,
          start,
          end: start ? new Date(start.getTime() + 20 * 60 * 1000) : null,
          color: '#b5ead7',
          lead: d,
        };
      });
      setEvents(prev => {
        const tasks = prev.filter(e => e.type === 'task');
        return [...tasks, ...leads];
      });
    });
    return () => { unsubTasks(); unsubLeads(); };
  }, []);

  // Detect touch device (iPad, etc.)
  useEffect(() => {
    setIsTouch(('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  }, []);

  // Persist userColors on change
  useEffect(() => { setUserColorsToStorage(userColors); }, [userColors]);

  // Category filter
  const handleCategoryToggle = (cat) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // View sync logic
  useEffect(() => {
    const newView = isCalendarFullView ? 'timeGridWeek' : 'timeGridDay';
    setCurrentView(newView);
    if (calendarRef.current) {
      calendarRef.current.getApi().changeView(newView);
    }
  }, [isCalendarFullView]);

  // Track last full view
  useEffect(() => {
    if (isCalendarFullView && ['timeGridDay', 'timeGridWeek', 'dayGridMonth', 'listWeek'].includes(currentView)) {
      setLastFullView(currentView);
    }
  }, [isCalendarFullView, currentView]);

  // Filtered events (with search and multi-user filter)
  const filteredEvents = events.filter(ev => {
    if (ev.type === 'task') {
      if (userFilterMulti.includes('all')) {
        // show all
      } else if (userFilterMulti.includes('mine')) {
        if (!currentUser) return false;
        if (ev.assignTo !== currentUser.email && ev.assignTo !== currentUser.uid) return false;
      } else if (userFilterMulti.length > 0) {
        if (!userFilterMulti.some(email => ev.assignTo === email)) return false;
      }
      if (!selectedCategories.includes(ev.category)) return false;
      if (searchTerm && !(
        (ev.title && ev.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ev.subtitle && ev.subtitle.toLowerCase().includes(searchTerm.toLowerCase()))
      )) return false;
    }
    return true;
  });

  // Event click handler
  const handleEventClick = (info) => {
    const ev = events.find(e => e.id === info.event.id);
    if (!ev) return;
    setModalEvent(ev);
    setShowEventModal(true);
  };

  // Minimal reply UI logic
  const handleTaskReply = async (taskId, replyText) => {
    if (!replyText.trim() || !currentUser) return;
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      if (!taskDoc.exists()) return;
      const taskData = taskDoc.data();
      // Permission check (same as page.js)
      const hasPermission =
        taskData.userId === currentUser.uid ||
        taskData.creatorId === currentUser.uid ||
        taskData.assignTo === currentUser.uid ||
        taskData.assignTo === currentUser.email ||
        taskData.assignTo === alias;
      if (!hasPermission) {
        alert('אין לך הרשאה להוסיף תגובה למשימה זו');
        return;
      }
      const now = new Date();
      const newReply = {
        id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: replyText,
        timestamp: now,
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userAlias: alias || currentUser.email,
        isRead: false
      };
      const existingReplies = taskData.replies || [];
      await updateDoc(taskRef, {
        replies: [...existingReplies, newReply],
        hasNewReply: true,
        lastReplyAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setReplyText("");
    } catch (error) {
      alert('שגיאה בהוספת תגובה');
    }
  };

  // Mark as done
  const handleTaskDone = async (taskId, checked) => {
    if (!currentUser) return;
    try {
      const taskRef = doc(db, 'tasks', taskId);
      const now = new Date();
      await updateDoc(taskRef, {
        done: checked,
        completedBy: checked ? (currentUser.email || currentUser.uid) : null,
        completedByAlias: checked ? (alias || currentUser.email) : null,
        completedAt: checked ? now : null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {}
  };

  // Toggle message sent
  const handleMessageSent = async (taskId, checked) => {
    if (!currentUser) return;
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, {
        messageSent: checked,
        updatedAt: serverTimestamp()
      });
    } catch (error) {}
  };

  // Drag & drop: keep category, update time and preserve duration
  const handleEventDrop = (info) => {
    setEvents(prev => prev.map(ev => {
      if (ev.id === info.event.id) {
        const oldStart = new Date(ev.start);
        const oldEnd = new Date(ev.end || oldStart);
        const duration = oldEnd.getTime() - oldStart.getTime();
        const newStart = info.event.start;
        const newEnd = new Date(newStart.getTime() + duration);
        return { ...ev, start: formatISO(newStart), end: formatISO(newEnd) };
      }
      return ev;
    }));
  };

  // Open modal for edit
  const handleAddNew = () => {
    const newId = (Math.max(...events.map(e => +e.id)) + 1).toString();
    setEvents(prev => [
      ...prev,
      {
        id: newId,
        ...editFields,
        start: editFields.date && editFields.time ? formatISO(new Date(`${editFields.date}T${editFields.time}`)) : formatISO(new Date()),
        done: editFields.done || false,
        messageSent: editFields.messageSent || false,
      },
    ]);
    setEditEvent(null);
  };

  // Replace renderEventContent with a compact version
  function renderEventContent(eventInfo) {
    const { done, messageSent } = eventInfo.event.extendedProps;
    const title = eventInfo.event.title || '';
    // Only show title and icons, truncate if too long, text in black, center aligned
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 15, fontWeight: 500, padding: '2px 4px', minHeight: 24, maxWidth: '100%', color: '#222',
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#222', textAlign: 'center' }}>{title}</span>
        {done && (
          <span title="בוצע" style={{ color: '#222', fontSize: 16, marginLeft: 2, display: 'flex', alignItems: 'center' }}>✔️</span>
        )}
        {messageSent && (
          <span title="הודעה נשלחה" style={{ color: '#2196f3', fontSize: 16, marginLeft: 2, display: 'flex', alignItems: 'center' }}>✉️</span>
        )}
      </div>
    );
  }

  // Delete all done tasks
  const handleDeleteAllDone = async () => {
    if (!currentUser) {
      alert('משתמש לא מחובר.');
      return;
    }
    // Only delete tasks the user owns/created/assigned
    const doneTasks = events.filter(ev =>
      ev.type === 'task' && ev.done && (
        ev.userId === currentUser.uid ||
        ev.creatorId === currentUser.uid ||
        ev.assignTo === currentUser.email ||
        ev.assignTo === currentUser.alias
      )
    );
    if (doneTasks.length === 0) {
      alert('אין משימות שבוצעו למחיקה.');
      return;
    }
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את כל המשימות שבוצעו? לא ניתן לשחזר פעולה זו.')) return;
    try {
      const archiveAndDeletePromises = doneTasks.map(async task => {
        try {
          const aliasToArchive = task.completedByAlias || task.completedBy || task.creatorAlias || task.creatorEmail || task.assignTo || alias || currentUser?.alias || currentUser?.email || '';
          await setDoc(doc(db, 'archivedTasks', task.id), {
            ...task,
            completedByAlias: aliasToArchive,
            archivedAt: new Date(),
          });
          await deleteDoc(doc(db, 'tasks', task.id));
          return task.id;
        } catch (error) {
          return null;
        }
      });
      const results = await Promise.allSettled(archiveAndDeletePromises);
      const successfulDeletes = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
      setEvents(prevEvents => prevEvents.filter(ev => !successfulDeletes.includes(ev.id)));
      if (successfulDeletes.length < doneTasks.length) {
        alert('חלק מהמשימות לא נמחקו עקב הרשאות חסרות');
      } else {
        alert('כל המשימות שבוצעו הועברו לארכיון.');
      }
    } catch (error) {
      alert('שגיאה במחיקת המשימות שבוצעו.');
    }
  };

  // Block order logic
  const cycleBlockOrder = () => {
    const next = blockOrder === 3 ? 1 : blockOrder + 1;
    setBlockOrder(next);
    setBlockOrderToStorage(next);
  };

  // --- 1. Persist full/compact state and calendar view in localStorage ---
  useEffect(() => {
    try {
      localStorage.setItem('calendar_isFullView', JSON.stringify(isCalendarFullView));
      localStorage.setItem('calendar_currentView', currentView);
    } catch {}
  }, [isCalendarFullView, currentView]);

  useEffect(() => {
    try {
      const savedFullView = localStorage.getItem('calendar_isFullView');
      const savedView = localStorage.getItem('calendar_currentView');
      if (savedFullView !== null) setIsCalendarFullView(JSON.parse(savedFullView));
      if (savedView) setCurrentView(savedView);
    } catch {}
    // eslint-disable-next-line
  }, []);

  // Load user filter from Firestore for the Auth user
  useEffect(() => {
    if (!currentUser) return;
    const userDocId = currentUser.uid;
    if (!userDocId || typeof userDocId !== 'string') {
      console.error('User doc ID is missing or invalid!', currentUser);
      return;
    }
    const userRefLoad = doc(db, 'users', userDocId);
    getDoc(userRefLoad).then(snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data.userFilterCalendar)) {
          setUserFilterMulti(data.userFilterCalendar);
          setPendingUserFilter(data.userFilterCalendar);
        }
      }
    }).catch(err => {
      console.error('Error loading user filter from Firestore:', err);
    });
  }, [currentUser]);

  // When confirming the modal, persist the filter and update both states
  const confirmUserFilterModal = () => {
    setUserFilterMulti(pendingUserFilter);
    setShowUserFilterModal(false);
    // Persist immediately
    if (currentUser && currentUser.uid && Array.isArray(pendingUserFilter)) {
      const userRefSave = doc(db, 'users', currentUser.uid);
      updateDoc(userRefSave, { userFilterCalendar: pendingUserFilter }).catch(err => {
        console.error('Error saving user filter to Firestore:', err);
      });
    }
  };
  // When opening modal, copy current filter to pending
  const openUserFilterModal = () => {
    setPendingUserFilter(userFilterMulti);
    setShowUserFilterModal(true);
  };
  // Cancel selection
  const cancelUserFilterModal = () => {
    setShowUserFilterModal(false);
  };
  // Toggle user in pending filter
  const togglePendingUser = (email) => {
    setPendingUserFilter(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };
  // Toggle 'mine' and 'all'
  const toggleMine = () => {
    setPendingUserFilter(['mine']);
  };
  const toggleAll = () => {
    setPendingUserFilter(['all']);
  };
  // Set color for user
  const setPendingUserColor = (email, color) => {
    setUserColors(c => { const next = { ...c, [email]: color }; setUserColorsToStorage(next); return next; });
  };

  // Add handlers to update done and messageSent
  const handleModalToggleDone = async () => {
    if (!modalEvent) return;
    setModalUpdating(true);
    try {
      const taskRef = doc(db, 'tasks', modalEvent.id);
      await updateDoc(taskRef, { done: !modalEvent.done });
      setModalEvent({ ...modalEvent, done: !modalEvent.done });
      // Also update in events state
      setEvents(prev => prev.map(ev => ev.id === modalEvent.id ? { ...ev, done: !modalEvent.done } : ev));
    } catch (err) {
      alert('שגיאה בעדכון סטטוס המשימה');
    }
    setModalUpdating(false);
  };
  const handleModalToggleMessageSent = async () => {
    if (!modalEvent) return;
    setModalUpdating(true);
    try {
      const taskRef = doc(db, 'tasks', modalEvent.id);
      await updateDoc(taskRef, { messageSent: !modalEvent.messageSent });
      setModalEvent({ ...modalEvent, messageSent: !modalEvent.messageSent });
      setEvents(prev => prev.map(ev => ev.id === modalEvent.id ? { ...ev, messageSent: !modalEvent.messageSent } : ev));
    } catch (err) {
      alert('שגיאה בעדכון סטטוס הודעה');
    }
    setModalUpdating(false);
  };

  // Add support for dateClick to prefill new task modal
  const handleDateClick = (arg) => {
    // arg.date is a JS Date object
    setShowTaskModal(true);
    setNewTaskDueDate(arg.date.toISOString().slice(0, 10));
    setNewTaskDueTime(arg.date.toTimeString().slice(0, 5));
    setNewTaskTitle("");
    setNewTaskSubtitle("");
    setNewTaskPriority("רגיל");
    setNewTaskCategory(propTaskCategories[0] || "");
    setNewTaskAssignTo(currentUser?.email || "");
  };

  // Fix new task creation to save to Firestore
  const handleCreateTask = async (e) => {
    if (e) e.preventDefault();
    if (!currentUser) {
      alert("משתמש לא מחובר");
      return;
    }
    try {
      const taskRef = doc(collection(db, "tasks"));
      const newTask = {
        id: taskRef.id,
        userId: currentUser.uid,
        creatorId: currentUser.uid,
        creatorAlias: alias || currentUser.email || "",
        assignTo: newTaskAssignTo || currentUser.email,
        title: newTaskTitle || "משימה חדשה",
        subtitle: newTaskSubtitle,
        priority: newTaskPriority,
        category: newTaskCategory,
        status: "פתוח",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        dueDate: newTaskDueDate && newTaskDueTime ? new Date(`${newTaskDueDate}T${newTaskDueTime}`).toISOString() : null,
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null,
        messageSent: false,
      };
      await setDoc(taskRef, newTask);
      setShowTaskModal(false);
      setNewTaskTitle("");
      setNewTaskSubtitle("");
      setNewTaskPriority("רגיל");
      setNewTaskCategory(propTaskCategories[0] || "");
      setNewTaskDueDate("");
      setNewTaskDueTime("");
      setNewTaskAssignTo("");
    } catch (error) {
      alert("שגיאה ביצירת המשימה. נסה שוב.");
    }
  };

  // When opening modal for edit, prefill fields
  useEffect(() => {
    if (modalEditing && modalEvent) {
      setModalEditTitle(modalEvent.title || "");
      setModalEditSubtitle(modalEvent.subtitle || "");
      setModalEditCategory(modalEvent.category || propTaskCategories[0] || "");
      setModalEditPriority(modalEvent.priority || "רגיל");
      if (modalEvent.dueDate) {
        const d = new Date(modalEvent.dueDate);
        setModalEditDueDate(d.toLocaleDateString('en-CA'));
        setModalEditDueTime(d.toTimeString().slice(0, 5));
      } else {
        setModalEditDueDate("");
        setModalEditDueTime("");
      }
      setModalEditAssignTo(modalEvent.assignTo || "");
    }
  }, [modalEditing, modalEvent, propTaskCategories]);

  // Handler to save edits
  const handleModalEditSave = async (e) => {
    e.preventDefault();
    if (!modalEvent) return;
    setModalUpdating(true);
    try {
      const taskRef = doc(db, 'tasks', modalEvent.id);
      const dueDateISO = modalEditDueDate && modalEditDueTime ? new Date(`${modalEditDueDate}T${modalEditDueTime}`).toISOString() : null;
      await updateDoc(taskRef, {
        title: modalEditTitle,
        subtitle: modalEditSubtitle,
        category: modalEditCategory,
        priority: modalEditPriority,
        dueDate: dueDateISO,
        assignTo: modalEditAssignTo,
        updatedAt: serverTimestamp(),
      });
      setModalEvent({
        ...modalEvent,
        title: modalEditTitle,
        subtitle: modalEditSubtitle,
        category: modalEditCategory,
        priority: modalEditPriority,
        dueDate: dueDateISO,
        assignTo: modalEditAssignTo,
      });
      setEvents(prev => prev.map(ev => ev.id === modalEvent.id ? {
        ...ev,
        title: modalEditTitle,
        subtitle: modalEditSubtitle,
        category: modalEditCategory,
        priority: modalEditPriority,
        dueDate: dueDateISO,
        assignTo: modalEditAssignTo,
      } : ev));
      setModalEditing(false);
    } catch (err) {
      alert('שגיאה בעדכון המשימה');
    }
    setModalUpdating(false);
  };

  return (
    <div
      style={{
        maxWidth: isCalendarFullView ? 1000 : 420,
        margin: '40px auto',
        background: '#f8fafc',
        borderRadius: 12,
        boxShadow: '0 2px 12px #0001',
        padding: 32,
        transition: 'max-width 0.3s',
        fontSize: isTouch ? 18 : 15,
        order: blockOrder,
        position: 'relative',
      }}
    >
      {/* Broom icon at the very top left of the card */}
      {!isCalendarFullView && (
        <button
          style={{ position: 'absolute', left: 8, top: 8, background: 'none', border: 'none', color: '#d32f2f', fontSize: 22, cursor: 'pointer', padding: 4, zIndex: 10 }}
          onClick={handleDeleteAllDone}
          title="מחק משימות שבוצעו"
        >🧹</button>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ textAlign: 'center', fontWeight: 700, color: '#3b3b3b', fontSize: 28, margin: 0 }}>
          יומן ניהול משימות
        </h2>
      </div>
      {/* Control bar */}
      {isCalendarFullView ? (
        // Full view: keep current layout
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: isTouch ? 18 : 12, alignItems: 'center', marginBottom: 18, overflowX: isTouch ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' }}>
          {/* View buttons always visible and working */}
          <div style={{ display: 'flex', gap: isTouch ? 10 : 4 }}>
            <button
              style={{ background: currentView === 'timeGridDay' ? '#a7c7e7' : '#eee', color: '#222', border: 'none', borderRadius: 8, padding: isTouch ? '12px 20px' : '6px 14px', fontWeight: 600, fontSize: isTouch ? 18 : 15, cursor: 'pointer', minWidth: 44, minHeight: 44 }}
              onClick={() => {
                setCurrentView('timeGridDay');
                if (calendarRef.current) calendarRef.current.getApi().changeView('timeGridDay');
              }}
            >יום</button>
            <button
              style={{ background: currentView === 'timeGridWeek' ? '#a7c7e7' : '#eee', color: '#222', border: 'none', borderRadius: 8, padding: isTouch ? '12px 20px' : '6px 14px', fontWeight: 600, fontSize: isTouch ? 18 : 15, cursor: 'pointer', minWidth: 44, minHeight: 44 }}
              onClick={() => {
                setCurrentView('timeGridWeek');
                if (calendarRef.current) calendarRef.current.getApi().changeView('timeGridWeek');
              }}
            >שבוע</button>
            <button
              style={{ background: currentView === 'dayGridMonth' ? '#a7c7e7' : '#eee', color: '#222', border: 'none', borderRadius: 8, padding: isTouch ? '12px 20px' : '6px 14px', fontWeight: 600, fontSize: isTouch ? 18 : 15, cursor: 'pointer', minWidth: 44, minHeight: 44 }}
              onClick={() => {
                setCurrentView('dayGridMonth');
                if (calendarRef.current) calendarRef.current.getApi().changeView('dayGridMonth');
              }}
            >חודש</button>
            <button
              style={{ background: currentView === 'listWeek' ? '#a7c7e7' : '#eee', color: '#222', border: 'none', borderRadius: 8, padding: isTouch ? '12px 20px' : '6px 14px', fontWeight: 600, fontSize: isTouch ? 18 : 15, cursor: 'pointer', minWidth: 44, minHeight: 44 }}
              onClick={() => {
                setCurrentView('listWeek');
                if (calendarRef.current) calendarRef.current.getApi().changeView('listWeek');
              }}
            >רשימה</button>
          </div>
          {/* Delete all done tasks */}
          <button
            style={{ background: '#fbb', color: '#222', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
            onClick={handleDeleteAllDone}
          >מחק משימות שבוצעו</button>
          {/* Search input */}
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש משימה..."
            style={{ borderRadius: 8, padding: isTouch ? '12px 16px' : '6px 12px', fontSize: isTouch ? 17 : 15, border: '1px solid #e0e0e0', minWidth: 120, minHeight: 44 }}
          />
          {/* User filter dropdown */}
          <button onClick={openUserFilterModal} style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: isTouch ? '16px 24px' : '12px 18px', fontSize: isTouch ? 20 : 17, background: '#fff', cursor: 'pointer', minWidth: 180, minHeight: isTouch ? 56 : 44 }}>סנן לפי משתמשים</button>
        </div>
      ) : (
        // Compact view: condensed layout
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap', position: 'relative', minHeight: 44 }}>
          {/* View buttons and search input on the same line */}
          <div style={{ display: 'flex', gap: 4, marginRight: 32, alignItems: 'center' }}>
            <button
              style={{ background: currentView === 'timeGridDay' ? '#a7c7e7' : '#eee', color: '#222', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer', minWidth: 44, minHeight: 36 }}
              onClick={() => {
                setCurrentView('timeGridDay');
                if (calendarRef.current) calendarRef.current.getApi().changeView('timeGridDay');
              }}
            >יום</button>
            <button
              style={{ background: currentView === 'listWeek' ? '#a7c7e7' : '#eee', color: '#222', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer', minWidth: 44, minHeight: 36 }}
              onClick={() => {
                setCurrentView('listWeek');
                if (calendarRef.current) calendarRef.current.getApi().changeView('listWeek');
              }}
            >רשימה</button>
            {/* Search input immediately to the left of the buttons */}
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="חפש משימה..."
              style={{ borderRadius: 8, padding: '6px 12px', fontSize: 15, border: '1px solid #e0e0e0', minWidth: 100, minHeight: 36, marginRight: 8 }}
            />
          </div>
          {/* Category dropdown */}
          <CategoryDropdown
            categories={propTaskCategories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            categoryColors={CATEGORY_COLORS}
          />
          {/* User filter dropdown */}
          <button onClick={openUserFilterModal} style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: isTouch ? '16px 24px' : '12px 18px', fontSize: isTouch ? 20 : 17, background: '#fff', cursor: 'pointer', minWidth: 180, minHeight: isTouch ? 56 : 44 }}>סנן לפי משתמשים</button>
        </div>
      )}
      <div style={{ marginBottom: 24, textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
        <button
          style={{ background: '#b5ead7', color: '#222', border: 'none', borderRadius: 6, padding: '6px 18px', fontWeight: 600, fontSize: 16, boxShadow: '0 1px 4px #0001', cursor: 'pointer' }}
          onClick={() => {
            setEditEvent({ id: '', isNew: true });
            setEditFields({ title: '', subtitle: '', category: propTaskCategories[0], priority: taskPriorities[1], assignTo: currentUser?.email || '', date: '', time: '', done: false, messageSent: false });
          }}
        >+ משימה חדשה</button>
      </div>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView={isCalendarFullView ? lastFullView : currentView}
        view={currentView}
        headerToolbar={isCalendarFullView
          ? { right: 'prev,next today', center: 'title', left: '' }
          : { right: 'prev,next today', center: 'title', left: '' }
        }
        events={filteredEvents}
        editable={true}
        droppable={true}
        eventDrop={handleEventDrop}
        eventClick={handleEventClick}
        height={isCalendarFullView ? 700 : 520}
        locale="he"
        direction="rtl"
        eventContent={renderEventContent}
        slotMinTime="08:00:00"
        slotMaxTime="20:00:00"
        hiddenDays={[6]}
        datesSet={arg => {
          setCurrentView(arg.view.type);
        }}
        dayHeaderClassNames={() => 'fc-pastel-header'}
        buttonText={{ today: 'היום' }}
        dateClick={handleDateClick}
      />
      {/* Edit/Add Modal */}
      {editEvent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0006', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 36, borderRadius: 12, minWidth: 340, boxShadow: '0 2px 16px #0002', maxWidth: 400 }}>
            <h3 style={{ marginBottom: 18, fontWeight: 600, fontSize: 20 }}>{editEvent.isNew ? 'הוסף משימה' : 'עריכת משימה'}</h3>
            {/* Done and Message Sent toggles */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
              <button
                onClick={() => setEditFields(f => ({ ...f, done: !f.done }))}
                style={{ background: editFields.done ? '#4caf50' : '#eee', color: editFields.done ? '#fff' : '#333', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, fontSize: 15, cursor: 'pointer', textDecoration: editFields.done ? 'line-through' : 'none' }}
              >{editFields.done ? '✔️ הושלם' : 'סמן כהושלם'}</button>
              <button
                onClick={() => setEditFields(f => ({ ...f, messageSent: !f.messageSent }))}
                style={{ background: editFields.messageSent ? '#111' : '#eee', color: editFields.messageSent ? '#fff' : '#333', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              >{editFields.messageSent ? '✉️ הודעה נשלחה' : 'סמן הודעה נשלחה'}</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontWeight: 500 }}>כותרת:</label>
              <input value={editFields.title} onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontWeight: 500 }}>תיאור:</label>
              <input value={editFields.subtitle} onChange={e => setEditFields(f => ({ ...f, subtitle: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
            </div>
            <div style={{ marginBottom: 14, display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 500 }}>קטגוריה:</label>
                <select value={editFields.category} onChange={e => setEditFields(f => ({ ...f, category: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                  {propTaskCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 500 }}>עדיפות:</label>
                <select value={editFields.priority} onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                  {taskPriorities.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14, display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 500 }}>מוקצה ל:</label>
                <select value={editFields.assignTo} onChange={e => setEditFields(f => ({ ...f, assignTo: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                  {users.map(u => (
                    <option key={u.id} value={u.email}>{u.alias ? u.alias : u.email}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14, display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 500 }}>תאריך:</label>
                <input type="date" value={editFields.date} onChange={e => setEditFields(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontWeight: 500 }}>שעה:</label>
                <input type="time" value={editFields.time} onChange={e => setEditFields(f => ({ ...f, time: e.target.value }))} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
              </div>
            </div>
            {editEvent && editEvent.type === 'task' && (
              <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 12 }}>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>תגובות:</div>
                <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 8 }}>
                  {(editEvent.replies && editEvent.replies.length > 0) ? (
                    editEvent.replies.map((reply, idx) => (
                      <div key={reply.id || idx} style={{ fontSize: 13, marginBottom: 4, background: '#f6f8fa', borderRadius: 6, padding: '4px 8px' }}>
                        <span style={{ fontWeight: 600 }}>{reply.userAlias || reply.userEmail || 'משתמש'}</span>
                        <span style={{ color: '#888', fontSize: 11, marginRight: 6 }}>{formatDateTime(reply.timestamp)}</span>
                        <div style={{ marginTop: 2 }}>{reply.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: '#aaa', fontSize: 13 }}>אין תגובות עדיין.</div>
                  )}
                </div>
                <form onSubmit={e => { e.preventDefault(); handleTaskReply(editEvent.id, replyText); }} style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="הוסף תגובה..."
                    style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, fontSize: 14 }}
                  />
                  <button type="submit" style={{ background: '#b5ead7', color: '#222', border: 'none', borderRadius: 6, padding: '6px 14px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>שלח</button>
                </form>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
              <button onClick={() => setEditEvent(null)} style={{ background: '#eee', color: '#222', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ערוך</button>
              <button
                onClick={editEvent.isNew ? handleAddNew : () => {
                  setEvents(prev => prev.map(ev => ev.id === editEvent.id ? { ...editFields, id: editEvent.id } : ev));
                  setEditEvent(null);
                }}
                style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}
              >{editEvent.isNew ? 'הוסף' : 'שמור'}</button>
            </div>
          </div>
        </div>
      )}
      {showUserFilterModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0006', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 340, maxWidth: 420, boxShadow: '0 2px 16px #0002', width: '90vw' }}>
            <h3 style={{ marginBottom: 18, fontWeight: 600, fontSize: 20, textAlign: 'center' }}>סינון לפי משתמשים</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, fontWeight: 500 }}>
                <input type="checkbox" checked={pendingUserFilter.includes('mine')} onChange={toggleMine} style={{ width: 22, height: 22 }} /> המשימות שלי
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 17, fontWeight: 500 }}>
                <input type="checkbox" checked={pendingUserFilter.includes('all')} onChange={toggleAll} style={{ width: 22, height: 22 }} /> כל המשימות
              </label>
              <div style={{ borderTop: '1px solid #eee', margin: '8px 0' }} />
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  <input type="checkbox" checked={pendingUserFilter.includes(u.email)} onChange={() => togglePendingUser(u.email)} style={{ width: 22, height: 22 }} />
                  <span style={{ flex: 1 }}>{u.alias ? u.alias : u.email}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {USER_COLORS.map(color => (
                      <span
                        key={color}
                        onClick={() => setPendingUserColor(u.email, color)}
                        title={userColors[u.email] === color ? 'הצבע הנבחר' : 'בחר צבע'}
                        style={{ width: 28, height: 28, borderRadius: '50%', background: color, border: userColors[u.email] === color ? '3px solid #222' : '2px solid #ccc', cursor: 'pointer', display: 'inline-block', marginLeft: 4, boxShadow: userColors[u.email] === color ? '0 0 0 2px #a7c7e7' : 'none', transition: 'border 0.2s' }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
              <button onClick={confirmUserFilterModal} style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>אישור</button>
              <button onClick={cancelUserFilterModal} style={{ background: '#eee', color: '#222', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ביטול</button>
            </div>
          </div>
        </div>
      )}
      {showEventModal && modalEvent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0006', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowEventModal(false)}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 320, maxWidth: 420, boxShadow: '0 2px 16px #0002', width: '90vw' }} onClick={e => e.stopPropagation()}>
            {!modalEditing ? (
              <>
                <h3 style={{ marginBottom: 12, fontWeight: 700, fontSize: 20 }}>{modalEvent.title}</h3>
                {modalEvent.subtitle && <div style={{ marginBottom: 8, color: '#555' }}>{modalEvent.subtitle}</div>}
                <div style={{ marginBottom: 8 }}><b>קטגוריה:</b> {modalEvent.category}</div>
                <div style={{ marginBottom: 8 }}><b>עדיפות:</b> {modalEvent.priority}</div>
                <div style={{ marginBottom: 8 }}><b>מוקצה ל:</b> {users.find(u => u.email === modalEvent.assignTo)?.alias || modalEvent.assignTo}</div>
                <div style={{ marginBottom: 8 }}><b>תאריך יעד:</b> {modalEvent.dueDate ? formatDateTime(modalEvent.dueDate) : ''}</div>
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                    <input type="checkbox" checked={!!modalEvent.done} onChange={handleModalToggleDone} disabled={modalUpdating} /> בוצע
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                    <input type="checkbox" checked={!!modalEvent.messageSent} onChange={handleModalToggleMessageSent} disabled={modalUpdating} /> הודעה נשלחה
                  </label>
                  {modalUpdating && <span style={{ fontSize: 13, color: '#888' }}>מעדכן...</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
                  <button onClick={() => setModalEditing(true)} style={{ background: '#eee', color: '#222', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ערוך</button>
                  <button onClick={() => setShowEventModal(false)} style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>סגור</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleModalEditSave}>
                <h3 style={{ marginBottom: 12, fontWeight: 700, fontSize: 20 }}>עריכת משימה</h3>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontWeight: 500 }}>כותרת:</label>
                  <input type="text" value={modalEditTitle} onChange={e => setModalEditTitle(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} required />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontWeight: 500 }}>תיאור:</label>
                  <input type="text" value={modalEditSubtitle} onChange={e => setModalEditSubtitle(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
                </div>
                <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontWeight: 500 }}>עדיפות:</label>
                    <select value={modalEditPriority} onChange={e => setModalEditPriority(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                      {taskPriorities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontWeight: 500 }}>קטגוריה:</label>
                    <select value={modalEditCategory} onChange={e => setModalEditCategory(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                      {taskCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontWeight: 500 }}>תאריך:</label>
                    <input type="date" value={modalEditDueDate} onChange={e => setModalEditDueDate(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} required />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontWeight: 500 }}>שעה:</label>
                    <input type="time" value={modalEditDueTime} onChange={e => setModalEditDueTime(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontWeight: 500 }}>מוקצה ל:</label>
                  <select value={modalEditAssignTo} onChange={e => setModalEditAssignTo(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                    {users.map(u => (
                      <option key={u.id} value={u.email}>{u.alias || u.email}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
                  <button type="button" onClick={() => setModalEditing(false)} style={{ background: '#eee', color: '#222', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ביטול</button>
                  <button type="submit" disabled={modalUpdating} style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>{modalUpdating ? 'שומר...' : 'שמור'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {showTaskModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#0006', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowTaskModal(false)}>
          <div style={{ background: '#fff', padding: 32, borderRadius: 12, minWidth: 320, maxWidth: 420, boxShadow: '0 2px 16px #0002', width: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 12, fontWeight: 700, fontSize: 20 }}>משימה חדשה</h3>
            <form onSubmit={handleCreateTask}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 500 }}>כותרת:</label>
                <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} required />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 500 }}>תיאור:</label>
                <input type="text" value={newTaskSubtitle} onChange={e => setNewTaskSubtitle(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
              </div>
              <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 500 }}>עדיפות:</label>
                  <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                    {taskPriorities.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 500 }}>קטגוריה:</label>
                  <select value={newTaskCategory} onChange={e => setNewTaskCategory(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                    {propTaskCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 500 }}>תאריך:</label>
                  <input type="date" value={newTaskDueDate} onChange={e => setNewTaskDueDate(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontWeight: 500 }}>שעה:</label>
                  <input type="time" value={newTaskDueTime} onChange={e => setNewTaskDueTime(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontWeight: 500 }}>מוקצה ל:</label>
                <select value={newTaskAssignTo} onChange={e => setNewTaskAssignTo(e.target.value)} style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 6, padding: 6, marginTop: 4, fontSize: 15 }}>
                  <option value={currentUser?.email || ""}>{currentUser?.email || "עצמי"}</option>
                  {users.filter(u => u.email !== currentUser?.email).map(u => (
                    <option key={u.id} value={u.email}>{u.alias || u.email}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 18 }}>
                <button type="button" onClick={() => setShowTaskModal(false)} style={{ background: '#eee', color: '#222', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>ביטול</button>
                <button type="submit" style={{ background: '#2196f3', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>צור משימה</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom styles for FullCalendar navigation buttons */}
      <style jsx global>{`
        .fc .fc-button, .fc .fc-button-primary {
          background: #bee4e5 !important;
          color: #222 !important;
          border: none !important;
          border-radius: 8px !important;
          font-weight: 600;
          font-size: 16px;
          box-shadow: none !important;
          margin: 0 2px;
          min-width: 44px;
          min-height: 44px;
          transition: background 0.2s;
        }
        .fc .fc-button:hover, .fc .fc-button-primary:hover {
          background: #eaccd8 !important;
        }
        .fc .fc-button-active, .fc .fc-button-primary:active {
          background: #c8c7ef !important;
        }
        .fc .fc-today-button {
          background: #a7c7e7 !important;
          color: #222 !important;
        }
        .fc .fc-toolbar-title {
          font-size: 22px;
          font-weight: 700;
          color: #3b3b3b;
        }
        .fc-pastel-header {
          background: #f8fafc !important;
          color: #444 !important;
        }
      `}</style>
    </div>
  );
} 