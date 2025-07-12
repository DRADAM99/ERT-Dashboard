// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration (replace with your own if needed)
const firebaseConfig = {
  apiKey: "AIzaSyBVIjO_f5GKTal8xpG-QA7aLtWX2A9skoI",
  authDomain: "crm-dashboard-2db5f.firebaseapp.com",
  projectId: "crm-dashboard-2db5f",
  storageBucket: "crm-dashboard-2db5f.appspot.com",
  messagingSenderId: "668768143823",
  appId: "1:668768143823:web:ab8619b6ccb90de97e6aba"
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized.");
} else {
  app = getApp();
  console.log("Firebase already initialized.");
}

const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider }; 