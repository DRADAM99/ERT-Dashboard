// Simple test to verify Firebase connection and residents data
// Run this in your browser console

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBHeb_AS_Iyfc8K7z2T01tLYfhFfGAs_wk",
  authDomain: "emergency-dashboard-a3842.firebaseapp.com",
  projectId: "emergency-dashboard-a3842",
  storageBucket: "emergency-dashboard-a3842.firebasestorage.app",
  messagingSenderId: "394209477264",
  appId: "1:394209477264:web:9fdf362f4d744beaa34e15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Test function
async function testFirebaseResidents() {
  try {
    console.log("🧪 Testing Firebase residents connection...");
    
    const residentsRef = collection(db, "residents");
    const snapshot = await getDocs(residentsRef);
    
    console.log(`📊 Found ${snapshot.docs.length} residents in Firebase`);
    
    if (snapshot.docs.length > 0) {
      console.log("📋 Sample resident data:");
      const sampleDoc = snapshot.docs[0];
      const data = sampleDoc.data();
      console.log("Document ID:", sampleDoc.id);
      console.log("All fields:", Object.keys(data));
      console.log("Sample data:", data);
      
      // Check for important fields
      const importantFields = ['סטטוס', 'שם פרטי', 'שם משפחה', 'טלפון', 'שכונה'];
      importantFields.forEach(field => {
        if (data[field] !== undefined) {
          console.log(`✅ ${field}: "${data[field]}"`);
        } else {
          console.log(`❌ ${field}: Not found`);
        }
      });
      
    } else {
      console.log("❌ No residents found in Firebase");
    }
    
  } catch (error) {
    console.error("❌ Error testing Firebase:", error);
  }
}

// Export for browser console
window.testFirebaseResidents = testFirebaseResidents;

console.log("🧪 Test script loaded. Run 'testFirebaseResidents()' in console to test.");
