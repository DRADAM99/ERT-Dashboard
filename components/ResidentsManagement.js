import React, { useState } from "react";
import { ChevronDown, ChevronRight, Edit2, UserPlus, MessageSquare } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { doc, updateDoc, arrayUnion, serverTimestamp, collection, setDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase";

// Task categories for resident assignments - using the same categories as the main page
const RESIDENT_TASK_CATEGORIES = ["לוגיסטיקה ", "אוכלוסיה", "רפואה", "חוסן", "חמ״ל ", "אחר"];

function ResidentsManagement({ residents, statusColorMap = {}, statusKey = 'סטטוס', currentUser, users = [] }) {
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

  // Helper to get color for a status
  const getStatusColor = (status) => {
    const colorMap = {
      'כולם בסדר': 'bg-green-500',
      'זקוקים לסיוע': 'bg-red-500',
      'לא בטוח': 'bg-orange-400',
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

  // Main fields to display in the table (right to left order)
  // סטטוס must be first for proper color coding and filtering
  const mainFields = ['סטטוס', 'שם משפחה', 'שם פרטי', 'טלפון', 'שכונה'];

  // Debug logging
  console.log("🏠 ResidentsManagement received:", {
    residentsCount: residents?.length || 0,
    statusKey: statusKey,
    currentUser: currentUser?.uid
  });
  
  // Debug first resident data
  if (residents && residents.length > 0) {
    console.log("📋 First resident data:", residents[0]);
    console.log("🔍 Field mapping test:");
    console.log("  שם משפחה:", getFieldValue(residents[0], 'שם משפחה'));
    console.log("  שם פרטי:", getFieldValue(residents[0], 'שם פרטי'));
    console.log("  טלפון:", getFieldValue(residents[0], 'טלפון'));
    console.log("  שכונה:", getFieldValue(residents[0], 'שכונה'));
    console.log("  סטטוס:", getFieldValue(residents[0], 'סטטוס'));
  }

  if (!residents || !residents.length) {
    console.log("❌ No residents data to display");
    return <div className="text-center text-gray-500 py-6">אין נתונים להצגה</div>;
  }
  
  // Extended fields to display in expanded view (ordered by priority)
  const extendedFields = [
    { field: 'מספר בית', priority: 1, column: 'B1' },
    { field: 'הורה/ילד', priority: 2, column: 'N1' },
    { field: 'מסגרת', priority: 3, column: 'H1' },
    { field: 'מקום מסגרת', priority: 4, column: 'I1' },
    { field: 'תאריך לידה', priority: 5, column: 'F1' },
    { field: 'סטטוס מגורים', priority: 6, column: 'M1' }
  ];

  // Toggle row expansion
  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  // Handle status change
  const handleStatusChange = async (residentId, oldStatus, newStatus) => {
    if (!currentUser || !residentId) return;

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
          userAlias: currentUser.alias || currentUser.email
        },
        statusHistory: arrayUnion({
          from: oldStatus,
          to: newStatus,
          timestamp: now,
          userId: currentUser.uid,
          userAlias: currentUser.alias || currentUser.email
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
              assignedBy: currentUser.alias || currentUser.email
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
          creatorAlias: currentUser.alias || currentUser.email,
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
            assignedBy: currentUser.alias || currentUser.email
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
        userAlias: currentUser.alias || currentUser.email
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

  return (
    <div className="overflow-x-auto">
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
          {residents.map((row, idx) => {
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
                          <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger className="w-32 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                              <SelectValue placeholder="בחר סטטוס" />
                            </SelectTrigger>
                            <SelectContent className="bg-white border border-gray-200 shadow-lg">
                              <SelectItem value="" className="hover:bg-gray-50">ללא סטטוס</SelectItem>
                              <SelectItem value="כולם בסדר" className="hover:bg-gray-50">כולם בסדר</SelectItem>
                              <SelectItem value="זקוקים לסיוע" className="hover:bg-gray-50">זקוקים לסיוע</SelectItem>
                              <SelectItem value="לא בטוח" className="hover:bg-gray-50">לא בטוח</SelectItem>
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
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className={row.assignedTasks && row.assignedTasks.length > 0 ? 'font-semibold text-blue-600' : ''}>
                            {field === 'סטטוס' && (!getFieldValue(row, field) || getFieldValue(row, field).trim() === '') 
                              ? 'ללא סטטוס' 
                              : formatCellValue(getFieldValue(row, field))}
                          </span>
                          {field === 'סטטוס' && currentUser && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStatus(rowId);
                                setNewStatus(status);
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
                >
                  <SelectTrigger className="bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue placeholder="בחר קטגוריה" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg">
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
                >
                  <SelectTrigger className="bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                    <SelectValue placeholder="בחר עדיפות" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-200 shadow-lg">
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