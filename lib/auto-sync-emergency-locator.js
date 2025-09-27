// Automatic Emergency Locator User Sync
// This function automatically syncs users to the emergency locator when they're added to the main ERT project

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

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

try {
  emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator-auto');
  emergencyLocatorDb = getFirestore(emergencyLocatorApp);
  console.log("Emergency Locator Auto Sync initialized successfully");
} catch (error) {
  console.error("Failed to initialize Emergency Locator Auto Sync:", error);
}

// Function to automatically sync a user to emergency locator
export async function autoSyncUserToEmergencyLocator(userId, userData) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Auto Sync not initialized");
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
      userId: userId,
      autoSynced: true
    });
    
    console.log(`✅ Auto-synced user to emergency locator: ${userData.email}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to auto-sync user to emergency locator: ${userData.email}`, error);
    return false;
  }
}

// Function to sync all existing users
export async function syncAllExistingUsers(mainERTDb) {
  if (!emergencyLocatorDb) {
    console.error("Emergency Locator Auto Sync not initialized");
    return false;
  }

  try {
    console.log('🔄 Starting sync of all existing users...');
    
    // Get all users from main ERT project
    const { collection, getDocs } = await import("firebase/firestore");
    const usersSnapshot = await getDocs(collection(mainERTDb, 'users'));
    const users = [];
    
    usersSnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`📋 Found ${users.length} users to sync`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Sync each user to the emergency locator project
    for (const user of users) {
      try {
        const success = await autoSyncUserToEmergencyLocator(user.id, user);
        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to sync user ${user.email}:`, error);
        failCount++;
      }
    }
    
    console.log(`🎉 Sync completed! Success: ${successCount}, Failed: ${failCount}`);
    return { success: successCount, failed: failCount };
    
  } catch (error) {
    console.error('💥 Error syncing existing users:', error);
    return false;
  }
} 