// Test script to verify residents data in Firebase
// Run this in your browser console to check if residents data exists

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

// Test function to check residents data
async function testResidentsData() {
  try {
    console.log("🔍 Testing residents data in Firebase...");
    
    const residentsRef = collection(db, "residents");
    const snapshot = await getDocs(residentsRef);
    
    console.log(`📊 Found ${snapshot.docs.length} residents in Firebase`);
    
    if (snapshot.docs.length > 0) {
      console.log("📋 Sample resident data:");
      const sampleDoc = snapshot.docs[0];
      const data = sampleDoc.data();
      console.log("Document ID:", sampleDoc.id);
      console.log("Data:", data);
      
      // Check for new fields
      const newFields = [
        'מספר בית',
        'הורה/ילד', 
        'מסגרת',
        'מקום מסגרת',
        'תאריך לידה',
        'סטטוס מגורים'
      ];
      
      console.log("🔍 Checking for new fields:");
      newFields.forEach(field => {
        if (data[field] !== undefined) {
          console.log(`✅ ${field}: "${data[field]}"`);
        } else {
          console.log(`❌ ${field}: Not found`);
        }
      });
      
      // Check for required fields
      const requiredFields = ['שם פרטי', 'שם משפחה', 'טלפון', 'שכונה', 'סטטוס'];
      console.log("🔍 Checking for required fields:");
      requiredFields.forEach(field => {
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
    console.error("❌ Error testing residents data:", error);
  }
}

// Export for use in browser console
window.testResidentsData = testResidentsData;

console.log("🧪 Test script loaded. Run 'testResidentsData()' in console to test.");
