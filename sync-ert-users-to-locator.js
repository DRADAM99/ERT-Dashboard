// Script to sync ERT users to the Emergency Locator project
// This ensures only authorized ERT users can access the emergency locator

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

// Main ERT Dashboard Firebase config
const mainERTConfig = {
  apiKey: "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE",
  authDomain: "emergency-dashboard-a3842.firebaseapp.com",
  projectId: "emergency-dashboard-a3842",
  storageBucket: "emergency-dashboard-a3842.firebasestorage.app",
  messagingSenderId: "394209477264",
  appId: "1:394209477264:web:9fdf362f4d744beaa34e15"
};

// Emergency Locator Firebase config (you'll need to get this from the emergency-locator project)
const emergencyLocatorConfig = {
  apiKey: "YOUR_EMERGENCY_LOCATOR_API_KEY", // Replace with actual API key
  authDomain: "emergency-locator-585a5.firebaseapp.com",
  projectId: "emergency-locator-585a5",
  storageBucket: "emergency-locator-585a5.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID", // Replace with actual sender ID
  appId: "YOUR_APP_ID" // Replace with actual app ID
};

// Initialize both Firebase apps
const mainERTApp = initializeApp(mainERTConfig, 'main-ert');
const emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator');

// Get Firestore instances
const mainERTDb = getFirestore(mainERTApp);
const emergencyLocatorDb = getFirestore(emergencyLocatorApp);

async function syncERTUsersToLocator() {
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
    
    // Sync each user to the emergency locator project
    for (const user of users) {
      try {
        // Create user document in emergency locator with ERT access
        await setDoc(doc(emergencyLocatorDb, 'ert_users', user.id), {
          email: user.email,
          name: user.name || user.fullName || '',
          role: user.role || 'staff',
          alias: user.alias || '',
          syncedAt: new Date(),
          hasERTAccess: true
        });
        
        console.log(`✓ Synced user: ${user.email}`);
      } catch (error) {
        console.error(`✗ Failed to sync user ${user.email}:`, error);
      }
    }
    
    console.log('ERT user sync completed!');
    
  } catch (error) {
    console.error('Error syncing ERT users:', error);
  }
}

// Function to add a single user to emergency locator
async function addUserToEmergencyLocator(userId, userData) {
  try {
    await setDoc(doc(emergencyLocatorDb, 'ert_users', userId), {
      email: userData.email,
      name: userData.name || userData.fullName || '',
      role: userData.role || 'staff',
      alias: userData.alias || '',
      syncedAt: new Date(),
      hasERTAccess: true
    });
    
    console.log(`✓ Added user to emergency locator: ${userData.email}`);
    return true;
  } catch (error) {
    console.error(`✗ Failed to add user to emergency locator: ${userData.email}`, error);
    return false;
  }
}

// Export functions for use in your app
export { syncERTUsersToLocator, addUserToEmergencyLocator };

// Run sync if this script is executed directly
if (typeof window === 'undefined') {
  syncERTUsersToLocator();
} 