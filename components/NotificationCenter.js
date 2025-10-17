"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from 'lucide-react';
import { useNotifications } from '@/app/context/NotificationContext';
import NotificationSettings from './NotificationSettings';

function NotificationItem({ notification, onRead, onDelete }) {
  const getBackgroundColor = (type) => {
    switch (type) {
      case 'task': return 'bg-blue-50';
      case 'resident': return 'bg-red-50';
      case 'event': return 'bg-green-50';
      default: return 'bg-gray-50';
    }
  };
  
  return (
    <div 
      className={`p-3 rounded-lg border ${getBackgroundColor(notification.type)} ${!notification.read ? 'border-blue-300' : 'border-gray-200'}`}
    >
      <div 
        className="cursor-pointer"
        onClick={() => !notification.read && onRead(notification.id)}
      >
        <p className="font-medium">{notification.message}</p>
        <p className="text-xs text-gray-500 mt-1">
          {new Date(notification.timestamp?.toDate()).toLocaleString()}
        </p>
      </div>
      <div className="flex justify-end mt-2">
        <Button 
          variant="ghost" 
          size="xs" 
          onClick={() => onDelete(notification.id)}
          className="text-xs text-red-600 hover:bg-red-100 hover:text-red-700"
        >
          נקה
        </Button>
      </div>
    </div>
  );
}

export default function NotificationCenter({ isOpen, onClose }) {
  const { notifications, markAsRead, settings, deleteNotification, deleteAllNotifications } = useNotifications();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const sortedNotifications = [...notifications].sort((a, b) => b.timestamp?.toDate() - a.timestamp?.toDate());

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>מרכז ההתראות</DialogTitle>
            <div className="flex items-center gap-2">
              {notifications.length > 0 &&
                <Button
                  variant="outline"
                  size="sm"
                  onClick={deleteAllNotifications}
                  className="text-xs"
                >
                  נקה הכל
                </Button>
              }
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSettingsOpen(true)}
                disabled={!settings}
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 p-1">
            {sortedNotifications.length > 0 ? (
              sortedNotifications.map(n => (
                <NotificationItem key={n.id} notification={n} onRead={markAsRead} onDelete={deleteNotification} />
              ))
            ) : (
              <p className="text-center text-gray-500 py-4">אין התראות חדשות</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {settings && <NotificationSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
}
