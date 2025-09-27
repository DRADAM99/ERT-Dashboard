// Cross-Project Authentication for Emergency Locator
// This allows ERT users to access the emergency locator using their existing authentication

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";

// Emergency Locator Firebase config
const emergencyLocatorConfig = {
  apiKey: "AIzaSyCgY5BDrDBLd61yoVFUmP_YcPHcfi7RDpo",
  authDomain: "emergency-locator-585a5.firebaseapp.com",
  databaseURL: "https://emergency-locator-585a5-default-rtdb.firebaseio.com",
  projectId: "emergency-locator-585a5",
  storageBucket: "emergency-locator-585a5.firebasestorage.app",
  messagingSenderId: "1044762436700",
  appId: "1:1044762436700:web:c659c52661785f4c27b299"
};

// Initialize emergency locator Firebase app
let emergencyLocatorApp;
let emergencyLocatorDb;
let emergencyLocatorAuth;

try {
  emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator-cross-auth');
  emergencyLocatorDb = getFirestore(emergencyLocatorApp);
  emergencyLocatorAuth = getAuth(emergencyLocatorApp);
  console.log("Emergency Locator Cross-Auth initialized successfully");
} catch (error) {
  console.error("Failed to initialize Emergency Locator Cross-Auth:", error);
}

// Function to authenticate user in emergency locator using ERT credentials
export async function authenticateInEmergencyLocator(email, password) {
  if (!emergencyLocatorAuth) {
    console.error("Emergency Locator Auth not initialized");
    return false;
  }

  try {
    // Sign in to emergency locator with ERT credentials
    const userCredential = await signInWithEmailAndPassword(emergencyLocatorAuth, email, password);
    console.log(`✅ Authenticated in emergency locator: ${email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to authenticate in emergency locator: ${email}`, error);
    return false;
  }
}

// Function to check if user is authenticated in emergency locator
export function isAuthenticatedInEmergencyLocator() {
  if (!emergencyLocatorAuth) {
    return false;
  }
  return emergencyLocatorAuth.currentUser !== null;
}

// Function to get emergency locator auth instance
export function getEmergencyLocatorAuthInstance() {
  return emergencyLocatorAuth;
}

// Function to sign out from emergency locator
export async function signOutFromEmergencyLocator() {
  if (!emergencyLocatorAuth) {
    return;
  }
  
  try {
    await emergencyLocatorAuth.signOut();
    console.log("✅ Signed out from emergency locator");
  } catch (error) {
    console.error("❌ Failed to sign out from emergency locator:", error);
  }
}

// Function to listen for auth state changes in emergency locator
export function onEmergencyLocatorAuthStateChanged(callback) {
  if (!emergencyLocatorAuth) {
    return () => {};
  }
  
  return onAuthStateChanged(emergencyLocatorAuth, callback);
} 