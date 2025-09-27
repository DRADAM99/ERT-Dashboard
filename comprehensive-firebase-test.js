// Comprehensive Firebase Test Script
// Add this to your Google Apps Script to debug the sync issue

// Firebase configuration - VERIFY THESE MATCH YOUR ERT SYSTEM
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE";
const SHEET_NAME = "גליון1";
const DATA_RANGE = "A1:Z500";

function comprehensiveFirebaseTest() {
  try {
    Logger.log("=== COMPREHENSIVE FIREBASE TEST ===");
    
    // Test 1: Check sheet access
    Logger.log("1. Testing sheet access...");
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log("❌ ERROR: Sheet '" + SHEET_NAME + "' not found!");
      return false;
    }
    Logger.log("✅ Sheet access successful");
    
    // Test 2: Check data structure
    Logger.log("2. Testing data structure...");
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      Logger.log("❌ ERROR: No data found in sheet");
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    Logger.log(`✅ Found ${dataRows.length} residents in sheet`);
    Logger.log("Headers: " + JSON.stringify(headers));
    
    if (dataRows.length > 0) {
      Logger.log("Sample row: " + JSON.stringify(dataRows[0]));
    }
    
    // Test 3: Test Firebase connection
    Logger.log("3. Testing Firebase connection...");
    const testUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    
    try {
      const response = UrlFetchApp.fetch(testUrl);
      Logger.log("✅ Firebase connection successful: " + response.getResponseCode());
      Logger.log("Response: " + response.getContentText());
    } catch (error) {
      Logger.log("❌ Firebase connection failed: " + error.toString());
      return false;
    }
    
    // Test 4: Test document creation
    Logger.log("4. Testing document creation...");
    const testId = "test_resident_" + Date.now();
    const testData = {
      fullName: "Test Resident",
      phoneNumber: "0501234567",
      status: "חדש",
      testField: "This is a test document",
      syncedAt: new Date(),
      source: "google_sheets"
    };
    
    const success = syncResidentToFirebase(testId, testData);
    Logger.log("✅ Test document creation: " + success);
    
    // Test 5: Test actual data sync
    Logger.log("5. Testing actual data sync...");
    if (dataRows.length > 0) {
      const firstRow = dataRows[0];
      const residentData = {};
      
      headers.forEach((header, index) => {
        if (header && firstRow[index] !== undefined) {
          residentData[header] = firstRow[index];
        }
      });
      
      residentData.syncedAt = new Date();
      residentData.source = "google_sheets";
      
      const residentId = generateResidentId(residentData);
      const syncSuccess = syncResidentToFirebase(residentId, residentData);
      Logger.log("✅ Actual data sync: " + syncSuccess);
    }
    
    Logger.log("=== TEST COMPLETE ===");
    return true;
    
  } catch (error) {
    Logger.log("❌ TEST ERROR: " + error.toString());
    return false;
  }
}

function syncResidentToFirebase(residentId, residentData) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${residentId}`;
    
    const payload = {
      fields: convertToFirestoreFields(residentData)
    };
    
    Logger.log("Sending payload to Firebase: " + JSON.stringify(payload));
    
    const options = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`Firebase response for ${residentId}: ${responseCode} - ${responseText}`);
    
    if (responseCode === 200) {
      Logger.log(`✅ Successfully synced resident: ${residentId}`);
      return true;
    } else {
      Logger.log(`❌ Failed to sync resident ${residentId}: ${responseCode} - ${responseText}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`❌ Error syncing resident ${residentId}: ${error.toString()}`);
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

function forceSyncAllResidents() {
  try {
    Logger.log("=== FORCE SYNC ALL RESIDENTS ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      Logger.log("❌ ERROR: Sheet '" + SHEET_NAME + "' not found!");
      return;
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      Logger.log("❌ ERROR: No data found in sheet");
      return;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    Logger.log(`Found ${dataRows.length} residents to sync`);
    
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
      
      Logger.log(`Syncing resident ${i + 1}/${dataRows.length}: ${residentId}`);
      
      const success = syncResidentToFirebase(residentId, residentData);
      
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      Utilities.sleep(200); // Longer delay to avoid rate limiting
    }
    
    Logger.log(`=== SYNC COMPLETE: ${successCount} successful, ${errorCount} errors ===`);
    
  } catch (error) {
    Logger.log("❌ FORCE SYNC ERROR: " + error.toString());
  }
}

function checkFirebaseConsole() {
  Logger.log("=== CHECKING FIREBASE CONSOLE ===");
  Logger.log("1. Go to Firebase Console: https://console.firebase.google.com/");
  Logger.log("2. Select project: emergency-dashboard-a3842");
  Logger.log("3. Go to Firestore Database");
  Logger.log("4. Look for 'residents' collection");
  Logger.log("5. Check if documents are being created");
  Logger.log("6. Verify the data structure matches your sheet");
} 