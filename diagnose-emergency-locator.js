#!/usr/bin/env node

/**
 * Emergency Locator Diagnostic Script
 * 
 * This script diagnoses issues with the emergency locator project's Google API and authentication.
 */

import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

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

async function diagnoseEmergencyLocator() {
  console.log('🔍 Diagnosing Emergency Locator Issues...\n');
  
  try {
    // Test 1: Initialize Firebase App
    console.log('1️⃣ Testing Firebase App Initialization...');
    const emergencyLocatorApp = initializeApp(emergencyLocatorConfig, 'emergency-locator-diagnostic');
    console.log('✅ Firebase app initialized successfully');
    
    // Test 2: Initialize Firestore
    console.log('\n2️⃣ Testing Firestore Initialization...');
    const emergencyLocatorDb = getFirestore(emergencyLocatorApp);
    console.log('✅ Firestore initialized successfully');
    
    // Test 3: Initialize Auth
    console.log('\n3️⃣ Testing Authentication Initialization...');
    const emergencyLocatorAuth = getAuth(emergencyLocatorApp);
    console.log('✅ Authentication initialized successfully');
    
    // Test 4: Check if we can read from Firestore
    console.log('\n4️⃣ Testing Firestore Read Access...');
    try {
      const testDoc = await getDoc(doc(emergencyLocatorDb, 'ert_users', 'test'));
      console.log('✅ Firestore read access working');
    } catch (error) {
      console.log('❌ Firestore read access failed:', error.message);
    }
    
    // Test 5: Check if we can write to Firestore
    console.log('\n5️⃣ Testing Firestore Write Access...');
    try {
      const { setDoc } = await import("firebase/firestore");
      await setDoc(doc(emergencyLocatorDb, 'ert_users', 'test-write'), {
        test: true,
        timestamp: new Date()
      });
      console.log('✅ Firestore write access working');
    } catch (error) {
      console.log('❌ Firestore write access failed:', error.message);
    }
    
    // Test 6: Check Authentication Status
    console.log('\n6️⃣ Testing Authentication Status...');
    const currentUser = emergencyLocatorAuth.currentUser;
    if (currentUser) {
      console.log('✅ User is authenticated:', currentUser.email);
    } else {
      console.log('⚠️  No user is currently authenticated');
    }
    
    console.log('\n📋 Summary:');
    console.log('- Firebase App: ✅');
    console.log('- Firestore: ✅');
    console.log('- Authentication: ✅');
    console.log('- Read Access: ' + (testDoc ? '✅' : '❌'));
    console.log('- Write Access: ' + (testDoc ? '✅' : '❌'));
    console.log('- User Auth: ' + (currentUser ? '✅' : '❌'));
    
  } catch (error) {
    console.error('💥 Diagnostic failed:', error);
    console.log('\n🔧 Possible Issues:');
    console.log('1. Google API not enabled for emergency-locator-585a5');
    console.log('2. Firebase project doesn\'t exist or is disabled');
    console.log('3. Authentication not properly configured');
    console.log('4. Cross-project authentication issues');
  }
}

// Run the diagnostic
diagnoseEmergencyLocator(); 