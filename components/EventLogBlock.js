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
import { Search, ChevronDown, Upload, ChevronLeft, ChevronRight, Flame } from "lucide-react";
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
  const [taskStatus, setTaskStatus] = useState("פתוח");
  const [userFullName, setUserFullName] = useState("");

  // Add event form state
  const [form, setForm] = useState({
    reporter: "",
    recipient: "",
    description: "",
    department: "",
    status: "מחכה",
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
      await addDoc(collection(db, "eventLogs"), eventData);
      console.log("Event log created successfully");

      // Notify users in the assigned department
      await notifyUsersInDepartment(form.department, {
        message: `אירוע חדש ביומן: ${form.description}`,
        type: 'event',
        subType: 'newEvent',
        link: `/`
      });

      setForm({ reporter: "", recipient: userFullName || alias || "", description: "", department: "", status: "מחכה" });
      setShowAddEventModal(false);
    } catch (error) {
      console.error("Error creating event log:", error);
      console.error("Error details:", {
        code: error.code,
        message: error.message,
        data: eventData
      });
      // You might want to show an error message to the user here
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
      await notifyUsersInDepartment(eventData.department, {
        message: `סטטוס אירוע התעדכן: ${eventData.description} - ${newStatus}`,
        type: 'event',
        subType: 'statusChange',
        link: `/`
      });

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
    setTaskStatus("פתוח");
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
        await notifyUsersInDepartment(taskDepartment, {
          message: `משימה חדשה מאירוע: ${taskEvent.description || ''}`,
          type: 'task',
          subType: 'created',
          link: `/`
        });
        
        toast({
          title: "Success",
          description: "המשימה נוצרה בהצלחה",
        });
      }
      
      setShowTaskModal(false);
      setTaskEvent(null);
      setTaskStatus("פתוח");
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
            <Button size="xs" onClick={() => setShowAddEventModal(true)} className="bg-blue-200 text-blue-900 hover:bg-blue-300 border-blue-200 w-full sm:w-auto">
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
      <CardContent className={`p-0 ${!isFullView ? 'overflow-hidden' : 'overflow-x-auto'}`}>
        <table className={`w-full text-sm border-collapse ${!isFullView ? 'table-auto' : 'table-fixed'}`}>
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              <th className="w-2"></th>
              {isFullView ? (
                <>
                  <th className="px-2 py-2 text-right font-semibold w-32">תאריך</th>
                  <th className="px-2 py-2 text-right font-semibold w-32">המדווח</th>
                  <th className="px-2 py-2 text-right font-semibold w-32">מקבל הדיווח</th>
                  <th className="px-2 py-2 text-right font-semibold">תיאור האירוע</th>
                  <th className="px-2 py-2 text-right font-semibold w-32">מחלקה</th>
                  <th className="px-2 py-2 text-right font-semibold w-24">סטטוס</th>
                  <th className="px-2 py-2 text-right font-semibold w-32">מעדכן אחרון</th>
                  <th className="px-2 py-2 text-right font-semibold w-24">פעולות</th>
                </>
              ) : (
                <>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-20">תאריך</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-16">מדווח</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-16">מקבל</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-24">תיאור</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-16">מחלקה</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-16">סטטוס</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-16">מעדכן</th>
                  <th className="px-1 py-2 text-right font-semibold text-xs w-12">פעולות</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayEvents.map(event => (
              <React.Fragment key={event.id}>
                <tr className="border-b hover:bg-gray-50 group">
                  <td className="px-1 align-top">
                    <div className={`w-2 h-8 rounded ${statusColors[event.status] || 'bg-gray-300'}`}></div>
                  </td>
                  {editingId === event.id ? (
                    <>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>{formatDateTime(event.createdAt)}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}><Input value={editFields.reporter} onChange={e => setEditFields(f => ({ ...f, reporter: e.target.value }))} className="h-8 text-sm" /></td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}><Input value={editFields.recipient} onChange={e => setEditFields(f => ({ ...f, recipient: e.target.value }))} className="h-8 text-sm" /></td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}><Input value={editFields.description} onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))} className="h-8 text-sm" /></td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>
                        <Select value={editFields.department} onValueChange={v => setEditFields(f => ({ ...f, department: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                          <SelectContent>{departmentOptions.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>
                        <Select value={editFields.status} onValueChange={v => setEditFields(f => ({ ...f, status: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="בחר..." /></SelectTrigger>
                          <SelectContent>{["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>{event.lastUpdater}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>
                        <Button size="sm" onClick={() => saveEdit(event)}>שמור</Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit}>ביטול</Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top ${isFullView ? 'whitespace-nowrap' : 'text-xs'}`}>{isFullView ? formatDateTime(event.createdAt) : formatDateTime(event.createdAt).split(' ')[1]}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top ${!isFullView ? 'text-xs truncate' : ''}`} title={event.reporter}>{event.reporter}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top ${!isFullView ? 'text-xs truncate' : ''}`} title={event.recipient}>{event.recipient}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top ${!isFullView ? 'text-xs' : ''} truncate`} title={event.description}>{event.description}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top ${!isFullView ? 'text-xs' : ''}`}>{event.department}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>
                        <Select value={event.status || "מחכה"} onValueChange={(newStatus) => handleEventStatusChange(event.id, newStatus)}>
                          <SelectTrigger className={`${isFullView ? 'h-6 text-xs' : 'h-5 text-xs'} border-0 p-0 bg-transparent`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top ${!isFullView ? 'text-xs truncate' : ''}`} title={event.lastUpdater}>{event.lastUpdater}</td>
                      <td className={`${isFullView ? 'px-2' : 'px-1'} py-2 align-top`}>
                        <Button size="icon" variant="ghost" className={`${isFullView ? 'w-6 h-6' : 'w-4 h-4'} text-gray-500 hover:text-blue-600`} title="ערוך" onClick={() => startEdit(event)}><span role="img" aria-label="Edit">✎</span></Button>
                        <Button size="icon" variant="ghost" className={`${isFullView ? 'w-6 h-6' : 'w-4 h-4'} text-blue-600 hover:text-blue-700`} title="הרחב" onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}><span role="img" aria-label="Expand">{expandedId === event.id ? '🔽' : '▶️'}</span></Button>
                      </td>
                    </>
                  )}
                </tr>
                {expandedId === event.id && (
                  <tr className="border-b bg-blue-50">
                    <td colSpan={9} className="p-4">
                      <div className="mb-2 font-semibold text-sm">היסטוריית עדכונים:</div>
                      <ul className="space-y-1.5 max-h-40 overflow-y-auto border rounded p-2 bg-white">
                        {(event.history || []).length === 0 && <li className="text-xs text-gray-500 text-center py-2">אין עדכונים.</li>}
                        {(event.history || []).map((c, idx) => (
                          <li key={idx} className="text-xs bg-gray-50 p-1.5 border rounded">
                            <div className="font-semibold text-gray-700">{formatDateTime(c.timestamp)}</div>
                            <div className="text-gray-800">{c.text}</div>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2 mt-3">
                        <Textarea className="text-sm" rows={2} value={addUpdateText} onChange={e => setAddUpdateText(e.target.value)} placeholder="כתוב עדכון..." />
                        <Button size="sm" onClick={() => addUpdate(event)}>הוסף עדכון</Button>
                      </div>
                      {/* Linked tasks for this event */}
                      <div className="mt-6">
                        <div className="font-semibold text-sm mb-2">משימות מקושרות לאירוע זה:</div>
                        <ul className="space-y-2">
                          {allTasks.filter(t => t.eventId === event.id).length === 0 && (
                            <li className="text-xs text-gray-500">אין משימות מקושרות.</li>
                          )}
                          {allTasks.filter(t => t.eventId === event.id).map(task => (
                            <li key={task.id} className="flex items-center gap-2 border rounded p-2 bg-white">
                              <div className={`w-2 h-6 rounded ${statusColors[task.status] || 'bg-gray-300'}`}></div>
                              <div className="flex-grow">
                                <div className="font-bold text-sm">{task.title}</div>
                                <div className="text-xs text-gray-600">{task.priority} | {task.category} | {task.status}</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-2 mt-4 justify-end">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">סטטוס אירוע:</span>
                          <Select value={event.status || "מחכה"} onValueChange={(newStatus) => handleEventStatusChange(event.id, newStatus)}>
                            <SelectTrigger className="h-6 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {["מחכה", "בטיפול", "טופל"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openTaskModal(event)}>שלח משימה</Button>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
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
                  <Button type="submit" className="bg-blue-600 text-white hover:bg-blue-700">הוסף אירוע</Button>
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
                  <SelectContent>{["פתוח", "בטיפול", "הושלם"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
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