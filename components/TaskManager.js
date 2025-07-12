"use client";

import React, { useState, useEffect, useCallback } from "react";
import { collection, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Edit2, MessageSquare, Bell } from "lucide-react";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

// Task Categories and Priorities
const TASK_CATEGORIES = ["לקבוע סדרה", "דוחות", "תשלומים", "להתקשר", "תוכנית טיפול", "אחר"];
const TASK_PRIORITIES = ["דחוף", "רגיל", "נמוך"];

// Utility Functions
const formatTaskAge = (createdAt) => {
  if (!createdAt) return "";
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now - created;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins} דקות`;
  if (diffHours < 24) return `${diffHours} שעות`;
  return `${diffDays} ימים`;
};

const isTaskOverdue = (task) => {
  if (task.done) return false;
  const now = new Date();
  const due = new Date(task.dueDate);
  return due < now;
};

const ReplySection = ({ task, currentUser, onReply }) => {
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setIsReplying(true);
    try {
      await onReply(task.id, replyText);
      setReplyText('');
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="space-y-4">
        {task.replies?.map((reply, index) => (
          <div 
            key={index} 
            className={`p-3 rounded-lg ${
              !reply.isRead && reply.userId !== currentUser.uid 
                ? 'bg-blue-50 border border-blue-200' 
                : 'bg-gray-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{reply.userAlias}</span>
                  <span className="text-sm text-gray-500">
                    {formatDateTime(reply.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-sm">{reply.text}</p>
              </div>
              {!reply.isRead && reply.userId !== currentUser.uid && (
                <span className="text-xs text-blue-500">New</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="flex gap-2">
          <Input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply..."
            className="flex-1"
            disabled={isReplying}
          />
          <Button type="submit" disabled={isReplying}>
            {isReplying ? "Sending..." : "Reply"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default function TaskManager({ currentUser, alias, users, department }) {
  // State Variables
  const [tasks, setTasks] = useState([]);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [taskSearchTerm, setTaskSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Task Creation State
  const [newTask, setNewTask] = useState({
    title: "",
    subtitle: "",
    priority: "רגיל",
    category: TASK_CATEGORIES[0],
    assignTo: "",
    dueDate: "",
    dueTime: ""
  });

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
          // Updated filtering logic:
          const filteredTasks = showDoneTasks 
            ? newTasks 
            : newTasks.filter(task => !task.done);
          // Show if:
          // - user is creator
          // - assigned to user (alias/email)
          // - assigned to user's department (if assignTo is empty)
          const userIdentifiers = [currentUser.uid, currentUser.email, currentUser.alias, alias].filter(Boolean);
          const visibleTasks = filteredTasks.filter(task => {
            const isCreator = task.userId === currentUser.uid || task.creatorId === currentUser.uid;
            const isAssignee = userIdentifiers.some(identifier => task.assignTo === identifier);
            const isDeptTask = !task.assignTo && department && task.department === department;
            return isCreator || isAssignee || isDeptTask;
          });
          setTasks(visibleTasks);
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
  }, [currentUser, showDoneTasks, alias, department]);

  // Task Handlers
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const taskRef = doc(collection(db, "tasks"));
      const now = new Date();
      const dueDateTime = newTask.dueDate && newTask.dueTime
        ? new Date(`${newTask.dueDate}T${newTask.dueTime}`)
        : now;

      const taskData = {
        id: taskRef.id,
        userId: currentUser.uid,
        creatorId: currentUser.uid,
        creatorAlias: alias || currentUser.email,
        assignTo: newTask.assignTo || alias || currentUser.email,
        title: newTask.title,
        subtitle: newTask.subtitle,
        priority: newTask.priority,
        category: newTask.category,
        status: "פתוח",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        dueDate: dueDateTime,
        replies: [],
        isRead: false,
        isArchived: false,
        done: false,
        completedBy: null,
        completedAt: null,
        nudges: []
      };

      await setDoc(taskRef, taskData);
      
      // Reset form
      setNewTask({
        title: "",
        subtitle: "",
        priority: "רגיל",
        category: TASK_CATEGORIES[0],
        assignTo: "",
        dueDate: "",
        dueTime: ""
      });
      setShowTaskModal(false);
    } catch (error) {
      console.error("Error creating task:", error);
      alert("שגיאה ביצירת המשימה. נסה שוב.");
    }
  };

  const handleTaskReply = async (taskId, replyText) => {
    if (!currentUser || !replyText.trim()) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const now = new Date();
      
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
        title: "Reply Sent",
        description: "Your reply has been sent successfully",
      });
    } catch (error) {
      console.error('Error adding reply:', error);
      toast({
        title: "Error",
        description: "Failed to send reply",
        variant: "destructive"
      });
    }
  };

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

      // Create a notification for the assignee
      const taskDoc = await getDoc(taskRef);
      const taskData = taskDoc.data();
      
      if (taskData.assignee !== currentUser.uid) {
        const notificationRef = doc(collection(db, 'notifications'));
        await setDoc(notificationRef, {
          type: 'task_nudge',
          taskId: taskId,
          taskTitle: taskData.title,
          senderId: currentUser.uid,
          senderAlias: alias || currentUser.email,
          recipientId: taskData.assignee,
          createdAt: now,
          isRead: false
        });
      }

      toast({
        title: "Nudge Sent",
        description: "A reminder has been sent to the task assignee",
      });
    } catch (error) {
      console.error('Error nudging task:', error);
      toast({
        title: "Error",
        description: "Failed to send nudge",
        variant: "destructive"
      });
    }
  };

  const handleToggleTaskDone = async (taskId, checked) => {
    if (!currentUser) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const now = new Date();
      
      // Get current task data
      const taskDoc = await getDoc(taskRef);
      const taskData = taskDoc.data();
      
      // Prepare update data
      const updateData = {
        done: checked,
        completedAt: checked ? now : null,
        completedBy: checked ? (alias || currentUser.email) : null,
        updatedAt: now
      };

      // Add to history if status changed
      if (taskData.done !== checked) {
        updateData.history = arrayUnion({
          type: 'status_change',
          from: taskData.done ? 'completed' : 'pending',
          to: checked ? 'completed' : 'pending',
          timestamp: now,
          user: alias || currentUser.email
        });
      }

      await updateDoc(taskRef, updateData);

      // Show success notification
      toast({
        title: checked ? "Task Completed" : "Task Reopened",
        description: `Task has been ${checked ? 'marked as completed' : 'reopened'}`,
      });
    } catch (error) {
      console.error('Error toggling task:', error);
      toast({
        title: "Error",
        description: "Failed to update task status",
        variant: "destructive"
      });
    }
  };

  // Render Functions
  const renderTask = (task) => {
    const isAssignedToMe = task.assignTo === (alias || currentUser.email);
    const isCreatedByMe = task.creatorId === currentUser.uid;
    const hasUnreadReplies = task.replies?.some(reply => 
      !reply.isRead && reply.userId !== currentUser.uid
    );
    const hasUnreadNudges = task.nudges?.some(nudge => 
      nudge.userId !== currentUser.uid
    );

    return (
      <div className={`p-4 border rounded-lg mb-2 ${hasUnreadReplies ? 'bg-green-50' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={task.done}
                onCheckedChange={(checked) => handleToggleTaskDone(task.id, checked)}
              />
              <div className={`flex-1 ${task.done ? 'line-through' : ''}`}>
                <h3 className="font-medium">{task.title}</h3>
                {task.subtitle && <p className="text-sm text-gray-600">{task.subtitle}</p>}
              </div>
            </div>
            
            <div className="mt-2 text-sm text-gray-500">
              <p>עבור: {task.assignTo}</p>
              <p>נוצר ע&quot;י: {task.creatorAlias}</p>
              <p>קטגוריה: {task.category}</p>
              <p>עדיפות: {task.priority}</p>
              <p>תאריך יעד: {task.dueDate?.toLocaleDateString()}</p>
            </div>

            {task.replies?.length > 0 && (
              <ReplySection task={task} currentUser={currentUser} onReply={handleTaskReply} />
            )}
          </div>

          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" size="icon" onClick={() => setEditingTask(task)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>ערוך משימה</TooltipContent>
            </Tooltip>

            {isAssignedToMe && !isCreatedByMe && (
              <Tooltip>
                <TooltipTrigger>
                  <Button variant="ghost" size="icon" onClick={() => handleTaskReply(task.id, prompt('הזן תגובה:'))}>
                    <MessageSquare className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>הגב למשימה</TooltipContent>
              </Tooltip>
            )}

            {isCreatedByMe && !isAssignedToMe && (
              <Tooltip>
                <TooltipTrigger>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleNudgeTask(task.id)}
                    className={hasUnreadNudges ? 'text-yellow-500' : ''}
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>שלח תזכורת</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-400 text-right">
          {formatTaskAge(task.createdAt)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">מנהל משימות</h2>
        <div className="flex items-center gap-2">
          <Input
            placeholder="חיפוש משימות..."
            value={taskSearchTerm}
            onChange={(e) => setTaskSearchTerm(e.target.value)}
            className="w-64"
          />
          <Button onClick={() => setShowTaskModal(true)}>
            משימה חדשה
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="בחר קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                {TASK_CATEGORIES.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Checkbox
                id="showDoneTasks"
                checked={showDoneTasks}
                onCheckedChange={setShowDoneTasks}
              />
              <Label htmlFor="showDoneTasks">הצג משימות שבוצעו</Label>
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter}>
            <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <div className="text-center p-8 text-gray-500">
                    No tasks found
                  </div>
                ) : (
                  tasks.map(task => renderTask(task))
                )}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>משימה חדשה</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-4">
            <div>
              <Label>כותרת</Label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>תיאור</Label>
              <Textarea
                value={newTask.subtitle}
                onChange={(e) => setNewTask(prev => ({ ...prev, subtitle: e.target.value }))}
              />
            </div>
            <div>
              <Label>הקצה ל</Label>
              <Select
                value={newTask.assignTo}
                onValueChange={(value) => setNewTask(prev => ({ ...prev, assignTo: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר משתמש" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.alias || user.email}>
                      {user.alias || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>עדיפות</Label>
              <Select
                value={newTask.priority}
                onValueChange={(value) => setNewTask(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר עדיפות" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map(priority => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>קטגוריה</Label>
              <Select
                value={newTask.category}
                onValueChange={(value) => setNewTask(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>תאריך יעד</Label>
                <Input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label>שעה</Label>
                <Input
                  type="time"
                  value={newTask.dueTime}
                  onChange={(e) => setNewTask(prev => ({ ...prev, dueTime: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">צור משימה</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 