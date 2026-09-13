import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

const ALLOWED_NOTIFICATION_PATHS = new Set(['/residents', '/tasks', '/events', '/status', '/map']);

/**
 * Returns a same-origin v2 app path from notification.link, or null if the link
 * is missing, external, or not one of residents/tasks/events/status/map.
 */
export function getSafeNotificationHref(link) {
  if (typeof link !== 'string') return null;
  const raw = link.trim();
  if (!raw || raw.startsWith('//')) return null;

  try {
    let url;
    if (raw.startsWith('/')) {
      url = new URL(raw, 'https://ert.invalid');
    } else {
      url = new URL(raw);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      if (!origin || url.origin !== origin) return null;
    }

    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (!ALLOWED_NOTIFICATION_PATHS.has(pathname)) return null;
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Creates a notification for a specific user.
 * @param {string} userId - The ID of the user to notify.
 * @param {object} notificationData - The data for the notification.
 * @param {string} notificationData.message - The notification message.
 * @param {string} notificationData.type - The type of notification (e.g., 'task', 'resident', 'event').
 * @param {string} notificationData.subType - The sub-type for settings (e.g., 'statusChange', 'created').
 * @param {string} [notificationData.link] - An optional link for the notification.
 */
export const createUserNotification = async (userId, notificationData) => {
  if (!userId || !notificationData || !notificationData.message || !notificationData.type || !notificationData.subType) {
    console.error("User ID, message, type, and subType are required for notification.", { userId, notificationData });
    return;
  }

  try {
    const settingsRef = doc(db, `users/${userId}/notificationSettings`, 'settings');
    const settingsSnap = await getDoc(settingsRef);

    // Default to true if settings don't exist or are incomplete.
    let isEnabled = true;

    if (settingsSnap.exists()) {
      const settings = settingsSnap.data();
      const type = notificationData.type.toLowerCase();
      const subType = notificationData.subType.toLowerCase();
      
      if (settings[type] && settings[type][subType] && typeof settings[type][subType].enabled === 'boolean') {
        isEnabled = settings[type][subType].enabled;
      }
    }

    if (isEnabled) {
      const notificationsRef = collection(db, `users/${userId}/notifications`);
      await addDoc(notificationsRef, {
        ...notificationData,
        type: notificationData.type.toLowerCase(),
        subType: notificationData.subType.toLowerCase(),
        timestamp: serverTimestamp(),
        read: false,
      });
    } else {
      // Optional: log when a notification is suppressed
      console.log(`Notification suppressed for user ${userId} as per their settings.`, notificationData);
    }
  } catch (error) {
    console.error(`Error creating notification for user ${userId}:`, error);
  }
};

export const notifyUsersInDepartment = async (department, notificationPayload) => {
  if (!department || !department.trim()) {
    console.error("notifyUsersInDepartment called with no department.");
    return;
  }
  try {
    const trimmedDepartment = department.trim();
    const q = query(collection(db, "users"), where("department", "in", [trimmedDepartment, `${trimmedDepartment} `]));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      console.warn(`No users found in department: ${department}`);
      return;
    }
    querySnapshot.forEach((userDoc) => {
      createUserNotification(userDoc.id, notificationPayload);
    });
  } catch (error) {
    console.error(`Error notifying users in department ${department}:`, error);
  }
};
