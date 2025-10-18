/**
 * Complete Google Apps Script to sync residents data from Google Sheets to Firebase
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this complete script
 * 4. Update the FIREBASE_PROJECT_ID and FIREBASE_WEB_API_KEY if needed
 * 5. Set up a trigger to run this function automatically
 */

// Firebase configuration - UPDATE THESE VALUES
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyBHeb_AS_Iyfc8K7z2T01tLYfhFfGAs_wk";

// Sheet configuration - UPDATE THESE TO MATCH YOUR SHEET
const SHEET_NAME = "2025"; // Change this to your actual sheet name
const DATA_RANGE = "A1:Z500";

// ===== MAIN SYNC FUNCTION =====
function syncResidentsToFirebase() {
  try {
    console.log("Starting residents sync to Firebase...");
    
    // First, clear existing residents data
    console.log("Clearing existing residents data...");
    clearResidentsCollection();
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      throw new Error("No data found in sheet");
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    console.log(`Found ${dataRows.length} residents to sync`);
    console.log("Headers found:", headers);
    console.log("Header mapping:");
    headers.forEach((header, index) => {
      console.log(`  Column ${String.fromCharCode(65 + index)} (${index + 1}): "${header}"`);
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const residentData = {};
      
      headers.forEach((header, index) => {
        if (header && row[index] !== undefined) {
          residentData[header] = row[index];
          
          // Special handling for סטטוס field
          if (header === 'סטטוס') {
            console.log(`📊 Found סטטוס value: "${row[index]}" for resident ${i + 2}`);
          }
        }
      });
      
      // Debug: Show what data is being synced for first few residents
      if (i < 3) {
        console.log(`📋 Resident ${i + 2} data being synced:`, residentData);
      }
      
      const residentId = generateResidentId(residentData);
      residentData.syncedAt = new Date();
      residentData.source = "google_sheets";
      residentData.rowIndex = i + 2;
      
      const success = syncResidentToFirebase(residentId, residentData);
      
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      Utilities.sleep(100); // Small delay to avoid rate limiting
    }
    
    console.log(`Sync completed: ${successCount} successful, ${errorCount} errors`);
    
    if (errorCount > 0) {
      sendNotification(`Residents sync completed with ${errorCount} errors.`);
    } else {
      sendNotification(`Residents sync completed successfully: ${successCount} residents synced.`);
    }
    
  } catch (error) {
    console.error("Error syncing residents to Firebase:", error);
    sendNotification(`Error syncing residents to Firebase: ${error.message}`);
  }
}

// ===== CLEAR RESIDENTS COLLECTION =====
function clearResidentsCollection() {
  try {
    console.log("Clearing residents collection...");
    
    // Get all documents in the residents collection
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    
    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      const responseData = JSON.parse(response.getContentText());
      const documents = responseData.documents || [];
      
      console.log(`Found ${documents.length} existing documents to delete`);
      
      let deletedCount = 0;
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const docId = doc.name.split('/').pop(); // Extract document ID from full path
        
        const deleteUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${docId}`;
        
        const deleteOptions = {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          muteHttpExceptions: true
        };
        
        try {
          const deleteResponse = UrlFetchApp.fetch(deleteUrl, deleteOptions);
          if (deleteResponse.getResponseCode() === 200) {
            deletedCount++;
            console.log(`Deleted document: ${docId}`);
          } else {
            console.log(`Failed to delete document ${docId}: ${deleteResponse.getResponseCode()}`);
          }
        } catch (error) {
          console.error(`Failed to delete document ${docId}:`, error);
        }
        
        Utilities.sleep(50); // Small delay between deletions
      }
      
      console.log(`Successfully deleted ${deletedCount} documents`);
    } else {
      console.error(`Failed to get residents collection: ${responseCode}`);
      console.error(`Response: ${response.getContentText()}`);
    }
    
  } catch (error) {
    console.error("Error clearing residents collection:", error);
  }
}

// ===== FIREBASE SYNC HELPER =====
function syncResidentToFirebase(residentId, residentData) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${residentId}`;
    
    const payload = {
      fields: convertToFirestoreFields(residentData)
    };
    
    const options = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      console.log(`Successfully synced resident: ${residentId}`);
      return true;
    } else {
      console.error(`Failed to sync resident ${residentId}: ${responseCode}`);
      console.error(`Response: ${response.getContentText()}`);
      return false;
    }
    
  } catch (error) {
    console.error(`Error syncing resident ${residentId}:`, error);
    return false;
  }
}

