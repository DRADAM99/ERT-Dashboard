#!/usr/bin/env node

/**
 * Add Admin to Emergency Locator
 * 
 * This script manually adds an admin user to the emergency locator project.
 * Replace the email and user ID with your actual admin credentials.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

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
const emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator-admin');
const emergencyLocatorDb = getFirestore(emergencyLocatorApp);

async function addAdminToEmergencyLocator() {
  try {
    console.log('🚨 Adding admin to Emergency Locator...\n');
    
    // Replace these with your actual admin details
    const adminEmail = "adawint@gmail.com"; // Replace with your email
    const adminUserId = "your-user-id-here"; // Replace with your user ID
    
    console.log(`📧 Admin Email: ${adminEmail}`);
    console.log(`🆔 Admin User ID: ${adminUserId}`);
    console.log('\n⚠️  Please replace the adminUserId in the script with your actual user ID');
    console.log('   You can find your user ID in the Firebase Console > Authentication > Users');
    
    // Create admin user document in emergency locator
    await setDoc(doc(emergencyLocatorDb, 'ert_users', adminUserId), {
      email: adminEmail,
      name: "Admin User",
      role: "admin",
      alias: "Admin",
      syncedAt: new Date(),
      hasERTAccess: true,
      userId: adminUserId,
      autoSynced: true
    });
    
    console.log('\n✅ Admin successfully added to emergency locator!');
    console.log('\n🎯 Next Steps:');
    console.log('1. Go to your ERT dashboard');
    console.log('2. Navigate to the Emergency Locator section');
    console.log('3. You should now have access to the emergency locator');
    
  } catch (error) {
    console.error('💥 Error adding admin to emergency locator:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure you replaced the adminUserId with your actual user ID');
    console.log('2. Check that the Firebase config is correct');
    console.log('3. Verify that the emergency locator project exists');
  }
}

// Run the script
addAdminToEmergencyLocator(); 