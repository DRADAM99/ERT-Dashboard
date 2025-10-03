import React, { useState, useEffect, useMemo } from 'react';
import { db } from "../firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { X, UserCheck, UserX, AlertTriangle, HelpCircle, Activity, Clock, Zap, CheckCircle, Filter, Rows, Columns, ZoomIn, ZoomOut } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const statusConfig = {
    'הכל בסדר': { icon: <UserCheck className="h-5 w-5 text-green-500" />, color: 'bg-green-500' },
    'זקוקים לסיוע': { icon: <UserX className="h-5 w-5 text-red-500" />, color: 'bg-red-500' },
    'לא בטוח': { icon: <AlertTriangle className="h-5 w-5 text-orange-500" />, color: 'bg-orange-500' },
    'פצוע': { icon: <Activity className="h-5 w-5 text-purple-500" />, color: 'bg-purple-500' },
    'ללא סטטוס': { icon: <HelpCircle className="h-5 w-5 text-gray-500" />, color: 'bg-gray-500' },
};

const formatDuration = (ms) => {
    if (typeof ms !== 'number' || ms < 0 || isNaN(ms)) return "N/A";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} ${days === 1 ? 'יום' : 'ימים'}`;
    if (hours > 0) return `${hours} ${hours === 1 ? 'שעה' : 'שעות'}`;
    if (minutes > 0) return `${minutes} ${minutes === 1 ? 'דקה' : 'דקות'}`;
    return "< דקה";
};

const formatDateTime = (ts) => {
    if (!ts) return "";
    let date = ts;
    if (ts.seconds) date = new Date(ts.seconds * 1000);
    else if (typeof ts === 'string' || typeof ts === 'number') date = new Date(ts);
    
    if (isNaN(date.getTime())) return "";
    
    return date.toLocaleDateString("he-IL", {day: '2-digit', month: '2-digit'}) + " " + date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false });
};

const EventStatus = ({ onClose }) => {
    // 4. Ticking Clock
    const [timeElapsed, setTimeElapsed] = useState("00:00:00");
    const [residents, setResidents] = useState([]);
    const [statusCounts, setStatusCounts] = useState({});
    const [totalResidents, setTotalResidents] = useState(0);
    const [tasks, setTasks] = useState([]);
    const [tasksSummary, setTasksSummary] = useState({
        categories: {},
        avgCompletionTime: 0,
        avgResponseTime: 0,
    });
    const [eventLogs, setEventLogs] = useState([]);
    const [summary, setSummary] = useState({
        current: "ממתין לנתונים...",
        history: [],
    });
    const [timelineEvents, setTimelineEvents] = useState([]);
    const [timelineFilters, setTimelineFilters] = useState({
        resident_status: true,
        task_created: true,
        task_done: true,
        log_update: true,
    });
    const [timelineLayout, setTimelineLayout] = useState('vertical');
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [timelineZoom, setTimelineZoom] = useState(1);
    
    const injuredResidents = useMemo(() => {
        return residents.filter(r => r['סטטוס'] === 'פצוע');
    }, [residents]);

    // Fetch residents data
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "residents"), (snap) => {
            const residentsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setResidents(residentsData);
            setTotalResidents(snap.size);
        });
        return () => unsub();
    }, []);

    // Fetch tasks data
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "tasks"), (snap) => {
            const tasksData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTasks(tasksData);
        });
        return () => unsub();
    }, []);

    // Fetch event logs data for summary
    useEffect(() => {
        const eventLogsQuery = query(collection(db, "eventLogs"), orderBy("createdAt", "asc"));
        const unsub = onSnapshot(eventLogsQuery, (snap) => {
            const logs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEventLogs(logs);
        });
        return () => unsub();
    }, []);

    // Calculate status counts
    useEffect(() => {
        const counts = {
            'הכל בסדר': 0,
            'זקוקים לסיוע': 0,
            'לא בטוח': 0,
            'פצוע': 0,
            'ללא סטטוס': 0,
        };

        residents.forEach(resident => {
            let status = resident['סטטוס'];
            if (!status || status.trim() === '') {
                status = 'ללא סטטוס';
            }
            
            // Mapping from data source status to display status
            if (status === 'כולם בסדר') {
                status = 'הכל בסדר';
            }

            if (counts.hasOwnProperty(status)) {
                counts[status]++;
            }
        });
        setStatusCounts(counts);
    }, [residents]);

    // Calculate tasks summary
    useEffect(() => {
        const summary = {
            categories: {},
            avgCompletionTime: 0,
            avgResponseTime: 0,
        };

        const completionTimes = [];
        const responseTimes = [];
        
        tasks.forEach(task => {
            const category = task.category || "ללא קטגוריה";
            if (!summary.categories[category]) {
                summary.categories[category] = { open: 0, closed: 0 };
            }

            const createdAt = task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt);

            if (task.status === 'הושלם' || task.done) {
                summary.categories[category].closed++;
                const completedAt = task.completedAt?.toDate ? task.completedAt.toDate() : new Date(task.completedAt);
                if (completedAt && createdAt && !isNaN(completedAt.getTime()) && !isNaN(createdAt.getTime())) {
                    completionTimes.push(completedAt.getTime() - createdAt.getTime());
                }
            } else {
                summary.categories[category].open++;
            }
            
            if (task.replies && task.replies.length > 0) {
                const firstReply = task.replies.reduce((earliest, current) => {
                    const earliestTs = earliest.timestamp?.toDate ? earliest.timestamp.toDate() : new Date(earliest.timestamp);
                    const currentTs = current.timestamp?.toDate ? current.timestamp.toDate() : new Date(current.timestamp);
                    return earliestTs < currentTs ? earliest : current;
                });
                
                const firstReplyTs = firstReply.timestamp?.toDate ? firstReply.timestamp.toDate() : new Date(firstReply.timestamp);
                
                if (firstReplyTs && createdAt && !isNaN(firstReplyTs.getTime()) && !isNaN(createdAt.getTime())) {
                    responseTimes.push(firstReplyTs.getTime() - createdAt.getTime());
                }
            }
        });
        
        if (completionTimes.length > 0) {
            summary.avgCompletionTime = completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
        }
        
        if (responseTimes.length > 0) {
            summary.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }

        setTasksSummary(summary);
    }, [tasks]);
    
    // Generate Event Log Summary
    useEffect(() => {
        if (eventLogs.length === 0) {
            setSummary({ current: "לא נרשמו אירועים.", history: [] });
            return;
        }

        const firstEvent = eventLogs[0];
        const lastEvent = eventLogs[eventLogs.length - 1];

        const startTime = formatDateTime(firstEvent.createdAt);
        
        let narrative = `בשעה ${startTime.split(' ')[1]} הוכרז אירוע חירום. `;
        narrative += `הדיווח הראשוני היה: "${firstEvent.description || 'לא צוין תיאור'}". `;
        
        if (eventLogs.length > 1) {
            narrative += `עד כה נרשמו ${eventLogs.length} עדכונים. `;
            narrative += `העדכון האחרון (${formatDateTime(lastEvent.createdAt).split(' ')[1]}) מפי ${lastEvent.reporter || 'לא צוין'}, הוא: "${lastEvent.description || 'לא צוין תיאור'}" במצב "${lastEvent.status}".`;
        }

        setSummary(prev => {
            // Avoid adding duplicate summaries
            if (prev.current === narrative) {
                return prev;
            }
            return {
                current: narrative,
                history: [...prev.history, { text: prev.current, timestamp: new Date() }]
            }
        });

    }, [eventLogs]);

    // Aggregate data for timeline
    useEffect(() => {
        const events = [];

        // 1. Event log updates
        eventLogs.forEach(log => {
            if (!log.createdAt) return;
            events.push({
                id: `log-${log.id}`,
                timestamp: log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt),
                type: 'log_update',
                content: log.description || "עדכון ביומן",
                color: 'bg-blue-500',
                raw: log,
            });
        });

        // 2. Task creations and completions
        tasks.forEach(task => {
            if (task.createdAt) {
                events.push({
                    id: `task-created-${task.id}`,
                    timestamp: task.createdAt?.toDate ? task.createdAt.toDate() : new Date(task.createdAt),
                    type: 'task_created',
                    content: `משימה נוצרה: ${task.title}`,
                    color: 'bg-green-500',
                    raw: task,
                });
            }
            if (task.completedAt) {
                events.push({
                    id: `task-done-${task.id}`,
                    timestamp: task.completedAt?.toDate ? task.completedAt.toDate() : new Date(task.completedAt),
                    type: 'task_done',
                    content: `משימה הושלמה: ${task.title}`,
                    color: 'bg-purple-500',
                    raw: task,
                });
            }
        });

        // 3. Resident status changes
        residents.forEach(resident => {
            if (resident.statusHistory && Array.isArray(resident.statusHistory)) {
                resident.statusHistory.forEach((historyItem, index) => {
                    if (!historyItem.timestamp) return;
                    const residentName = `${resident['שם פרטי'] || ''} ${resident['שם משפחה'] || ''}`.trim();
                    events.push({
                        id: `resident-${resident.id}-${index}`,
                        timestamp: historyItem.timestamp?.toDate ? historyItem.timestamp.toDate() : new Date(historyItem.timestamp),
                        type: 'resident_status',
                        content: `סטטוס שונה ל-${residentName} ל-${historyItem.to || 'ללא סטטוס'}`,
                        color: 'bg-red-500',
                        raw: { ...historyItem, residentName },
                    });
                });
            }
        });

        // Sort all events by timestamp
        events.sort((a, b) => a.timestamp - b.timestamp);
        
        setTimelineEvents(events);

    }, [eventLogs, tasks, residents]);
    
    const filteredTimelineEvents = timelineEvents.filter(event => timelineFilters[event.type]);

    useEffect(() => {
        if (eventLogs.length === 0) {
            setTimeElapsed("00:00:00");
            return;
        }
    
        const startTime = eventLogs[0].createdAt?.toDate ? eventLogs[0].createdAt.toDate() : new Date(eventLogs[0].createdAt);
    
        if (isNaN(startTime.getTime())) {
            setTimeElapsed("00:00:00");
            return;
        }
        
        const interval = setInterval(() => {
            const now = new Date();
            const diff = now - startTime;
    
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)).toString().padStart(2, '0');
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
            const seconds = Math.floor((diff % (1000 * 60)) / 1000).toString().padStart(2, '0');
            
            let timeString = `${hours}:${minutes}:${seconds}`;
            if (days > 0) {
                timeString = `${days}d ${timeString}`;
            }

            setTimeElapsed(timeString);
        }, 1000);
    
        return () => clearInterval(interval);
    }, [eventLogs]);

    const renderEventDetails = (event) => {
        if (!event || !event.raw) return <p>אין פרטים להצגה.</p>;

        const { type, raw } = event;

        switch (type) {
            case 'log_update':
                return (
                    <div className="space-y-2 text-right">
                        <p><strong>תיאור:</strong> {raw.description}</p>
                        <p><strong>דווח על ידי:</strong> {raw.reporter}</p>
                        <p><strong>סטטוס:</strong> {raw.status}</p>
                    </div>
                );
            case 'task_created':
            case 'task_done':
                return (
                    <div className="space-y-2 text-right">
                        <p><strong>משימה:</strong> {raw.title}</p>
                        <p><strong>קטגוריה:</strong> {raw.category}</p>
                        <p><strong>סטטוס:</strong> {raw.status}</p>
                        <p><strong>נוצרה ב:</strong> {formatDateTime(raw.createdAt)}</p>
                        {raw.completedAt && <p><strong>הושלמה ב:</strong> {formatDateTime(raw.completedAt)}</p>}
                        {raw.assignee && <p><strong>צוות מטפל:</strong> {raw.assignee}</p>}
                    </div>
                );
            case 'resident_status':
                return (
                    <div className="space-y-2 text-right">
                        <p><strong>תושב/ת:</strong> {raw.residentName}</p>
                        <p><strong>סטטוס שונה ל:</strong> {raw.to}</p>
                        {raw.from && <p><strong>סטטוס קודם:</strong> {raw.from}</p>}
                    </div>
                );
            default:
                return <p>אין פרטים להצגה עבור סוג אירוע זה.</p>;
        }
    };

    return (
        <div className="fixed inset-0 bg-white z-50 p-8 overflow-y-auto" style={{ direction: 'rtl' }}>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">תמונת מצב</h1>
                <div className="flex items-center gap-4">
                    {/* 4. Ticking Clock */}
                    <div className="text-2xl font-mono bg-gray-100 p-2 rounded-lg">{timeElapsed}</div>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-6 w-6" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column */}
                <div className="lg:col-span-1 space-y-8">
                    {/* 1. Residents Status */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-center">
                                <span>סטטוס תושבים</span>
                                <span className="text-sm font-normal text-gray-500">סה"כ: {totalResidents}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {Object.entries(statusCounts).map(([status, count]) => {
                                    const config = statusConfig[status];
                                    const percentage = totalResidents > 0 ? (count / totalResidents) * 100 : 0;
                                    return (
                                        <div key={status} className="flex items-center gap-4">
                                            {config.icon}
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm font-medium">{status}</span>
                                                    <span className="text-sm font-bold">{count}</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                                    <div className={`${config.color} h-2.5 rounded-full`} style={{ width: `${percentage}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-6 border-t pt-4">
                                <h3 className="font-semibold mb-2">פצועים ({injuredResidents.length})</h3>
                                {injuredResidents.length > 0 ? (
                                    <div className="max-h-40 overflow-y-auto space-y-2 text-right">
                                        {injuredResidents.map(resident => (
                                            <div key={resident.id} className="text-sm p-2 bg-gray-50 rounded">
                                                <p className="font-semibold">{`${resident['שם פרטי'] || ''} ${resident['שם משפחה'] || ''}`.trim()}</p>
                                                {resident.comments && resident.comments.length > 0 ? (
                                                    <div className="pl-2 mt-1 text-xs text-gray-600 border-r-2 border-gray-200 pr-2">
                                                        {resident.comments.slice().reverse().map((comment, index) => (
                                                            <p key={index} className="truncate">
                                                                <strong>{comment.userAlias}:</strong> {comment.text}
                                                            </p>
                                                        ))}
                                                    </div>
                                                ) : (
                                                     <p className="text-xs text-gray-400">אין הערות.</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">
                                        אין תושבים שסומנו כפצועים.
                                    </p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* 2. Tasks Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle>סיכום משימות</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <Clock className="h-5 w-5 text-blue-500" />
                                    <div>
                                        <div className="font-medium">זמן טיפול ממוצע</div>
                                        <div className="font-bold text-lg">{formatDuration(tasksSummary.avgCompletionTime)}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Zap className="h-5 w-5 text-yellow-500" />
                                    <div>
                                        <div className="font-medium">זמן תגובה ממוצע</div>
                                        <div className="font-bold text-lg">{formatDuration(tasksSummary.avgResponseTime)}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 border-t pt-4">
                                <h3 className="font-semibold mb-2">משימות לפי קטגוריה</h3>
                                <div className="space-y-3">
                                {Object.keys(tasksSummary.categories).length > 0 ? Object.entries(tasksSummary.categories).map(([category, counts]) => (
                                    <div key={category}>
                                        <div className="flex justify-between items-center text-sm font-medium mb-1">
                                            <span>{category}</span>
                                            <span>{counts.open} פתוחות / {counts.closed} סגורות</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                                            <div 
                                                className="bg-green-500 h-2.5 rounded-l-full" 
                                                style={{ 
                                                    width: `${(counts.closed / (counts.open + counts.closed)) * 100}%`,
                                                    display: 'inline-block'
                                                }}
                                            ></div>
                                            <div 
                                                className="bg-orange-500 h-2.5 rounded-r-full" 
                                                style={{ 
                                                    width: `${(counts.open / (counts.open + counts.closed)) * 100}%`,
                                                    display: 'inline-block'
                                                }}
                                            ></div>
                                        </div>
                                    </div>
                                )) : <p className="text-sm text-gray-500">אין משימות להצגה.</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column (main) */}
                <div className="lg:col-span-2 space-y-8">
                    {/* 3. Event Log Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle>סיכום יומן אירועים</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-gray-700 leading-relaxed">
                                {summary.current}
                            </p>
                        </CardContent>
                    </Card>

                    {/* 5. Live Timeline */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex justify-between items-center">
                                <span>ציר זמן חי</span>
                                <div className="flex items-center gap-2">
                                    {timelineLayout === 'horizontal' && (
                                        <>
                                            <Button variant="outline" size="icon" onClick={() => setTimelineZoom(z => Math.max(0.2, z - 0.2))}>
                                                <ZoomOut className="h-4 w-4" />
                                            </Button>
                                            <Button variant="outline" size="icon" onClick={() => setTimelineZoom(z => Math.min(3, z + 0.2))}>
                                                <ZoomIn className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                    <Button variant="outline" size="icon" onClick={() => setTimelineLayout(prev => prev === 'vertical' ? 'horizontal' : 'vertical')}>
                                        {timelineLayout === 'vertical' ? <Columns className="h-4 w-4" /> : <Rows className="h-4 w-4" />}
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Filter className="h-4 w-4 ml-2" />
                                                סנן
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuLabel>הצג אירועים</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuCheckboxItem
                                                checked={timelineFilters.log_update}
                                                onCheckedChange={(checked) => setTimelineFilters(f => ({...f, log_update: checked}))}
                                            >
                                                עדכוני יומן
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={timelineFilters.task_created}
                                                onCheckedChange={(checked) => setTimelineFilters(f => ({...f, task_created: checked}))}
                                            >
                                                משימות חדשות
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={timelineFilters.task_done}
                                                onCheckedChange={(checked) => setTimelineFilters(f => ({...f, task_done: checked}))}
                                            >
                                                משימות שהושלמו
                                            </DropdownMenuCheckboxItem>
                                            <DropdownMenuCheckboxItem
                                                checked={timelineFilters.resident_status}
                                                onCheckedChange={(checked) => setTimelineFilters(f => ({...f, resident_status: checked}))}
                                            >
                                                שינויי סטטוס תושבים
                                            </DropdownMenuCheckboxItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-96" style={{direction: 'ltr'}}>
                                {timelineLayout === 'vertical' ? (
                                    <div className="h-full bg-gray-50 border rounded-md overflow-y-auto p-4 space-y-4">
                                        {filteredTimelineEvents.length > 0 ? (
                                            filteredTimelineEvents.map((event) => (
                                                <div 
                                                    key={event.id} 
                                                    className="flex items-start gap-4 cursor-pointer hover:bg-gray-100 p-1 rounded"
                                                    onClick={() => setSelectedEvent(event)}
                                                >
                                                    <div className="flex flex-col items-center">
                                                        <div className={`w-3 h-3 rounded-full ${event.color} mt-1`}></div>
                                                        <div className="w-px flex-1 bg-gray-300"></div>
                                                    </div>
                                                    <div className="flex-1 pb-4 text-left">
                                                        <p className="text-xs text-gray-500">{formatDateTime(event.timestamp)}</p>
                                                        <p className="text-sm">{event.content}</p>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center text-gray-500 pt-16">
                                                <p>אין אירועים להצגה לפי הפילטרים שנבחרו.</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-full bg-gray-50 border rounded-md p-4 overflow-x-auto overflow-y-hidden">
                                        <div className="relative flex items-center transition-all duration-300" style={{ minWidth: `${filteredTimelineEvents.length * 150 * timelineZoom}px`, minHeight: '100%' }}>
                                            {/* Center Line */}
                                            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-300 transform -translate-y-1/2"></div>

                                            {/* Events */}
                                            <div className="relative flex justify-between w-full">
                                                {filteredTimelineEvents.map((event, index) => (
                                                    <div
                                                        key={event.id}
                                                        className="relative flex flex-col items-center group cursor-pointer"
                                                        onClick={() => setSelectedEvent(event)}
                                                    >
                                                        {/* Dot */}
                                                        <div className={`absolute top-1/2 w-3 h-3 rounded-full ${event.color} transform -translate-y-1/2 z-10`}></div>
                                                        
                                                        {/* Content Card */}
                                                        <div className={`absolute w-48 p-2 bg-white border rounded-lg shadow-lg text-xs text-left
                                                            ${index % 2 === 0 ? 'bottom-full mb-4' : 'top-full mt-4'}`}>
                                                            <p className="font-semibold">{formatDateTime(event.timestamp)}</p>
                                                            <p className="truncate">{event.content}</p>
                                                        </div>

                                                        {/* Connector line */}
                                                        <div className={`absolute w-px bg-gray-300
                                                            ${index % 2 === 0 ? 'bottom-1/2 h-4' : 'top-1/2 h-4'}`}>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
            {selectedEvent && (
                <Dialog open={!!selectedEvent} onOpenChange={(isOpen) => !isOpen && setSelectedEvent(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>פרטי אירוע</DialogTitle>
                            <DialogDescription>
                                {`אירוע מסוג "${selectedEvent.type}" שהתרחש ב-${formatDateTime(selectedEvent.timestamp)}`}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="mt-4">
                            {renderEventDetails(selectedEvent)}
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default EventStatus;
