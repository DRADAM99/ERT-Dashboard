"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, app } from '../../firebase'; // Import 'app' from firebase
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { toast } from '@/components/ui/use-toast';

const NotificationContext = createContext();
const DEBUG_ENDPOINT = 'http://127.0.0.1:7276/ingest/e0f9c8e4-9a45-4333-a694-51653290076f';
const FIREBASE_VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

function isPushServiceUnavailableError(error) {
  return error?.name === 'AbortError' && /push service not available/i.test(error?.message || '');
}

function isFcmRegistrationConfigError(error) {
  const message = error?.message || '';
  return (
    error?.code === 'messaging/token-subscribe-failed' ||
    error?.code === 'messaging/invalid-vapid-key' ||
    /missing required authentication credential/i.test(message) ||
    /valid authentication credential/i.test(message) ||
    /vapid/i.test(message)
  );
}

function agentDebugLog(payload) {
  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '949026' },
    body: JSON.stringify({ sessionId: '949026', ...payload, timestamp: Date.now() })
  }).catch(() => {});
}

// Notification creators emit singular types ('task', 'resident', 'event'),
// but the settings document is keyed by plural names ('tasks', 'residents', 'events').
const TYPE_TO_SETTINGS_KEY = {
  task: 'tasks',
  resident: 'residents',
  event: 'events',
};
const resolveSettingsKey = (type) => {
  if (!type) return type;
  const lower = type.toLowerCase();
  return TYPE_TO_SETTINGS_KEY[lower] || lower;
};

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
    const unlockAudio = (event) => {
      if (notificationSound.current && !isAudioUnlocked.current) {
        // #region agent log
        agentDebugLog({
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'app/context/NotificationContext.js:48',
          message: 'Notification audio unlock attempted',
          data: { eventType: event?.type || null, mutedBeforePlay: true, touchPoints: navigator.maxTouchPoints || 0 }
        });
        // #endregion
        notificationSound.current.muted = true;
        notificationSound.current.play()
          .then(() => {
            notificationSound.current.pause();
            notificationSound.current.currentTime = 0;
            notificationSound.current.muted = false;
            isAudioUnlocked.current = true;
            console.log("Notification sound engine unlocked successfully.");
            // #region agent log
            agentDebugLog({
              runId: 'pre-fix',
              hypothesisId: 'H3',
              location: 'app/context/NotificationContext.js:63',
              message: 'Notification audio unlock succeeded',
              data: { audioUnlocked: true }
            });
            // #endregion
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
          })
          .catch(error => {
            console.warn("Could not unlock audio on first interaction:", error);
            // #region agent log
            agentDebugLog({
              runId: 'pre-fix',
              hypothesisId: 'H3',
              location: 'app/context/NotificationContext.js:78',
              message: 'Notification audio unlock failed',
              data: { name: error?.name, message: error?.message }
            });
            // #endregion
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

    const messagingSupported = await isSupported().catch(() => false);
    if (!messagingSupported) {
      console.warn("Firebase messaging is not supported in this browser context.");
      return;
    }

    const permission = await Notification.requestPermission();
    // #region agent log
    agentDebugLog({
      runId: 'pre-fix',
      hypothesisId: 'H3',
      location: 'app/context/NotificationContext.js:102',
      message: 'Notification permission result',
      data: {
        permission,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'PushManager' in window,
        hasNotification: 'Notification' in window
      }
    });
    // #endregion
    if (permission === 'granted') {
      const messaging = getMessaging(app);
      try {
        // Explicitly get the service worker registration.
        const registration = await navigator.serviceWorker.ready;
        const existingSubscription = await registration.pushManager.getSubscription();
        const pushPermissionState = registration.pushManager.permissionState
          ? await registration.pushManager.permissionState({ userVisibleOnly: true }).catch((error) => `error:${error?.name || 'unknown'}`)
          : 'unsupported';
        // #region agent log
        agentDebugLog({
          runId: 'post-fix',
          hypothesisId: 'H6,H7,H8',
          location: 'app/context/NotificationContext.js:132',
          message: 'Push registration environment before getToken',
          data: {
            hasConfiguredVapidKey: Boolean(FIREBASE_VAPID_KEY),
            isSecureContext: window.isSecureContext,
            protocol: window.location.protocol,
            serviceWorkerScope: registration.scope,
            activeWorkerScript: registration.active?.scriptURL || null,
            pushManagerAvailable: Boolean(registration.pushManager),
            existingSubscription: Boolean(existingSubscription),
            pushPermissionState,
            notificationPermission: Notification.permission
          }
        });
        // #endregion
        if (!FIREBASE_VAPID_KEY) {
          console.warn('Firebase push notifications are disabled because NEXT_PUBLIC_FIREBASE_VAPID_KEY is not configured.');
          // #region agent log
          agentDebugLog({
            runId: 'post-fix',
            hypothesisId: 'H9',
            location: 'app/context/NotificationContext.js:171',
            message: 'FCM token registration skipped because VAPID key is missing',
            data: { hasConfiguredVapidKey: false }
          });
          // #endregion
          return;
        }

        const tokenOptions = { vapidKey: FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration };
        const currentToken = await getToken(messaging, tokenOptions);

        if (currentToken) {
          console.log('FCM Token:', currentToken);
          // #region agent log
          agentDebugLog({
            runId: 'pre-fix',
            hypothesisId: 'H3',
            location: 'app/context/NotificationContext.js:124',
            message: 'FCM token retrieved',
            data: { tokenPresent: true, tokenLength: currentToken.length }
          });
          // #endregion
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
        if (isPushServiceUnavailableError(err)) {
          console.warn('Push notifications are unavailable in this browser environment.', err);
          // #region agent log
          agentDebugLog({
            runId: 'post-fix',
            hypothesisId: 'H7',
            location: 'app/context/NotificationContext.js:198',
            message: 'Push service unavailable classified as environment limitation',
            data: { name: err?.name, message: err?.message, code: err?.code }
          });
          // #endregion
        } else if (isFcmRegistrationConfigError(err)) {
          console.warn('Firebase push notifications are not configured correctly. Token registration was skipped.', err);
        } else {
          console.warn('Notifications will continue without an FCM browser token.', err);
        }
        // #region agent log
        agentDebugLog({
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'app/context/NotificationContext.js:142',
          message: 'FCM token retrieval failed',
          data: { name: err?.name, message: err?.message, code: err?.code }
        });
        // #endregion
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
              const rawType = notificationData.type?.toLowerCase();
              const type = resolveSettingsKey(rawType);
              const subType = notificationData.subType?.toLowerCase();

              if (settings && settings[type] && settings[type][subType]) {
                // Play sound if enabled
                if (settings[type][subType].sound) {
                  playNotificationSound();
                }
                
                // Show toast if enabled (visual update)
                if (settings[type][subType].enabled) {
                  toast({
                    title: "התראה חדשה",
                    description: notificationData.message,
                    variant: rawType === 'resident' ? "destructive" : "default",
                  });
                }
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
  }, [user, settings, playNotificationSound]);

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
            residents: { statuschange: { enabled: true, sound: true } },
            events: { newevent: { enabled: true, sound: true }, statuschange: { enabled: true, sound: true } }
          };
          setDoc(doc.ref, defaultSettings);
          setSettings(defaultSettings);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    let unsubscribe;

    const setupForegroundMessaging = async () => {
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !notificationSound.current) return;
      const messagingSupported = await isSupported().catch(() => false);
      if (!messagingSupported) return;

      const messaging = getMessaging(app);
      const unsubscribe = onMessage(messaging, (payload) => {
        console.log('Message received. ', payload);
        // Handle foreground message
        const { type: rawType, subType: rawSubType } = payload.data || {};
        const type = resolveSettingsKey(rawType);
        const subType = rawSubType?.toLowerCase();
        if (settings && settings[type] && settings[type][subType] && settings[type][subType].sound) {
          playNotificationSound();
        }
      });

      return unsubscribe;
    };

    setupForegroundMessaging().then((handler) => {
      unsubscribe = handler;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [settings, playNotificationSound]);

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
