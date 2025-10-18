"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, app } from '../../firebase'; // Import 'app' from firebase
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

const NotificationContext = createContext();

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState(null);
  const [user, setUser] = useState(null);
  const notificationSound = useRef(typeof window !== 'undefined' ? new Audio('/notification.wav') : null);
  const isAudioUnlocked = useRef(false);
  const isInitialLoad = useRef(true);

  const playNotificationSound = useCallback(() => {
    if (notificationSound.current && isAudioUnlocked.current) {
      notificationSound.current.currentTime = 0;
      notificationSound.current.play().catch(e => console.error("Error playing notification sound:", e));
    } else if (!isAudioUnlocked.current) {
      console.log("Audio not unlocked by user interaction yet. Sound will not play.");
    }
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      if (notificationSound.current && !isAudioUnlocked.current) {
        notificationSound.current.muted = true;
        notificationSound.current.play()
          .then(() => {
            notificationSound.current.pause();
            notificationSound.current.currentTime = 0;
            notificationSound.current.muted = false;
            isAudioUnlocked.current = true;
            console.log("Notification sound engine unlocked successfully.");
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
          })
          .catch(error => {
            console.warn("Could not unlock audio on first interaction:", error);
          });
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const requestPermission = useCallback(async (currentUser) => { // Accept user as argument
    if (!currentUser || typeof window === 'undefined' || !('Notification' in window)) {
      console.log("Notifications not supported or user not logged in.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const messaging = getMessaging(app);
      try {
        // Explicitly get the service worker registration.
        const registration = await navigator.serviceWorker.ready;
        
        const currentToken = await getToken(messaging, { 
          vapidKey: "BMe-3J-3_A8-9o-1o_p-2C-1E-1F-9o-1o_p-2C-1E-1F-9o-1o_p-2C-1E-1F-9o-1o",
          serviceWorkerRegistration: registration // Pass the registration to getToken
        });

        if (currentToken) {
          console.log('FCM Token:', currentToken);
          const userTokensRef = collection(db, `users/${currentUser.uid}/fcmTokens`);
          const tokenDocRef = doc(userTokensRef, currentToken);
          const tokenDoc = await getDoc(tokenDocRef);
          if (!tokenDoc.exists()) {
            await setDoc(tokenDocRef, { token: currentToken, createdAt: new Date() });
          }
        } else {
          console.log('No registration token available. Request permission to generate one.');
        }
      } catch (err) {
        console.error('An error occurred while retrieving token. ', err);
      }
    }
  }, []); // Removed user from dependency array

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        requestPermission(currentUser);
      }
    });

    return () => unsubscribe(); // Cleanup the listener on unmount
  }, [requestPermission]);
  
  useEffect(() => {
    if (user) {
      const q = query(collection(db, `users/${user.uid}/notifications`));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (isInitialLoad.current) {
          isInitialLoad.current = false;
        } else {
          snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
              const notificationData = change.doc.data();
              const { type, subType } = notificationData;
              if (settings && settings[type] && settings[type][subType] && settings[type][subType].sound) {
                playNotificationSound();
              }
            }
          });
        }

        const userNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setNotifications(userNotifications);
        const unread = userNotifications.filter(n => !n.read).length;
        setUnreadCount(unread);
      });
      return () => unsubscribe();
    } else {
      isInitialLoad.current = true;
    }
  }, [user, settings]);

  useEffect(() => {
    if (user) {
      const settingsRef = doc(db, `users/${user.uid}/notificationSettings`, 'settings');
      const unsubscribe = onSnapshot(settingsRef, (doc) => {
        if (doc.exists()) {
          const rawSettings = doc.data();
          const normalizedSettings = {};

          for (const categoryKey in rawSettings) {
            if (Object.prototype.hasOwnProperty.call(rawSettings, categoryKey)) {
              const category = rawSettings[categoryKey];
              const newCategory = {};
              for (const subTypeKey in category) {
                if (Object.prototype.hasOwnProperty.call(category, subTypeKey)) {
                  newCategory[subTypeKey.toLowerCase()] = category[subTypeKey];
                }
              }
              normalizedSettings[categoryKey] = newCategory;
            }
          }
          setSettings(normalizedSettings);
        } else {
          // Create default settings if they don't exist
          const defaultSettings = {
            tasks: { created: { enabled: true, sound: true }, replied: { enabled: true, sound: true }, done: { enabled: true, sound: true } },
            residents: { statusChange: { enabled: true, sound: true } },
            events: { newEvent: { enabled: true, sound: true }, statusChange: { enabled: true, sound: true } }
          };
          setDoc(doc.ref, defaultSettings);
          setSettings(defaultSettings);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && notificationSound.current) {
      const messaging = getMessaging(app);
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Message received. ', payload);
        // Handle foreground message
        const { type, subType } = payload.data;
        if (settings && settings[type] && settings[type][subType] && settings[type][subType].sound) {
          playNotificationSound();
        }
      });
      return () => unsubscribe();
    }
  }, [settings]);

  const markAsRead = async (notificationId) => {
    if (user) {
      const notificationRef = doc(db, `users/${user.uid}/notifications`, notificationId);
      await updateDoc(notificationRef, { read: true });
    }
  };

  const deleteNotification = async (notificationId) => {
    if (user) {
      const notificationRef = doc(db, `users/${user.uid}/notifications`, notificationId);
      await deleteDoc(notificationRef);
    }
  };

  const deleteAllNotifications = async () => {
    if (user) {
      const notificationsRef = collection(db, `users/${user.uid}/notifications`);
      const q = query(notificationsRef);
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }
  };
  
  const updateSettings = async (newSettings) => {
      if (user) {
          const settingsRef = doc(db, `users/${user.uid}/notificationSettings`, 'settings');
          await setDoc(settingsRef, newSettings, { merge: true });
      }
  };

  const value = {
    notifications,
    unreadCount,
    settings,
    markAsRead,
    updateSettings,
    deleteNotification,
    deleteAllNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
