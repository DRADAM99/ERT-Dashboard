import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Edit2, UserPlus, MessageSquare, ArrowUpDown, X, Phone } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { doc, updateDoc, arrayUnion, serverTimestamp, collection, setDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// Task categories for resident assignments - using the same categories as the main page
const RESIDENT_TASK_CATEGORIES = ["לוגיסטיקה ", "אוכלוסיה", "רפואה", "חוסן", "חמ״ל ", "אחר"];

function ResidentsManagement({ residents, statusColorMap = {}, statusKey = 'סטטוס', currentUser, alias, users = [], viewMode = 'full' }) {
  const [expandedRows, setExpandedRows] = useState({});
  const [editingStatus, setEditingStatus] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [showAssignDialog, setShowAssignDialog] = useState(null);
  const [assignTaskData, setAssignTaskData] = useState({
    title: '',
    category: RESIDENT_TASK_CATEGORIES[0],
    priority: 'רגיל'
  });
  const [newComment, setNewComment] = useState('');
  const [commentingResident, setCommentingResident] = useState(null);

  // New states for filtering and sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("הכל");
  const [sortBy, setSortBy] = useState("syncedAt"); // 'syncedAt' or 'status'
  const [sortDirection, setSortDirection] = useState("desc"); // 'asc' or 'desc'
  const [advancedFilters, setAdvancedFilters] = useState([]); // e.g., [{field: 'שכונה', value: 'נופים'}]
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [currentAdvancedFilter, setCurrentAdvancedFilter] = useState({ field: '', value: '' });

  // Helper to get color for a status
  const getStatusColor = (status) => {
    const colorMap = {
      'כולם בסדר': 'bg-green-500',
      'זקוקים לסיוע': 'bg-red-500',
      'לא בטוח': 'bg-orange-400',
      'פצוע': 'bg-purple-500',
      'חדש': 'bg-blue-400',
      'בטיפול': 'bg-yellow-400',
      'הושלם': 'bg-green-600',
      'ללא סטטוס': 'bg-gray-400',
      ...statusColorMap
    };
    // Handle blank/empty status
    if (!status || status.trim() === '') {
      return 'bg-gray-400';
    }
    return colorMap[status] || 'bg-gray-300';
  };

  // Helper to format cell values for display
  const formatCellValue = (value, fieldName = '') => {
    if (value === null || value === undefined) {
      return '';
    }
    
    // Handle Date objects
    if (value instanceof Date) {
      return value.toLocaleString('he-IL');
    }
    
    // Handle Firestore Timestamp objects
    if (value && typeof value === 'object' && value.seconds) {
      const date = new Date(value.seconds * 1000);
      return date.toLocaleString('he-IL');
    }
    
    // Special formatting for specific fields
    if (fieldName === 'תאריך לידה' && typeof value === 'string') {
      // Try to format date strings
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('he-IL');
        }
      } catch (e) {
        // If date parsing fails, return as-is
      }
    }
    
    // Handle other objects (convert to string)
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    // Return string values as-is
    return String(value);
  };

  // Simple field mapping to handle Google Sheet field name variations
  const getFieldValue = (row, fieldName) => {
    // Map expected field names to actual Google Sheet field names
    const fieldMap = {
      'שם משפחה': row['*שם משפחה'] || row['שם משפחה'] || '',
      'שם פרטי': row['*שם פרטי'] || row['שם פרטי'] || '',
      'טלפון': row['*טלפון נייד'] || row['טלפון נייד'] || row['טלפון'] || '',
      'שכונה': row['שכונה'] || '',
      'סטטוס': row['סטטוס'] || '',
      'מספר בית': row['מספר בית'] || '',
      'הורה/ילד': row['הורה/ילד'] || '',
      'מסגרת': row['מסגרת'] || '',
      'מקום מסגרת': row['מקום מסגרת'] || '',
      'תאריך לידה': row['*תאריך לידה'] || row['תאריך לידה'] || '',
      'סטטוס מגורים': row['סטטוס מגורים'] || ''
    };
    
    return fieldMap[fieldName] || row[fieldName] || '';
  };

  const ADVANCED_FILTER_FIELDS = ['שכונה', 'הורה/ילד', 'סטטוס מגורים'];

  const advancedFilterOptions = useMemo(() => {
    const options = {};
    ADVANCED_FILTER_FIELDS.forEach(field => {
      const values = new Set(residents.map(r => getFieldValue(r, field)).filter(Boolean));
      options[field] = [...values];
    });
    return options;
  }, [residents]);

  const filteredAndSortedResidents = useMemo(() => {
    let filtered = [...residents];

    // 1. Search filter (first name or last name)
    if (searchQuery) {
      const lowercasedQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        getFieldValue(r, 'שם פרטי').toLowerCase().includes(lowercasedQuery) ||
        getFieldValue(r, 'שם משפחה').toLowerCase().includes(lowercasedQuery)
      );
    }

    // 2. Status filter
    if (statusFilter !== 'הכל') {
      if (statusFilter === 'ללא סטטוס') {
        filtered = filtered.filter(r => !getFieldValue(r, 'סטטוס'));
      } else {
        filtered = filtered.filter(r => getFieldValue(r, 'סטטוס') === statusFilter);
      }
    }

    // 3. Advanced filters
    advancedFilters.forEach(filter => {
      filtered = filtered.filter(r => getFieldValue(r, filter.field) === filter.value);
    });

    // 4. Sorting
    const statusPriority = {
      'פצוע': 1,
      'זקוקים לסיוע': 2,
      'לא בטוח': 3,
      'כולם בסדר': 4,
      '': 5, // for ללא סטטוס
    };

    filtered.sort((a, b) => {
      if (sortBy === 'status') {
        const statusA = getFieldValue(a, 'סטטוס');
        const statusB = getFieldValue(b, 'סטטוס');
        const priorityA = statusPriority[statusA] ?? (statusA === '' ? 5 : 99);
        const priorityB = statusPriority[statusB] ?? (statusB === '' ? 5 : 99);
        
        if (priorityA !== priorityB) {
          return sortDirection === 'asc' ? priorityA - priorityB : priorityB - priorityA;
        }
      }

      // Default/secondary sort by time (using syncedAt as זמן תגובה)
      const dateA = a.syncedAt?.seconds || a.createdAt?.seconds || 0;
      const dateB = b.syncedAt?.seconds || b.createdAt?.seconds || 0;
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    });

    return filtered;
  }, [residents, searchQuery, statusFilter, advancedFilters, sortBy, sortDirection]);


  const handleAddAdvancedFilter = () => {
    if (currentAdvancedFilter.field && currentAdvancedFilter.value) {
      if (!advancedFilters.some(f => f.field === currentAdvancedFilter.field && f.value === currentAdvancedFilter.value)) {
        setAdvancedFilters(prev => [...prev, currentAdvancedFilter]);
      }
      setCurrentAdvancedFilter({ field: '', value: '' });
      setPopoverOpen(false);
    }
  };

  const handleRemoveAdvancedFilter = (filterToRemove) => {
    setAdvancedFilters(prev => prev.filter(f => !(f.field === filterToRemove.field && f.value === filterToRemove.value)));
  };


  const mainFields = useMemo(() => {
    if (viewMode === 'compact') {
      return ['סטטוס', 'שם משפחה', 'שם פרטי', 'טלפון'];
    }
    return ['סטטוס', 'שם משפחה', 'שם פרטי', 'טלפון', 'שכונה'];
  }, [viewMode]);

  const extendedFields = useMemo(() => {
    const baseFields = [
      { field: 'מספר בית', priority: 1, column: 'B1' },
      { field: 'הורה/ילד', priority: 2, column: 'N1' },
      { field: 'מסגרת', priority: 3, column: 'H1' },
      { field: 'מקום מסגרת', priority: 4, column: 'I1' },
      { field: 'תאריך לידה', priority: 5, column: 'F1' },
      { field: 'סטטוס מגורים', priority: 6, column: 'M1' }
    ];
    if (viewMode === 'compact') {
      return [...baseFields, { field: 'שכונה', priority: 0 }].sort((a, b) => a.priority - b.priority);
    }
    return baseFields;
  }, [viewMode]);

  // Toggle row expansion
  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  // Handle status change
  const handleStatusChange = async (residentId, oldStatus, rawNewStatus) => {
    if (!currentUser || !residentId) return;

    const newStatus = rawNewStatus === 'NO_STATUS' ? '' : rawNewStatus;

    try {
      const residentRef = doc(db, 'residents', residentId);
      const now = new Date();
      
      // Update the resident status
      await updateDoc(residentRef, {
        [statusKey]: newStatus,
        updatedAt: now,
        lastStatusChange: {
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias || currentUser.email
        },
        statusHistory: arrayUnion({
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: alias || currentUser.email
        })
      });

      // Also update any tasks linked to this resident
      if (currentUser) {
        try {
          const tasksRef = collection(db, "tasks");
          const tasksQuery = query(tasksRef, where("residentId", "==", residentId));
          const tasksSnapshot = await getDocs(tasksQuery);
          
          // Update each task's residentStatus field and main status if it's a resident-linked task
          const updatePromises = tasksSnapshot.docs.map(async (taskDoc) => {
            const taskData = taskDoc.data();
            const updateData = {
              residentStatus: newStatus,
              updatedAt: now
            };
            
            // If this is a resident-linked task, also update the main status
            if (taskData.residentId) {
              updateData.status = newStatus;
            }
            
            await updateDoc(doc(db, "tasks", taskDoc.id), updateData);
          });
          
          await Promise.all(updatePromises);
        } catch (error) {
          console.error('Error updating linked tasks:', error);
        }
      }

      setEditingStatus(null);
      setNewStatus('');
    } catch (error) {
      console.error('Error updating status:', error);
      alert('שגיאה בעדכון הסטטוס. נסה שוב.');
    }
  };

  // Handle task assignment
  const handleAssignTask = async (residentId, residentData) => {
    if (!currentUser || !residentId) return;

    try {
      // Use the standardized task creation function if available
      if (typeof window !== 'undefined' && window.createTaskFromExternal) {
        const taskData = {
          title: assignTaskData.title,
          subtitle: `תושב: ${residentData['שם פרטי']} ${residentData['שם משפחה']} - ${residentData['שכונה']}`,
          priority: assignTaskData.priority,
          category: assignTaskData.category,
          department: assignTaskData.category,
          status: "פתוח",
          dueDate: new Date(),
          // Link to resident with proper field validation
          residentId: residentId,
          residentName: `${residentData['שם פרטי']} ${residentData['שם משפחה']}`,
          residentPhone: residentData['טלפון'] || "",
          residentNeighborhood: residentData['שכונה'] || "",
          residentStatus: residentData['סטטוס'] || ""
        };

        const taskId = await window.createTaskFromExternal(taskData);
        
        if (taskId) {
          // Update resident with task assignment
          const residentRef = doc(db, 'residents', residentId);
          const now = new Date();
          await updateDoc(residentRef, {
            assignedTasks: arrayUnion({
              taskId: taskId,
              title: assignTaskData.title,
              category: assignTaskData.category,
              assignedAt: now,
              assignedBy: alias || currentUser.email || 'Unknown User'
            }),
            updatedAt: now
          });
        }
      } else {
        // Fallback to direct task creation with proper field validation
        const taskRef = doc(collection(db, "tasks"));
        const now = new Date();

        const taskData = {
          id: taskRef.id,
          userId: currentUser.uid,
          creatorId: currentUser.uid,
          creatorAlias: alias || currentUser.email,
          assignTo: assignTaskData.category, // Use category as assignTo
          title: assignTaskData.title,
          subtitle: `תושב: ${residentData['שם פרטי']} ${residentData['שם משפחה']} - ${residentData['שכונה']}`,
          priority: assignTaskData.priority,
          category: assignTaskData.category,
          department: assignTaskData.category,
          status: "פתוח",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          dueDate: now,
          replies: [],
          isRead: false,
          isArchived: false,
          done: false,
          completedBy: null,
          completedAt: null,
          nudges: [],
          // Link to resident with proper field validation
          residentId: residentId,
          residentName: `${residentData['שם פרטי']} ${residentData['שם משפחה']}`,
          residentPhone: residentData['טלפון'] || "",
          residentNeighborhood: residentData['שכונה'] || "",
          residentStatus: residentData['סטטוס'] || ""
        };

        await setDoc(taskRef, taskData);

        // Update resident with task assignment
        const residentRef = doc(db, 'residents', residentId);
        await updateDoc(residentRef, {
          assignedTasks: arrayUnion({
            taskId: taskRef.id,
            title: assignTaskData.title,
            category: assignTaskData.category,
            assignedAt: now,
            assignedBy: alias || currentUser.email || 'Unknown User'
          }),
          updatedAt: now
        });
      }

      // Reset form
      setAssignTaskData({
        title: '',
        category: RESIDENT_TASK_CATEGORIES[0],
        priority: 'רגיל'
      });
      setShowAssignDialog(null);
    } catch (error) {
      console.error("Error creating task:", error);
      alert("שגיאה ביצירת המשימה. נסה שוב.");
    }
  };

  // Handle adding comment
  const handleAddComment = async (residentId) => {
    if (!currentUser || !residentId || !newComment.trim()) return;

    try {
      const residentRef = doc(db, 'residents', residentId);
      const now = new Date();
      
      const comment = {
        text: newComment,
        timestamp: now,
        userId: currentUser.uid,
        userAlias: alias || currentUser.email
      };

      await updateDoc(residentRef, {
        comments: arrayUnion(comment),
        updatedAt: now
      });

      setNewComment('');
      setCommentingResident(null);
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('שגיאה בהוספת הערה. נסה שוב.');
    }
  };
  
  if (residents.length === 0) {
    return (
      <div>
        {/* Render controls even when there are no residents, but disable some */}
        <div className="p-4 bg-gray-50 border-b flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 text-sm">
           <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              <Input
                placeholder="חפש תושב..."
                disabled
                className="bg-gray-200"
              />
              <Select disabled dir="rtl">
                <SelectTrigger className="bg-gray-200 text-right">
                  <SelectValue placeholder="כל הסטטוסים" />
                </SelectTrigger>
              </Select>
               <Button variant="outline" className="bg-gray-200 justify-end" disabled>
                <span>סנן לפי</span>
              </Button>
               <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-500">סדר לפי:</label>
                <Select disabled dir="rtl">
                  <SelectTrigger className="bg-gray-200 w-auto text-right">
                    <SelectValue placeholder="זמן תגובה" />
                  </SelectTrigger>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-gray-200"
                  disabled
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
           </div>
        </div>
        <div className="text-center text-gray-500 py-6">אין נתונים להצגה</div>
      </div>
    );
  }


  return (
    <div>
      {/* Filters and Sorting Controls */}
      <div className="p-4 bg-gray-50 border-b">
        {viewMode === 'full' ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 text-sm">
            <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              <Input
                placeholder="חפש תושב..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter} dir="rtl">
                <SelectTrigger className="bg-white text-right">
                  <SelectValue placeholder="סנן לפי סטטוס" />
                </SelectTrigger>
                <SelectContent className="text-right">
                  <SelectItem value="הכל">כל הסטטוסים</SelectItem>
                  <SelectItem value="זקוקים לסיוע">זקוקים לסיוע</SelectItem>
                  <SelectItem value="לא בטוח">לא בטוח</SelectItem>
                  <SelectItem value="פצוע">פצוע</SelectItem>
                  <SelectItem value="כולם בסדר">כולם בסדר</SelectItem>
                  <SelectItem value="ללא סטטוס">ללא סטטוס</SelectItem>
                </SelectContent>
              </Select>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="bg-white justify-end">
                    <span>סנן לפי</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">הוסף פילטר</h4>
                      <p className="text-sm text-muted-foreground">
                        סנן תושבים לפי קטגוריות.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Select
                        onValueChange={(field) => setCurrentAdvancedFilter({ field, value: '' })}
                        value={currentAdvancedFilter.field}
                        dir="rtl"
                      >
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="בחר שדה" />
                        </SelectTrigger>
                        <SelectContent className="text-right">
                          {ADVANCED_FILTER_FIELDS.map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentAdvancedFilter.field && (
                        <Select
                          onValueChange={(value) => setCurrentAdvancedFilter(prev => ({ ...prev, value }))}
                          value={currentAdvancedFilter.value}
                          dir="rtl"
                        >
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="בחר ערך" />
                          </SelectTrigger>
                          <SelectContent className="text-right">
                            {advancedFilterOptions[currentAdvancedFilter.field]?.map(option => (
                              <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button onClick={handleAddAdvancedFilter} disabled={!currentAdvancedFilter.field || !currentAdvancedFilter.value}>הוסף</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">סדר לפי:</label>
                <Select value={sortBy} onValueChange={setSortBy} dir="rtl">
                  <SelectTrigger className="bg-white w-auto text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-right">
                    <SelectItem value="syncedAt">זמן תגובה</SelectItem>
                    <SelectItem value="status">סטטוס</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-white"
                  onClick={() => setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="חפש תושב..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter} dir="rtl">
                <SelectTrigger className="bg-white text-right">
                  <SelectValue placeholder="סנן לפי סטטוס" />
                </SelectTrigger>
                <SelectContent className="text-right">
                  <SelectItem value="הכל">כל הסטטוסים</SelectItem>
                  <SelectItem value="זקוקים לסיוע">זקוקים לסיוע</SelectItem>
                  <SelectItem value="לא בטוח">לא בטוח</SelectItem>
                  <SelectItem value="פצוע">פצוע</SelectItem>
                  <SelectItem value="כולם בסדר">כולם בסדר</SelectItem>
                  <SelectItem value="ללא סטטוס">ללא סטטוס</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between items-center gap-2">
               <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="bg-white justify-end">
                    <span>סנן לפי</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64" align="end">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">הוסף פילטר</h4>
                      <p className="text-sm text-muted-foreground">
                        סנן תושבים לפי קטגוריות.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Select
                        onValueChange={(field) => setCurrentAdvancedFilter({ field, value: '' })}
                        value={currentAdvancedFilter.field}
                        dir="rtl"
                      >
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="בחר שדה" />
                        </SelectTrigger>
                        <SelectContent className="text-right">
                          {ADVANCED_FILTER_FIELDS.map(field => (
                            <SelectItem key={field} value={field}>{field}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentAdvancedFilter.field && (
                        <Select
                          onValueChange={(value) => setCurrentAdvancedFilter(prev => ({ ...prev, value }))}
                          value={currentAdvancedFilter.value}
                          dir="rtl"
                        >
                          <SelectTrigger className="text-right">
                            <SelectValue placeholder="בחר ערך" />
                          </SelectTrigger>
                          <SelectContent className="text-right">
                            {advancedFilterOptions[currentAdvancedFilter.field]?.map(option => (
                              <SelectItem key={option} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button onClick={handleAddAdvancedFilter} disabled={!currentAdvancedFilter.field || !currentAdvancedFilter.value}>הוסף</Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium">סדר לפי:</label>
                <Select value={sortBy} onValueChange={setSortBy} dir="rtl">
                  <SelectTrigger className="bg-white w-auto text-right">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-right">
                    <SelectItem value="syncedAt">זמן תגובה</SelectItem>
                    <SelectItem value="status">סטטוס</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-white"
                  onClick={() => setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
       {/* Active Advanced Filters */}
       {advancedFilters.length > 0 && (
        <div className="p-2 bg-gray-100 border-b flex flex-wrap gap-2 items-center justify-end">
          {advancedFilters.map((filter, index) => (
            <div key={index} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
              <span>{filter.field}: {filter.value}</span>
              <button onClick={() => handleRemoveAdvancedFilter(filter)} className="ml-1">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-y-auto max-h-[70vh]">
      <table className="w-full table-fixed text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-100 z-10">
          <tr>
            {/* Expand/collapse column */}
            <th className="w-8"></th>
            {/* Color tab column */}
            <th className="w-2"></th>
            {/* Main fields in order */}
            {mainFields.map((field) => (
              <th key={field} className="px-2 py-2 text-right font-semibold">
                {field}
              </th>
            ))}
            {/* Actions column */}
            <th className="w-24 px-2 py-2 text-right font-semibold">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSortedResidents.map((row, idx) => {
            const status = getFieldValue(row, statusKey) || '';
            const colorClass = getStatusColor(status);
            const rowId = row.id || `row-${idx}`;
            const isExpanded = expandedRows[rowId];
            const isEditingStatus = editingStatus === rowId;

            return (
              <React.Fragment key={rowId}>
                {/* Main row */}
                <tr className={`border-b hover:bg-gray-50`}>
                  {/* Expand/collapse button */}
                  <td className="px-2 py-2 text-center">
                    <button 
                      onClick={() => toggleRowExpansion(rowId)}
                      className="hover:bg-gray-200 rounded p-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500" />
                      )}
                    </button>
                  </td>
                  {/* Color tab cell */}
                  <td className="align-top px-1">
                    <span className={`inline-block w-2 h-6 rounded-full ${colorClass}`}></span>
                  </td>
                  {/* Main fields */}
                  {mainFields.map((field) => (
                    <td key={field} className="px-2 py-2 align-top">
                      {field === 'סטטוס' && isEditingStatus ? (
                        <div className="flex items-center gap-2">
                          <Select value={newStatus} onValueChange={setNewStatus} dir="rtl">
                            <SelectTrigger className="w-32 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-right">
                              <SelectValue placeholder="בחר סטטוס" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-gray-200 shadow-lg text-right">
                              <SelectItem value="NO_STATUS" className="hover:bg-gray-50">ללא סטטוס</SelectItem>
                              <SelectItem value="כולם בסדר" className="hover:bg-gray-50">כולם בסדר</SelectItem>
                              <SelectItem value="זקוקים לסיוע" className="hover:bg-gray-50">זקוקים לסיוע</SelectItem>
                              <SelectItem value="לא בטוח" className="hover:bg-gray-50">לא בטוח</SelectItem>
                              <SelectItem value="פצוע" className="hover:bg-gray-50">פצוע</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button 
                            size="sm" 
                            onClick={() => handleStatusChange(row.id, status, newStatus)}
                            disabled={newStatus === undefined}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            שמור
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setEditingStatus(null);
                              setNewStatus('');
                            }}
                            className="border-gray-300 hover:bg-gray-50"
                          >
                            ביטול
                          </Button>
                        </div>
                      ) : field === 'טלפון' && viewMode === 'compact' ? (
                        <a href={`tel:${getFieldValue(row, 'טלפון')}`} className="flex justify-center items-center h-full">
                          <Phone className="h-4 w-4 text-gray-600" />
                        </a>
                      ) : (
                        <div className="flex items-center justify-between">
                           {viewMode === 'full' || field !== 'סטטוס' ? (
                            <span className={row.assignedTasks && row.assignedTasks.length > 0 ? 'font-semibold text-blue-600' : ''}>
                              {field === 'סטטוס' && (!getFieldValue(row, field) || getFieldValue(row, field).trim() === '') 
                                ? 'ללא סטטוס' 
                                : formatCellValue(getFieldValue(row, field))}
                            </span>
                          ) : <span />}
                          {field === 'סטטוס' && currentUser && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStatus(rowId);
                                setNewStatus(status || 'NO_STATUS');
                              }}
                              className="ml-2 hover:bg-gray-200 rounded p-1"
                            >
                              <Edit2 className="h-3 w-3 text-gray-500" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  ))}
                  {/* Actions column */}
                  <td className="px-2 py-2 text-center">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAssignDialog(row);
                        }}
                        className={`text-xs ${row.assignedTasks && row.assignedTasks.length > 0 ? 'bg-blue-100 border-blue-300 text-blue-700' : ''}`}
                      >
                        <UserPlus className="h-3 w-3 mr-1" />
                        {row.assignedTasks && row.assignedTasks.length > 0 ? `${row.assignedTasks.length} משימות` : 'הקצה'}
                      </Button>
                    </div>
                  </td>
                </tr>
                
                {/* Expanded details row */}
                {isExpanded && (
                  <tr className="bg-gray-50 border-b">
                    <td colSpan={mainFields.length + 3} className="px-4 py-3">
                      <div className="space-y-4">
                        {/* Extended info - New fields from Google Sheet */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          {extendedFields.map((fieldInfo) => (
                            <div key={fieldInfo.field}>
                              <span className="font-medium">{fieldInfo.field}:</span> {formatCellValue(getFieldValue(row, fieldInfo.field), fieldInfo.field)}
                            </div>
                          ))}
                        </div>

                        {/* System info - Keep only essential metadata */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm border-t pt-4">
                          <div>
                            <span className="font-medium">Event ID:</span> {formatCellValue(row['event_id'])}
                          </div>
                          <div>
                            <span className="font-medium">נוצר:</span> {formatCellValue(row['createdAt'])}
                          </div>
                          <div>
                            <span className="font-medium">עודכן:</span> {formatCellValue(row['syncedAt'])}
                          </div>
                        </div>

                        {/* Status history */}
                        {row.statusHistory && row.statusHistory.length > 0 && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">היסטוריית סטטוס:</h4>
                            <div className="space-y-2">
                              {row.statusHistory.map((change, index) => (
                                <div key={index} className="text-sm bg-white p-2 rounded border">
                                  <div className="flex justify-between">
                                    <span>{change.userAlias}</span>
                                    <span className="text-gray-500">
                                      {formatCellValue(change.timestamp)}
                                    </span>
                                  </div>
                                  <div className="text-gray-600">
                                    {change.from} → {change.to}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Assigned tasks */}
                        {row.assignedTasks && row.assignedTasks.length > 0 && (
                          <div className="border-t pt-4">
                            <h4 className="font-medium mb-2">משימות מוקצות:</h4>
                            <div className="space-y-2">
                              {row.assignedTasks.map((task, index) => (
                                <div key={index} className="text-sm bg-white p-2 rounded border">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{task.title}</span>
                                    <span className="text-gray-500">{task.category}</span>
                                  </div>
                                  <div className="text-gray-600">
                                    הוקצה ע"י: {task.assignedBy} - {formatCellValue(task.assignedAt)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Comments section */}
                        <div className="border-t pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">הערות:</h4>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCommentingResident(rowId)}
                            >
                              <MessageSquare className="h-3 w-3 mr-1" />
                              הוסף הערה
                            </Button>
                          </div>
                          
                          {commentingResident === rowId && (
                            <div className="mb-4 p-3 bg-white rounded border">
                              <Textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="הזן הערה..."
                                className="mb-2"
                              />
                              <div className="flex gap-2">
                                <Button 
                                  size="sm"
                                  onClick={() => handleAddComment(row.id)}
                                  disabled={!newComment.trim()}
                                >
                                  הוסף
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setCommentingResident(null);
                                    setNewComment('');
                                  }}
                                >
                                  ביטול
                                </Button>
                              </div>
                            </div>
                          )}

                          {row.comments && row.comments.length > 0 ? (
                            <div className="space-y-2">
                              {row.comments.map((comment, index) => (
                                <div key={index} className="text-sm bg-white p-2 rounded border">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{comment.userAlias}</span>
                                    <span className="text-gray-500">
                                      {formatCellValue(comment.timestamp)}
                                    </span>
                                  </div>
                                  <p className="mt-1">{comment.text}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm">אין הערות עדיין</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Task Assignment Dialog */}
      <Dialog open={!!showAssignDialog} onOpenChange={() => setShowAssignDialog(null)}>
        <DialogContent className="bg-white border border-gray-200 shadow-lg">
          <DialogHeader className="bg-gray-50 border-b border-gray-200 p-4 -mx-6 -mt-6 mb-4">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              הקצאת משימה לתושב: {showAssignDialog ? `${showAssignDialog['שם פרטי']} ${showAssignDialog['שם משפחה']}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-2">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">כותרת המשימה</label>
              <Input
                value={assignTaskData.title}
                onChange={(e) => setAssignTaskData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="הזן כותרת משימה..."
                className="bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">קטגוריה</label>
                <Select
                  value={assignTaskData.category}
                  onValueChange={(value) => setAssignTaskData(prev => ({ ...prev, category: value }))}
                  dir="rtl"
                >
                  <SelectTrigger className="bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-right">
                    <SelectValue placeholder="בחר קטגוריה" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg text-right">
                    {RESIDENT_TASK_CATEGORIES.map(category => (
                      <SelectItem key={category} value={category} className="hover:bg-gray-50">
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">עדיפות</label>
                <Select
                  value={assignTaskData.priority}
                  onValueChange={(value) => setAssignTaskData(prev => ({ ...prev, priority: value }))}
                  dir="rtl"
                >
                  <SelectTrigger className="bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-right">
                    <SelectValue placeholder="בחר עדיפות" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg text-right">
                    <SelectItem value="דחוף" className="hover:bg-gray-50">דחוף</SelectItem>
                    <SelectItem value="רגיל" className="hover:bg-gray-50">רגיל</SelectItem>
                    <SelectItem value="נמוך" className="hover:bg-gray-50">נמוך</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="bg-gray-50 border-t border-gray-200 p-4 -mx-6 -mb-6 mt-6 flex justify-center">
              <Button 
                onClick={() => handleAssignTask(showAssignDialog.id, showAssignDialog)}
                disabled={!assignTaskData.title}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                צור משימה
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ResidentsManagement;