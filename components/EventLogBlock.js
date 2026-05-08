import React, { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, getDocs, setDoc, getDoc, query, where } from "firebase/firestore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronLeft, Upload, Link, Edit2, ClipboardList } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { toast } from "@/components/ui/use-toast";
import { notifyUsersInDepartment } from "@/lib/notifications";

function statusColor(status) {
  if (status === "מחכה") return "text-red-600 font-bold";
  if (status === "בטיפול") return "text-orange-500 font-bold";
  if (status === "טופל") return "text-green-600 font-bold";
  return "";
}

const statusColors = {
  "מחכה": "bg-red-500",
  "בטיפול": "bg-orange-500",
  "טופל": "bg-green-500",
};

const departmentOptions = [
  "לוגיסטיקה", "אוכלוסיה", "רפואה", "חוסן", 'חמ"ל', "אחר"
];

// Department color map
const getDepartmentBadgeColor = (dept) => {
  const colorMap = {
    'לוגיסטיקה': 'bg-blue-100 text-blue-800',
    'אוכלוסיה': 'bg-pink-100 text-pink-800',
    'רפואה': 'bg-red-100 text-red-800',
    'חוסן': 'bg-green-100 text-green-800',
    'חמ"ל': 'bg-purple-100 text-purple-800',
    'אחר': 'bg-gray-100 text-gray-800'
  };
  return colorMap[dept] || 'bg-gray-100 text-gray-800';
};

