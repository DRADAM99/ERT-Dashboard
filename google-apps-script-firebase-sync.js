/**
 * Google Apps Script to sync residents data from Google Sheets to Firebase
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this script
 * 4. Update the FIREBASE_PROJECT_ID and FIREBASE_WEB_API_KEY
 * 5. Set up a trigger to run this function automatically
 */

// Firebase configuration - UPDATE THESE VALUES
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE";

// Sheet configuration
const SHEET_NAME = "גליון1";
const DATA_RANGE = "A1:Z500";

function syncResidentsToFirebase() {
  try {
    console.log("Starting residents sync to Firebase...");
    
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
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const residentData = {};
      
      headers.forEach((header, index) => {
        if (header && row[index] !== undefined) {
          residentData[header] = row[index];
        }
      });
      
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
      
      Utilities.sleep(100);
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

function syncResidentToFirebase(residentId, residentData) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${residentId}`;
    
    const payload = {
      fields: convertToFirestoreFields(residentData)
    };
    
    const options = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getFirebaseAccessToken()}`
      },
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      console.log(`Successfully synced resident: ${residentId}`);
      return true;
    } else {
      console.error(`Failed to sync resident ${residentId}: ${responseCode}`);
      return false;
    }
    
  } catch (error) {
    console.error(`Error syncing resident ${residentId}:`, error);
    return false;
  }
}

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
  if (residentData.phoneNumber) {
    return `resident_${residentData.phoneNumber.replace(/\D/g, '')}`;
  } else if (residentData.fullName) {
    return `resident_${residentData.fullName.replace(/\s+/g, '_')}_${Date.now()}`;
  } else {
    return `resident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

function getFirebaseAccessToken() {
  return FIREBASE_WEB_API_KEY;
}

function sendNotification(message) {
  console.log(message);
}

function setupTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncResidentsToFirebase') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyMinutes(5).create();
  
  console.log("Triggers set up successfully");
}

function manualSync() {
  syncResidentsToFirebase();
}

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