// ===== UTILITY FUNCTIONS =====
function convertToFirestoreFields(data) {
  const fields = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }
    
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = { integerValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (value instanceof Date) {
      fields[key] = { timestampValue: value.toISOString() };
    }
  }
  
  return fields;
}

function generateResidentId(residentData) {
  // Try to use phone number first
  if (residentData['טלפון']) {
    return `resident_${residentData['טלפון'].replace(/\D/g, '')}`;
  }
  // Then try full name
  else if (residentData['שם פרטי'] && residentData['שם משפחה']) {
    const fullName = `${residentData['שם פרטי']} ${residentData['שם משפחה']}`;
    return `resident_${fullName.replace(/\s+/g, '_')}_${Date.now()}`;
  }
  // Fallback to timestamp
  else {
    return `resident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

function getFirebaseAccessToken() {
  return FIREBASE_WEB_API_KEY;
}

function sendNotification(message) {
  console.log(message);
}

// ===== TRIGGER SETUP =====
function setupTriggers() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncResidentsToFirebase') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new triggers
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyMinutes(5).create();
  
  console.log("Triggers set up successfully");
}

// ===== MANUAL SYNC =====
function manualSync() {
  syncResidentsToFirebase();
}

// ===== MANUAL CLEAR =====
function clearAllResidents() {
  clearResidentsCollection();
}

// ===== TEST FUNCTIONS =====
function testFirebaseConnection() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    const response = UrlFetchApp.fetch(url);
    console.log("Firebase connection test successful");
    return true;
  } catch (error) {
    console.error("Firebase connection test failed:", error);
    return false;
  }
}

function testNewFieldsSync() {
  try {
    console.log("=== TESTING NEW FIELDS SYNC ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log("❌ Sheet 'גליון1' not found!");
      return false;
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      console.log("❌ No data found in sheet");
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    console.log(`✅ Found ${dataRows.length} residents in sheet`);
    console.log("📋 All Headers:", headers);
    
    // Check for new fields
    const newFields = [
      'מספר בית',    // B1
      'הורה/ילד',    // N1
      'מסגרת',       // H1
      'מקום מסגרת',  // I1
      'תאריך לידה',  // F1
      'סטטוס מגורים', // M1
      'סטטוס'        // P1 - Status field from Twilio bot - IMPORTANT!
    ];
    
    console.log("🔍 Checking for new fields:");
    newFields.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        console.log(`✅ Found: ${field} at column ${String.fromCharCode(65 + index)}`);
      } else {
        console.log(`❌ Missing: ${field}`);
      }
    });
    
    // Show sample data for new fields
    if (dataRows.length > 0) {
      const sampleRow = dataRows[0];
      console.log("📊 Sample data for new fields:");
      newFields.forEach(field => {
        const index = headers.indexOf(field);
        if (index !== -1) {
          console.log(`  ${field}: "${sampleRow[index]}"`);
          
          // Special emphasis on סטטוס field
          if (field === 'סטטוס') {
            console.log(`  🎯 סטטוס field found at column ${String.fromCharCode(65 + index)} (${index + 1})`);
          }
        }
      });
    }
    
    console.log("=== TEST COMPLETE ===");
    return true;
    
  } catch (error) {
    console.log("❌ TEST ERROR: " + error.toString());
    return false;
  }
}

function testFirebaseSyncWithNewFields() {
  try {
    console.log("=== TESTING FIREBASE SYNC WITH NEW FIELDS ===");
    
    // Run the main sync function
    syncResidentsToFirebase();
    
    console.log("✅ Sync completed. Check Firebase Console for new fields.");
    return true;
    
  } catch (error) {
    console.log("❌ SYNC ERROR: " + error.toString());
    return false;
  }
}

// ===== COMPREHENSIVE TEST =====
function comprehensiveTest() {
  try {
    console.log("=== COMPREHENSIVE FIREBASE TEST ===");
    
    // Test 1: Check sheet access
    console.log("1. Testing sheet access...");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log("❌ ERROR: Sheet '" + SHEET_NAME + "' not found!");
      console.log("Available sheets:");
      const sheets = spreadsheet.getSheets();
      sheets.forEach(s => console.log("  - " + s.getName()));
      return false;
    }
    console.log("✅ Sheet access successful");
    
    // Test 2: Check data structure
    console.log("2. Testing data structure...");
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      console.log("❌ ERROR: No data found in sheet");
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    console.log(`✅ Found ${dataRows.length} residents in sheet`);
    console.log("Headers: " + JSON.stringify(headers));
    
    if (dataRows.length > 0) {
      console.log("Sample row: " + JSON.stringify(dataRows[0]));
    }
    
    // Test 3: Test Firebase connection
    console.log("3. Testing Firebase connection...");
    const testUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    
    try {
      const response = UrlFetchApp.fetch(testUrl);
      console.log("✅ Firebase connection successful: " + response.getResponseCode());
    } catch (error) {
      console.log("❌ Firebase connection failed: " + error.toString());
      return false;
    }
    
    // Test 4: Test new fields
    console.log("4. Testing new fields...");
    testNewFieldsSync();
    
    console.log("=== COMPREHENSIVE TEST COMPLETE ===");
    return true;
    
  } catch (error) {
    console.log("❌ COMPREHENSIVE TEST ERROR: " + error.toString());
    return false;
  }
}

// ===== FIND SHEET NAMES =====
function findSheetNames() {
  try {
    console.log("=== FINDING SHEET NAMES ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = spreadsheet.getSheets();
    
    console.log("Available sheets in your spreadsheet:");
    sheets.forEach((sheet, index) => {
      console.log(`${index + 1}. "${sheet.getName()}"`);
    });
    
    console.log("\nTo use a specific sheet, update the SHEET_NAME constant:");
    console.log("const SHEET_NAME = \"YOUR_SHEET_NAME\";");
    
  } catch (error) {
    console.log("❌ Error finding sheet names: " + error.toString());
  }
}

// ===== VERIFY סטטוס FIELD =====
function verifyStatusField() {
  try {
    console.log("=== VERIFYING סטטוס FIELD ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log("❌ Sheet not found!");
      return false;
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      console.log("❌ No data found in sheet");
      return false;
    }
    
    const headers = values[0];
    const statusIndex = headers.indexOf('סטטוס');
    
    if (statusIndex === -1) {
      console.log("❌ סטטוס field not found in headers!");
      console.log("Available headers:", headers);
      return false;
    }
    
    console.log(`✅ סטטוס field found at column ${String.fromCharCode(65 + statusIndex)} (${statusIndex + 1})`);
    
    // Check status values
    const statusValues = values.slice(1)
      .map(row => row[statusIndex])
      .filter(value => value !== "" && value !== undefined && value !== null);
    
    console.log(`📊 Found ${statusValues.length} residents with status values`);
    console.log("Status values found:", [...new Set(statusValues)]);
    
    return true;
    
  } catch (error) {
    console.log("❌ Error verifying סטטוס field: " + error.toString());
    return false;
  }
}

// ===== ANALYZE SHEET STRUCTURE =====
function analyzeSheetStructure() {
  try {
    console.log("=== ANALYZING SHEET STRUCTURE ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log("❌ Sheet not found!");
      return false;
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      console.log("❌ No data found in sheet");
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    console.log(`📊 Found ${dataRows.length} residents in sheet`);
    console.log("📋 All headers with column positions:");
    
    headers.forEach((header, index) => {
      const columnLetter = String.fromCharCode(65 + index);
      console.log(`  ${columnLetter}${index + 1}: "${header}"`);
    });
    
    // Check for required fields
    const requiredFields = ['סטטוס', 'שם פרטי', 'שם משפחה', 'טלפון', 'שכונה'];
    console.log("\n🔍 Checking required fields:");
    
    requiredFields.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        console.log(`  ✅ "${field}" found at column ${String.fromCharCode(65 + index)}`);
      } else {
        console.log(`  ❌ "${field}" NOT FOUND`);
      }
    });
    
    // Show sample data
    if (dataRows.length > 0) {
      console.log("\n📋 Sample resident data (first row):");
      const sampleRow = dataRows[0];
      headers.forEach((header, index) => {
        if (sampleRow[index] !== undefined && sampleRow[index] !== "") {
          console.log(`  ${header}: "${sampleRow[index]}"`);
        }
      });
    }
    
    return true;
    
  } catch (error) {
    console.log("❌ Error analyzing sheet structure: " + error.toString());
    return false;
  }
}