function formatDateTime(ts) {
  if (!ts) return "";
  if (ts.seconds) ts = new Date(ts.seconds * 1000);
  else ts = new Date(ts);
  if (isNaN(ts.getTime())) return "";
  return ts.toLocaleDateString("he-IL") + " " + ts.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function EventLogBlock({ isFullView, setIsFullView, currentUser, alias, departments, isAdmin, blockOrder = 1, toggleBlockOrder = () => {}, emergencyEventId }) {
  // State for event name (admin only)
  const [eventName, setEventName] = useState(`יומן אירועים - חמ"ל (${emergencyEventId || 'אירוע חדש'})`);
  const [editingEventName, setEditingEventName] = useState(false);
  // State for import modal
  const [showImportModal, setShowImportModal] = useState(false);
  // State for add event modal
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [events, setEvents] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const [addUpdateText, setAddUpdateText] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskEvent, setTaskEvent] = useState(null);
  const [taskPriority, setTaskPriority] = useState("רגיל");
  const [taskDepartment, setTaskDepartment] = useState("");
  const [taskStatus, setTaskStatus] = useState("מחכה");
  const [userFullName, setUserFullName] = useState("");

  // Add event form state
  const [form, setForm] = useState({
    reporter: "",
    recipient: "",
    description: "",
    department: "",
    status: "מחכה",
    link: "",
  });


  const displayEvents = events;

  // Fetch user's full name for recipient field
  useEffect(() => {
    const fetchUserFullName = async () => {
      if (!currentUser) return;
      
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          // Try to get full name from various possible fields
          const fullName = userData.fullName || 
                          userData.name || 
                          (userData.firstName && userData.lastName ? `${userData.firstName} ${userData.lastName}` : null) ||
                          userData.alias || 
                          currentUser.email || 
                          "";
          setUserFullName(fullName);
          
          // Update form with user's full name as default recipient
          setForm(prev => ({
            ...prev,
            recipient: fullName
          }));
        } else {
          // If user document doesn't exist, use alias or email
          const fallbackName = alias || currentUser.email || "";
          setUserFullName(fallbackName);
          setForm(prev => ({
            ...prev,
            recipient: fallbackName
          }));
        }
      } catch (error) {
        console.error("Error fetching user full name:", error);
        // Fallback to alias or email
        const fallbackName = alias || currentUser.email || "";
        setUserFullName(fallbackName);
        setForm(prev => ({
          ...prev,
          recipient: fallbackName
        }));
      }
    };

    fetchUserFullName();
  }, [currentUser, alias]);

  // Reset form when modal opens to ensure recipient is pre-filled
  useEffect(() => {
    if (showAddEventModal) {
      setForm(prev => ({
        ...prev,
        recipient: userFullName || alias || "",
        status: "מחכה"
      }));
    }
  }, [showAddEventModal, userFullName, alias]);

  // Firestore listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "eventLogs"), (snap) => {
      setEvents(
        snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    });
    return () => unsub();
  }, []);

  // Add event handler
  const handleAddEvent = async (e) => {
    e.preventDefault();
    
    const eventData = {
      ...form,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastUpdater: alias || currentUser?.email || "",
      history: [],
    };
    
    console.log("Attempting to create event log with data:", eventData);
    
    try {
      const docRef = await addDoc(collection(db, "eventLogs"), eventData);
      console.log("Event log created successfully with ID:", docRef.id);

      // Automatically create a task in Task Manager for the department if department is selected
      if (form.department && form.department.trim()) {
        if (typeof window !== 'undefined' && window.createTaskFromExternal) {
          const taskData = {
            title: form.description || '',
            subtitle: form.link ? `קישור: ${form.link}` : '',
            priority: 'רגיל',
            category: form.department,
            department: form.department,
            status: 'מחכה',
            dueDate: new Date(),
            eventId: docRef.id,
            eventStatus: form.status || 'מחכה',
            link: form.link || "",
          };
          
          console.log("Automatically creating task for event:", taskData);
          await window.createTaskFromExternal(taskData);
        }

        // Notify users in the assigned department
        await notifyUsersInDepartment(form.department, {
          message: `אירוע חדש ביומן: ${form.description}`,
          type: 'event',
          subType: 'newevent',
          link: `/`
        });
      }

      setForm({ reporter: "", recipient: userFullName || alias || "", description: "", department: "", status: "מחכה", link: "" });
      setShowAddEventModal(false);
    } catch (error) {
      console.error("Error creating event log:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        data: eventData
      });
    }
  };

  // Edit event handler (for status, department, etc.)
  const handleEditEvent = async (id, updates) => {
    const ref = doc(db, "eventLogs", id);
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
      lastUpdater: alias || currentUser?.email || "",
    });
  };

  // Compact/expanded toggle
  const handleToggleView = () => setIsFullView && setIsFullView(!isFullView);

  // Inline edit handlers
  const startEdit = (event) => {
    setEditingId(event.id);
    setEditFields({
      reporter: event.reporter || '',
      recipient: event.recipient || '',
      description: event.description || '',
      department: event.department || '',
      status: event.status || 'מחכה',
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditFields({});
  };
  const saveEdit = async (event) => {
    if (event.id.startsWith('mock')) {
      setEditingId(null);
      return;
    }
    await updateDoc(doc(db, 'eventLogs', event.id), {
      ...editFields,
      lastUpdater: alias || (currentUser && currentUser.email) || '',
      updatedAt: serverTimestamp(),
    });
    setEditingId(null);
    setEditFields({});
  };

  // Add update to history
  const addUpdate = async (event) => {
    if (!addUpdateText.trim()) return;
    const newHistory = [...(event.history || []), { timestamp: new Date().toISOString(), text: addUpdateText }];
    if (!event.id.startsWith('mock')) {
      await updateDoc(doc(db, 'eventLogs', event.id), { history: newHistory });
    }
    setEvents(evts => evts.map(e => e.id === event.id ? { ...e, history: newHistory } : e));
    setAddUpdateText("");
  };

  // Handle event status change
  const handleEventStatusChange = async (eventId, newStatus) => {
    if (!currentUser || eventId.startsWith('mock')) return;

    try {
      const eventRef = doc(db, 'eventLogs', eventId);
      await updateDoc(eventRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        lastUpdater: alias || currentUser?.email || ""
      });

      // Also update any linked tasks with the same status
      try {
        const tasksRef = collection(db, "tasks");
        const tasksQuery = query(tasksRef, where("eventId", "==", eventId));
        const tasksSnapshot = await getDocs(tasksQuery);
        
        const updatePromises = tasksSnapshot.docs.map(async (taskDoc) => {
          await updateDoc(doc(db, "tasks", taskDoc.id), {
            status: newStatus,
            updatedAt: serverTimestamp()
          });
        });
        
        await Promise.all(updatePromises);
      } catch (error) {
        console.error('Error updating linked tasks:', error);
      }

      toast({
        title: "Event Status Updated",
        description: `Event status updated to ${newStatus}`,
      });

      // Notify users in the assigned department
      const eventDoc = await getDoc(eventRef);
      const eventData = eventDoc.data();
      if (eventData.department && eventData.department.trim()) {
        await notifyUsersInDepartment(eventData.department, {
          message: `סטטוס אירוע התעדכן: ${eventData.description} - ${newStatus}`,
          type: 'event',
          subType: 'statuschange',
          link: `/`
        });
      }

    } catch (error) {
      console.error('Error updating event status:', error);
      toast({
        title: "Error",
        description: "Failed to update event status",
        variant: "destructive"
      });
    }
  };


  // Assign task modal
  const openTaskModal = (event) => {
    setTaskEvent(event);
    setTaskPriority("רגיל");
    setTaskDepartment(event.department || "");
    setTaskStatus("מחכה");
    setShowTaskModal(true);
  };
  const createTask = async () => {
    if (!taskEvent || !taskDepartment) return;
    
    try {
      // Use the standardized task creation function if available
      if (typeof window !== 'undefined' && window.createTaskFromExternal) {
        const taskData = {
          title: taskEvent.description || '',
          subtitle: '',
          priority: taskPriority,
          category: taskDepartment,
          department: taskDepartment,
          status: taskStatus,
          dueDate: new Date(),
          eventId: taskEvent.id,
          eventStatus: taskEvent.status || 'מחכה',
        };

        console.log("Creating task from event with data:", taskData);
        console.log("Task department:", taskDepartment);
        
        const taskId = await window.createTaskFromExternal(taskData);
        
        console.log("Task creation result:", taskId);
        
        if (taskId) {
          toast({
            title: "Success",
            description: "המשימה נוצרה בהצלחה",
          });
        } else {
          toast({
            title: "Error",
            description: "שגיאה ביצירת המשימה",
            variant: "destructive"
          });
        }
      } else {
        // Fallback to direct task creation with proper field validation
        const taskRef = doc(collection(db, 'tasks'));
        const taskData = {
          id: taskRef.id,
          userId: currentUser?.uid || '',
          creatorId: currentUser?.uid || '',
          creatorAlias: alias || currentUser?.email || '',
          title: taskEvent.description || '',
          subtitle: '',
          priority: taskPriority,
          category: taskDepartment,
          department: taskDepartment,
          status: taskStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          assignTo: taskDepartment, // Use department as assignTo
          dueDate: new Date(),
          replies: [],
          isRead: false,
          isArchived: false,
          done: false,
          completedBy: null,
          completedAt: null,
          eventId: taskEvent.id,
          eventStatus: taskEvent.status || 'מחכה',
        };
        await setDoc(taskRef, taskData);

        // Notify users in the assigned department
        if (taskDepartment && taskDepartment.trim()) {
          await notifyUsersInDepartment(taskDepartment, {
            message: `משימה חדשה מאירוע: ${taskEvent.description || ''}`,
            type: 'task',
            subType: 'created',
            link: `/`
          });
        }
        
        toast({
          title: "Success",
          description: "המשימה נוצרה בהצלחה",
        });
      }
      
      setShowTaskModal(false);
      setTaskEvent(null);
      setTaskStatus("מחכה");
    } catch (error) {
      console.error("Error creating task from event:", error);
      toast({
        title: "Error",
        description: "שגיאה ביצירת המשימה",
        variant: "destructive"
      });
    }
  };

  // Fetch tasks linked to events
  const [allTasks, setAllTasks] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tasks'), (snap) => {
      setAllTasks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  return (
    <Card className="mb-4 w-full">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col w-full">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-lg whitespace-nowrap truncate max-w-[160px]">{eventName}</CardTitle>
            {isAdmin && !editingEventName && (
              <Button size="xs" variant="outline" onClick={() => setEditingEventName(true)}>
                ערוך שם אירוע
              </Button>
            )}
            {isAdmin && editingEventName && (
              <form onSubmit={e => { e.preventDefault(); setEditingEventName(false); }} className="flex gap-2">
                <Input value={eventName} onChange={e => setEventName(e.target.value)} size="sm" />
                <Button size="xs" type="submit">שמור</Button>
              </form>
            )}
          </div>
          <div className="flex w-full mt-2 mb-1">
            <Button size="xs" onClick={() => setShowAddEventModal(true)} className="w-full sm:w-auto">
              + עדכון
            </Button>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
          <Button size="xs" variant="outline" disabled>
            <Upload className="inline-block mr-1" size={14} /> ייבוא אירוע
          </Button>
          <Button size="xs" variant="outline" onClick={handleToggleView}>
            {isFullView ? "תצוגה מוקטנת" : "תצוגה מלאה"}
          </Button>
          <Button size="xs" onClick={toggleBlockOrder} title="שנה מיקום בלוק">
            מיקום: {blockOrder}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-y-auto max-h-[70vh] p-2 bg-gray-50 space-y-3">
          {displayEvents.map(event => {
            const isExpanded = expandedId === event.id;
            const isEditing = editingId === event.id;
            const linkedTasks = allTasks.filter(t => t.eventId === event.id);
            const pendingCount = linkedTasks.filter(t => !t.done && (t.status === 'מחכה' || !t.status)).length;
            const inProgressCount = linkedTasks.filter(t => !t.done && t.status === 'בטיפול').length;
            const doneCount = linkedTasks.filter(t => t.done || t.status === 'טופל').length;
            const hasLinkedTasks = linkedTasks.length > 0;

            return (
              <div key={event.id} className="rounded-lg border bg-white shadow-md overflow-hidden">
                {/* Card body */}
                <div className="p-3">
                  <div className="flex items-start gap-3">
                    {/* Left: chevron + status bar + task dots */}
                    <div className="relative flex flex-col items-center gap-1.5 pt-0.5 flex-shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : event.id)}
                        className="hover:bg-gray-100 rounded p-0.5 -mt-0.5"
                        aria-label={isExpanded ? 'סגור פרטים' : 'פתח פרטים'}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-gray-500" />
                          : <ChevronLeft className="h-4 w-4 text-gray-500" />}
                      </button>
                      <span
                        className={`inline-block w-2.5 h-9 rounded-full shadow-sm ${statusColors[event.status] || 'bg-gray-300'}`}
                        title={`סטטוס: ${event.status || 'ללא'}`}
                      />
                      {hasLinkedTasks && (
                        <div className="flex flex-col gap-1 mt-1">
                          {pendingCount > 0 && <div className="w-2 h-2 rounded-full bg-red-500 shadow-sm" title={`${pendingCount} משימות מחכות`} />}
                          {inProgressCount > 0 && <div className="w-2 h-2 rounded-full bg-orange-500 shadow-sm" title={`${inProgressCount} משימות בטיפול`} />}
                          {doneCount > 0 && <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm" title={`${doneCount} משימות טופלו`} />}
                        </div>
                      )}
                    </div>

                    {/* Right: content */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        /* ── Inline edit mode ── */
                        <div className="space-y-2">
                          <Input
                            value={editFields.description}
                            onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
                            className="text-sm h-8"
                            placeholder="תיאור האירוע"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={editFields.reporter}
                              onChange={e => setEditFields(f => ({ ...f, reporter: e.target.value }))}
                              className="text-sm h-8"
                              placeholder="המדווח"
                            />
                            <Input
                              value={editFields.recipient}
                              onChange={e => setEditFields(f => ({ ...f, recipient: e.target.value }))}
                              className="text-sm h-8"
                              placeholder="מקבל הדיווח"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={editFields.department} onValueChange={v => setEditFields(f => ({ ...f, department: v }))}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="מחלקה" /></SelectTrigger>
                              <SelectContent>{departmentOptions.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={editFields.status} onValueChange={v => setEditFields(f => ({ ...f, status: v }))}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="סטטוס" /></SelectTrigger>
                              <SelectContent>{["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="flex gap-2 justify-end pt-1">
                            <Button size="sm" onClick={() => saveEdit(event)}>שמור</Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>ביטול</Button>
                          </div>
                        </div>
                      ) : (
                        /* ── Normal view mode ── */
                        <>
                          {/* Title row: description */}
                          <div className="min-w-0">
                            <div className={`font-semibold text-gray-900 ${isFullView ? '' : 'truncate'}`} title={event.description}>
                              {event.description || <span className="text-gray-400 italic">ללא תיאור</span>}
                            </div>
                            {event.link && (
                              <a
                                href={event.link.startsWith('http') ? event.link : `https://${event.link}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline flex items-center gap-1 mt-0.5 text-[10px]"
                              >
                                <Link size={10} /> קישור חיצוני
                              </a>
                            )}
                          </div>

                          {/* Reporter → Recipient */}
                          <div className="text-xs text-gray-600 mt-1 truncate">
                            <span className="font-semibold">מדווח:</span> {event.reporter || '—'}
                            {' '}<span className="text-gray-400">→</span>{' '}
                            <span className="font-semibold">מקבל:</span> {event.recipient || '—'}
                          </div>

                          {/* Date + dept badge */}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500">
                              {isFullView ? formatDateTime(event.createdAt) : formatDateTime(event.createdAt).split(' ')[0]}
                            </span>
                            {event.department && (
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${getDepartmentBadgeColor(event.department)}`}>
                                {event.department}
                              </span>
                            )}
                            {isFullView && event.lastUpdater && (
                              <span className="text-[11px] text-gray-400 truncate">
                                <span className="font-semibold">עודכן ע״י:</span> {event.lastUpdater}
                              </span>
                            )}
                          </div>

                          {/* Task count tags */}
                          {hasLinkedTasks && (pendingCount > 0 || inProgressCount > 0) && (
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {pendingCount > 0 && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded border border-red-200">
                                  {pendingCount} מחכות
                                </span>
                              )}
                              {inProgressCount > 0 && (
                                <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded border border-orange-200">
                                  {inProgressCount} בטיפול
                                </span>
                              )}
                            </div>
                          )}

                          {/* Edit button */}
                          <div className="mt-3">
                            <button
                              onClick={e => { e.stopPropagation(); startEdit(event); }}
                              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                              title="ערוך אירוע"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded panel */}
                {isExpanded && !isEditing && (
                  <div className="border-t bg-gray-50 p-3 space-y-4">
                    {/* History */}
                    <div>
                      <div className="font-semibold text-sm mb-2">היסטוריית עדכונים:</div>
                      <ul className="space-y-1.5 max-h-40 overflow-y-auto border rounded p-2 bg-white">
                        {(event.history || []).length === 0 && (
                          <li className="text-xs text-gray-500 text-center py-2">אין עדכונים.</li>
                        )}
                        {(event.history || []).map((c, idx) => (
                          <li key={idx} className="text-xs bg-gray-50 p-1.5 border rounded">
                            <div className="font-semibold text-gray-700">{formatDateTime(c.timestamp)}</div>
                            <div className="text-gray-800">{c.text}</div>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2 mt-2">
                        <Textarea
                          className="text-sm"
                          rows={2}
                          value={addUpdateText}
                          onChange={e => setAddUpdateText(e.target.value)}
                          placeholder="כתוב עדכון..."
                        />
                        <Button size="sm" onClick={() => addUpdate(event)}>הוסף עדכון</Button>
                      </div>
                    </div>

                    {/* Linked tasks */}
                    <div>
                      <div className="font-semibold text-sm mb-2">משימות מקושרות לאירוע זה:</div>
                      <ul className="space-y-2">
                        {linkedTasks.length === 0 && (
                          <li className="text-xs text-gray-500">אין משימות מקושרות.</li>
                        )}
                        {linkedTasks.map(task => (
                          <li key={task.id} className="flex items-center gap-2 border rounded p-2 bg-white">
                            <div className={`w-2 h-6 rounded flex-shrink-0 ${statusColors[task.status] || 'bg-gray-300'}`} />
                            <div className="flex-grow min-w-0">
                              <div className="font-bold text-sm truncate">{task.title}</div>
                              <div className="text-xs text-gray-600">
                                <span className="font-semibold">עדיפות:</span> {task.priority}
                                {' · '}
                                <span className="font-semibold">מחלקה:</span> {task.category}
                                {' · '}
                                <span className="font-semibold">סטטוס:</span> {task.status}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Footer: status + task button — right side (RTL start) */}
                    <div className="flex items-center justify-start pt-1 border-t gap-2">
                      <span className="text-xs font-semibold">סטטוס אירוע:</span>
                      <Select value={event.status || "מחכה"} onValueChange={(newStatus) => handleEventStatusChange(event.id, newStatus)}>
                        <SelectTrigger className={`h-6 text-xs font-semibold ${
                          event.status === 'מחכה' ? 'bg-red-500/50 border-red-400' :
                          event.status === 'בטיפול' ? 'bg-orange-500/50 border-orange-400' :
                          event.status === 'טופל' ? 'bg-green-500/50 border-green-400' :
                          'bg-gray-200/50'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={() => openTaskModal(event)}>שלח משימה</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Add Event Modal */}
        {showAddEventModal && (
          <Dialog open={showAddEventModal} onOpenChange={setShowAddEventModal}>
            <DialogContent className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" style={{ direction: 'rtl', textAlign: 'right' }}>
              <DialogHeader className="text-right">
                <DialogTitle className="text-lg font-bold mb-4 text-right">הוסף אירוע חדש</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddEvent} className="space-y-4">
                <Input placeholder="המדווח" value={form.reporter} onChange={e => setForm(f => ({ ...f, reporter: e.target.value }))} className="text-right" />
                <Input placeholder="מקבל הדיווח" value={form.recipient} onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))} className="text-right" />
                <Textarea placeholder="תיאור האירוע" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="text-right" />
                <div className="relative">
                  <Input 
                    placeholder="קישור (אופציונלי)" 
                    value={form.link} 
                    onChange={e => setForm(f => ({ ...f, link: e.target.value }))} 
                    className="text-right pr-10" 
                  />
                  <Link className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                </div>
                <Select value={form.department} onValueChange={val => setForm(f => ({ ...f, department: val }))}>
                  <SelectTrigger className="text-right"><SelectValue placeholder="בחר מחלקה" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val }))}>
                  <SelectTrigger className="text-right"><SelectValue placeholder="בחר סטטוס" /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(statusColors).map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowAddEventModal(false)} className="ml-2">ביטול</Button>
                  <Button type="submit">הוסף אירוע</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        {/* Assign Task Modal */}
        <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
          <DialogContent className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full" style={{ direction: 'rtl', textAlign: 'right' }}>
            <DialogHeader className="text-right">
              <DialogTitle className="text-lg font-bold mb-4 text-right">צור משימה חדשה למחלקה</DialogTitle>
            </DialogHeader>
            <div className="mb-2">
              <Label className="block mb-1">עדיפות</Label>
              <Select value={taskPriority} onValueChange={setTaskPriority}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                <SelectContent>{["דחוף", "רגיל", "נמוך"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="mb-2">
              <Label className="block mb-1">מחלקה</Label>
              <Select value={taskDepartment} onValueChange={setTaskDepartment}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                <SelectContent>{departmentOptions.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="mb-2">
              <Label className="block mb-1">סטטוס</Label>
                              <Select value={taskStatus} onValueChange={setTaskStatus}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                  <SelectContent>{["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div className="mb-2">
              <Label className="block mb-1">תיאור</Label>
              <Input value={taskEvent?.description || ""} readOnly className="h-8 text-sm bg-gray-100" />
            </div>
            <DialogFooter className="flex justify-end gap-2 mt-4">
              <Button onClick={createTask}>צור משימה</Button>
              <Button variant="outline" onClick={() => setShowTaskModal(false)}>ביטול</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default EventLogBlock; 