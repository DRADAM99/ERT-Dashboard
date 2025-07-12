'use client';

import { useState } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2 } from 'lucide-react';

const COLORS = {
  red: 'bg-red-100 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  purple: 'bg-purple-100 text-purple-800',
  yellow: 'bg-yellow-100 text-yellow-800'
};

export function TabsManager({ isOpen, onClose, userTabs, onTabsChange }) {
  const [editingTab, setEditingTab] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleStartEdit = (tab) => {
    setEditingTab(tab);
    setEditName(tab.name);
    setEditColor(tab.color);
  };

  const handleCancelEdit = () => {
    setEditingTab(null);
    setEditName('');
    setEditColor('');
  };

  const handleSaveEdit = async () => {
    if (!editingTab || !editName.trim()) return;

    try {
      await updateDoc(doc(db, 'userTabs', editingTab.id), {
        name: editName.trim(),
        color: editColor
      });
      
      handleCancelEdit();
      if (onTabsChange) onTabsChange();
    } catch (error) {
      console.error('Error updating tab:', error);
      alert('שגיאה בעדכון התגית');
    }
  };

  const handleDeleteTab = async (tabId) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק תגית זו?')) return;

    try {
      await deleteDoc(doc(db, 'userTabs', tabId));
      if (onTabsChange) onTabsChange();
    } catch (error) {
      console.error('Error deleting tab:', error);
      alert('שגיאה במחיקת התגית');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">ניהול תגיות</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          {userTabs.map(tab => (
            <div key={tab.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white shadow-sm">
              {editingTab?.id === tab.id ? (
                // Edit mode
                <div className="flex items-center gap-3 w-full">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9 text-sm"
                    placeholder="שם התגית"
                  />
                  <div className="flex gap-2">
                    {Object.entries(COLORS).map(([color, bgClass]) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-6 h-6 rounded-full ${bgClass.split(' ')[0]} ${editColor === color ? 'ring-2 ring-offset-2 ring-gray-300' : ''}`}
                        onClick={() => setEditColor(color)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-9 text-sm" onClick={handleSaveEdit}>שמור</Button>
                    <Button size="sm" variant="ghost" className="h-9 text-sm hover:bg-gray-100" onClick={handleCancelEdit}>ביטול</Button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${COLORS[tab.color].split(' ')[0]}`} />
                    <span className="text-sm font-medium">{tab.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStartEdit(tab)}
                      className="h-8 w-8 p-0 hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTab(tab.id)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}

          {userTabs.length === 0 && (
            <div className="text-center text-gray-500 py-6 text-sm">
              אין תגיות עדיין. צור תגית חדשה מתוך משימה.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 