// src/lib/firebase.js (or your chosen path)

// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getMessaging } from "firebase/messaging";
// TODO: Add SDKs for Firebase products that you want to use later if needed
// https://firebase.google.com/docs/web/setup#available-libraries
// e.g. import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration (Copied from Firebase Console)
const firebaseConfig = {
  apiKey: "AIzaSyBHeb_AS_Iyfc8K7z2T01tLYfhFfGAs_wk",
  authDomain: "emergency-dashboard-a3842.firebaseapp.com",
  projectId: "emergency-dashboard-a3842",
  storageBucket: "emergency-dashboard-a3842.firebasestorage.app",
  messagingSenderId: "394209477264",
  appId: "1:394209477264:web:9fdf362f4d744beaa34e15"
  // measurementId is optional, add if you have it and need Analytics
};

// Initialize Firebase only if it hasn't been initialized yet
// This prevents errors during hot-reloading in development
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized."); // Optional: Log initialization
} else {
  app = getApp(); // Use the existing app instance
  console.log("Firebase already initialized."); // Optional: Log existing instance usage
}


// Get Firestore instance
const db = getFirestore(app);

// Get Auth instance
const auth = getAuth(app);

// Get Messaging instance
const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// Get Google Auth Provider instance
const googleProvider = new GoogleAuthProvider();

// Export the instances for use in other parts of your app
export { db, auth, googleProvider, app, messaging };

// You can also export 'app' if needed elsewhere
// export default app;
