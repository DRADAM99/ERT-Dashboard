import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';

const TASK_CATEGORIES = [
  'חמ"ל', 'אוכלוסיה', 'לוגיסטיקה', 'רפואה', 'חינוך', 'חוסן', 'ראשי צח"י', 'אחר'
];
const TASK_PRIORITIES = ['דחוף', 'רגיל', 'נמוך'];

function TaskCard({ task, onToggleDone }) {
  return (
    <div className={`bg-white rounded shadow p-2 mb-2 border border-gray-200 ${task.done ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{task.title}</span>
        <Checkbox checked={task.done} onChange={() => onToggleDone(task)} />
      </div>
      <div className="text-xs text-gray-600">{task.subtitle}</div>
      <div className="text-xs">סטטוס: <span className={task.status === 'בוצע' ? 'text-green-600' : 'text-red-600'}>{task.status}</span></div>
      <div className="text-xs">אחראי: {task.assignTo}</div>
      <div className="text-xs">עדיפות: {task.priority}</div>
      <div className="text-xs">תאריך יעד: {task.dueDate ? new Date(task.dueDate).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}</div>
    </div>
  );
}

export default function TaskManager() {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({
    title: '',
    subtitle: '',
    priority: 'רגיל',
    category: TASK_CATEGORIES[0],
    assignTo: '',
    dueDate: '',
    status: 'ממתין',
    done: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewTask(t => ({ ...t, [name]: value }));
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title) return;
    await addDoc(collection(db, 'tasks'), {
      ...newTask,
      createdAt: serverTimestamp(),
      done: false,
    });
    setNewTask({
      title: '', subtitle: '', priority: 'רגיל', category: TASK_CATEGORIES[0], assignTo: '', dueDate: '', status: 'ממתין', done: false
    });
  };

  const handleToggleDone = async (task) => {
    await updateDoc(doc(db, 'tasks', task.id), { done: !task.done });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Kanban Columns */}
      {TASK_CATEGORIES.map(cat => (
        <div key={cat} className="bg-gray-50 rounded-lg p-2 min-h-[200px]">
          <div className="font-bold mb-2 text-center">{cat}</div>
          {tasks.filter(t => t.category === cat).length === 0 ? (
            <div className="text-xs text-gray-400 text-center">אין משימות</div>
          ) : (
            tasks.filter(t => t.category === cat).map(task => (
              <TaskCard key={task.id} task={task} onToggleDone={handleToggleDone} />
            ))
          )}
        </div>
      ))}
      {/* Add Task Form */}
      <form onSubmit={handleAddTask} className="col-span-1 md:col-span-4 bg-white rounded-lg shadow p-4 mt-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <Input name="title" value={newTask.title} onChange={handleInputChange} placeholder="כותרת משימה" required />
          <Input name="subtitle" value={newTask.subtitle} onChange={handleInputChange} placeholder="פירוט" />
        </div>
        <div className="flex gap-2">
          <select name="category" value={newTask.category} onChange={handleInputChange} className="rounded border px-2 py-1">
            {TASK_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select name="priority" value={newTask.priority} onChange={handleInputChange} className="rounded border px-2 py-1">
            {TASK_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <Input name="assignTo" value={newTask.assignTo} onChange={handleInputChange} placeholder="אחראי" />
          <Input name="dueDate" value={newTask.dueDate} onChange={handleInputChange} type="datetime-local" />
        </div>
        <Button type="submit" variant="primary">הוסף משימה</Button>
      </form>
    </div>
  );
} 