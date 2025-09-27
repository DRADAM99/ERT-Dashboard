// Emergency Locator User Sync Utility for Realtime Database
// This file handles syncing ERT users to the emergency locator project using Realtime Database

import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, child } from "firebase/database";
import { getAuth } from "firebase/auth";

// Emergency Locator Firebase config
const firebaseConfig = {
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
  emergencyLocatorApp = initializeApp(firebaseConfig, 'emergency-locator-realtime');
  emergencyLocatorDb = getDatabase(emergencyLocatorApp);
  emergencyLocatorAuth = getAuth(emergencyLocatorApp);
  console.log("Emergency Locator Realtime Database initialized successfully");
} catch (error) {
  console.error("Failed to initialize Emergency Locator Realtime Database:", error);
}

// Function to sync a single user to emergency locator (Realtime Database)
export async function syncUserToEmergencyLocatorRealtime(userId, userData) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Realtime Database not initialized");
    return false;
  }

  try {
    // Check if user already exists in emergency locator
    const userRef = ref(emergencyLocatorDb, `ert_users/${userId}`);
    const userSnapshot = await get(userRef);
    
    if (userSnapshot.exists()) {
      console.log(`User ${userData.email} already exists in emergency locator`);
      return true;
    }

    // Create user document in emergency locator
    await set(userRef, {
      email: userData.email,
      name: userData.name || userData.fullName || '',
      role: userData.role || 'staff',
      alias: userData.alias || '',
      syncedAt: new Date().toISOString(),
      hasERTAccess: true,
      userId: userId
    });
    
    console.log(`✓ Synced user to emergency locator (Realtime DB): ${userData.email}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to sync user to emergency locator (Realtime DB): ${userData.email}`, error);
    return false;
  }
}

// Function to check if user has access to emergency locator (Realtime Database)
export async function checkEmergencyLocatorAccessRealtime(userId) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Realtime Database not initialized");
    return false;
  }

  try {
    const userRef = ref(emergencyLocatorDb, `ert_users/${userId}`);
    const userSnapshot = await get(userRef);
    return userSnapshot.exists() && userSnapshot.val().hasERTAccess === true;
  } catch (error) {
    console.error('Error checking emergency locator access (Realtime DB):', error);
    return false;
  }
}

// Function to get emergency locator auth instance
export function getEmergencyLocatorAuthRealtime() {
  return emergencyLocatorAuth;
}

// Function to get emergency locator db instance
export function getEmergencyLocatorDbRealtime() {
  return emergencyLocatorDb;
} 