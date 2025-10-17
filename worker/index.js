import { precacheAndRoute } from 'workbox-precaching';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE",
  authDomain: "emergency-dashboard-a3842.firebaseapp.com",
  projectId: "emergency-dashboard-a3842",
  storageBucket: "emergency-dashboard-a3842.firebasestorage.app",
  messagingSenderId: "394209477264",
  appId: "1:394209477264:web:9fdf362f4d744beaa34e15"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Injects the precache manifest, satisfying next-pwa
precacheAndRoute(self.__WB_MANIFEST);

onBackgroundMessage(messaging, (payload) => {
  console.log('[service-worker] Received background message ', payload);

  // Customize the notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
