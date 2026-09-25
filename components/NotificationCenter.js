"use client";

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings } from 'lucide-react';
import { useNotifications } from '@/app/context/NotificationContext';
import { getSafeNotificationHref } from '@/lib/notifications';
import NotificationSettings from './NotificationSettings';

function NotificationItem({ notification, onActivate, onDelete }) {
  const getBackgroundColor = (type) => {
    switch (type) {
      case 'task': return 'bg-blue-50';
      case 'resident': return 'bg-red-50';
      case 'event': return 'bg-green-50';
      default: return 'bg-gray-50';
    }
  };

  const href = getSafeNotificationHref(notification.link);
  
  return (
    <div 
      className={`p-3 rounded-lg border ${getBackgroundColor(notification.type)} ${!notification.read ? 'border-blue-300' : 'border-gray-200'}`}
    >
      <div 
        className={href || !notification.read ? 'cursor-pointer' : undefined}
        onClick={() => onActivate(notification)}
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

const TABS = [
  { id: 'all', label: 'הכל' },
  { id: 'event', label: 'יומן אירועים' },
  { id: 'resident', label: 'ניהול תושבים' },
  { id: 'task', label: 'לוח משימות' },
];

export default function NotificationCenter({ isOpen, onClose }) {
  const router = useRouter();
  const { notifications, markAsRead, settings, deleteNotification, deleteAllNotifications } = useNotifications();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  const handleActivate = (notification) => {
    const href = getSafeNotificationHref(notification.link);
    if (href) {
      router.push(href);
      onClose();
    }
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const filteredAndSortedNotifications = useMemo(() => {
    return [...notifications]
      .filter(n => activeTab === 'all' || n.type === activeTab)
      .sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
  }, [notifications, activeTab]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md bg-white p-0">
          <DialogHeader className="flex flex-row items-center justify-between p-6 pb-4">
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
          <div className="flex border-b px-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-sm font-medium focus:outline-none ${
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 p-4">
            {filteredAndSortedNotifications.length > 0 ? (
              filteredAndSortedNotifications.map(n => (
                <NotificationItem key={n.id} notification={n} onActivate={handleActivate} onDelete={deleteNotification} />
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">אין התראות בקטגוריה זו</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {settings && <NotificationSettings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />}
    </>
  );
}
