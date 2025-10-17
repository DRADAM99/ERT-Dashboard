"use client";

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useNotifications } from '@/app/context/NotificationContext';

const SettingsSection = ({ title, settings, onChange }) => (
  <div className="space-y-4 rounded-lg border p-4">
    <h3 className="font-medium">{title}</h3>
    {Object.entries(settings).map(([key, value]) => (
      <div key={key} className="flex items-center justify-between">
        <Label htmlFor={`${title}-${key}`} className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</Label>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id={`${title}-${key}-enabled`}
              checked={value.enabled}
              onCheckedChange={(checked) => onChange(key, 'enabled', checked)}
              className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-200"
            />
            <Label htmlFor={`${title}-${key}-enabled`}>On</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${title}-${key}-sound`}
              checked={value.sound}
              onCheckedChange={(checked) => onChange(key, 'sound', checked)}
              className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-gray-200"
            />
            <Label htmlFor={`${title}-${key}-sound`}>Sound</Label>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default function NotificationSettings({ isOpen, onClose }) {
  const { settings, updateSettings } = useNotifications();
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSettingChange = (category, subType, field, value) => {
    const newSettings = {
      ...localSettings,
      [category]: {
        ...localSettings[category],
        [subType]: {
          ...localSettings[category][subType],
          [field]: value,
        },
      },
    };
    setLocalSettings(newSettings);
  };

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  if (!localSettings) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle>הגדרות התראות</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <SettingsSection 
            title="משימות" 
            settings={localSettings.tasks} 
            onChange={(subType, field, value) => handleSettingChange('tasks', subType, field, value)}
          />
          <SettingsSection 
            title="תושבים" 
            settings={localSettings.residents}
            onChange={(subType, field, value) => handleSettingChange('residents', subType, field, value)}
          />
          <SettingsSection 
            title="יומן אירועים" 
            settings={localSettings.events}
            onChange={(subType, field, value) => handleSettingChange('events', subType, field, value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave}>שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
