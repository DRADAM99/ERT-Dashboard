#!/usr/bin/env node

/**
 * Sync Current ERT Users to Emergency Locator
 * 
 * This script syncs all existing ERT users to the emergency locator project.
 * Run this once to sync all current users.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "firebase/firestore";

// Main ERT Dashboard Firebase config
const mainERTConfig = {
  apiKey: "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE",
  authDomain: "emergency-dashboard-a3842.firebaseapp.com",
  projectId: "emergency-dashboard-a3842",
  storageBucket: "emergency-dashboard-a3842.firebasestorage.app",
  messagingSenderId: "394209477264",
  appId: "1:394209477264:web:9fdf362f4d744beaa34e15"
};

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

// Initialize both Firebase apps
const mainERTApp = initializeApp(mainERTConfig, 'main-ert-sync');
const emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator-sync');

// Get Firestore instances
const mainERTDb = getFirestore(mainERTApp);
const emergencyLocatorDb = getFirestore(emergencyLocatorApp);

async function syncCurrentUsers() {
  try {
    console.log('🚨 Starting sync of current ERT users to Emergency Locator...\n');
    
    // Get all users from main ERT project
    console.log('📋 Fetching users from main ERT project...');
    const usersSnapshot = await getDocs(collection(mainERTDb, 'users'));
    const users = [];
    
    usersSnapshot.forEach((doc) => {
      users.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Found ${users.length} users in main ERT project\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Sync each user to the emergency locator project
    for (const user of users) {
      try {
        console.log(`🔄 Syncing user: ${user.email}...`);
        
        // Check if user already exists in emergency locator
        const existingUserDoc = await getDoc(doc(emergencyLocatorDb, 'ert_users', user.id));
        
        if (existingUserDoc.exists()) {
          console.log(`⚠️  User ${user.email} already exists in emergency locator`);
          successCount++;
          continue;
        }
        
        // Create user document in emergency locator
        await setDoc(doc(emergencyLocatorDb, 'ert_users', user.id), {
          email: user.email,
          name: user.name || user.fullName || user.alias || '',
          role: user.role || 'staff',
          alias: user.alias || '',
          syncedAt: new Date(),
          hasERTAccess: true,
          userId: user.id,
          autoSynced: true
        });
        
        console.log(`✅ Successfully synced: ${user.email}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to sync user ${user.email}:`, error.message);
        failCount++;
      }
    }
    
    console.log('\n🎉 Current users sync completed!');
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`📊 Total: ${users.length}`);
    
    if (successCount > 0) {
      console.log('\n🎯 Next Steps:');
      console.log('1. Go to your ERT dashboard');
      console.log('2. Navigate to the Emergency Locator section');
      console.log('3. All synced users should now have access to the emergency locator');
      console.log('4. New users will be automatically synced when created via the UI');
    }
    
  } catch (error) {
    console.error('💥 Error syncing current users:', error);
  }
}

// Run the sync
syncCurrentUsers(); 