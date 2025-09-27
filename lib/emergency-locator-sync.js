// Emergency Locator User Sync Utility
// This file handles syncing ERT users to the emergency locator project

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

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
  emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator');
  emergencyLocatorDb = getFirestore(emergencyLocatorApp);
  emergencyLocatorAuth = getAuth(emergencyLocatorApp);
  console.log("Emergency Locator Firebase initialized successfully");
} catch (error) {
  console.error("Failed to initialize Emergency Locator Firebase:", error);
}

// Function to sync a single user to emergency locator
export async function syncUserToEmergencyLocator(userId, userData) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Firebase not initialized");
    return false;
  }

  try {
    // Check if user already exists in emergency locator
    const userDoc = await getDoc(doc(emergencyLocatorDb, 'ert_users', userId));
    
    if (userDoc.exists()) {
      console.log(`User ${userData.email} already exists in emergency locator`);
      return true;
    }

    // Create user document in emergency locator
    await setDoc(doc(emergencyLocatorDb, 'ert_users', userId), {
      email: userData.email,
      name: userData.name || userData.fullName || '',
      role: userData.role || 'staff',
      alias: userData.alias || '',
      syncedAt: new Date(),
      hasERTAccess: true,
      userId: userId
    });
    
    console.log(`✓ Synced user to emergency locator: ${userData.email}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to sync user to emergency locator: ${userData.email}`, error);
    return false;
  }
}

// Function to sync all ERT users to emergency locator
export async function syncAllERTUsersToLocator(mainERTDb) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Firebase not initialized");
    return false;
  }

  try {
    console.log('Starting ERT user sync to Emergency Locator...');
    
    // Get all users from main ERT project
    const usersSnapshot = await getDocs(collection(mainERTDb, 'users'));
    const users = [];
    
    usersSnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`Found ${users.length} users in main ERT project`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Sync each user to the emergency locator project
    for (const user of users) {
      try {
        const success = await syncUserToEmergencyLocator(user.id, user);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`✗ Failed to sync user ${user.email}:`, error);
        failCount++;
      }
    }
    
    console.log(`ERT user sync completed! Success: ${successCount}, Failed: ${failCount}`);
    return { success: successCount, failed: failCount };
    
  } catch (error) {
    console.error('Error syncing ERT users:', error);
    return false;
  }
}

// Function to check if user has access to emergency locator
export async function checkEmergencyLocatorAccess(userId) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Firebase not initialized");
    return false;
  }

  try {
    const userDoc = await getDoc(doc(emergencyLocatorDb, 'ert_users', userId));
    return userDoc.exists() && userDoc.data().hasERTAccess === true;
  } catch (error) {
    console.error('Error checking emergency locator access:', error);
    return false;
  }
}

// Function to get emergency locator auth instance
export function getEmergencyLocatorAuth() {
  return emergencyLocatorAuth;
}

// Function to get emergency locator db instance
export function getEmergencyLocatorDb() {
  return emergencyLocatorDb;
} 