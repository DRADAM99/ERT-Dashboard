/**
 * Emergency Residents Sync - Simple and Reliable
 * 
 * This script handles the emergency workflow:
 * 1. Import all data from Google Sheet to Firebase
 * 2. Listen for status changes and update Firebase in real-time
 * 3. Keep data in Firebase until emergency ends
 * 
 * Usage:
 * - Run syncAllResidents() to import all data
 * - Set up triggers for automatic status monitoring
 * - Run endEmergencyEvent() when emergency is over
 */

// Firebase configuration
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE";

// Sheet configuration
const SHEET_NAME = "2025";
const DATA_RANGE = "A1:Z500";

// ===== MAIN SYNC FUNCTION =====
function syncAllResidents() {
  try {
    console.log("🚨 EMERGENCY: Starting residents sync...");
    
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
    
    console.log(`📊 Found ${dataRows.length} residents to sync`);
    console.log("📋 Headers:", headers);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const residentData = {};
      
      // Map all headers to data
      headers.forEach((header, index) => {
        if (header && row[index] !== undefined) {
          residentData[header] = row[index];
        }
      });
      
      // Add metadata
      residentData.syncedAt = new Date();
      residentData.source = "emergency_sheet";
      residentData.rowIndex = i + 2;
      residentData.emergencyEventId = getEmergencyEventId();
      
      // Generate unique ID
      const residentId = generateResidentId(residentData);
      
      // Sync to Firebase
      const success = syncResidentToFirebase(residentId, residentData);
      
      if (success) {
        successCount++;
        console.log(`✅ Synced resident ${i + 1}: ${residentData['*שם פרטי'] || residentData['שם פרטי'] || 'Unknown'}`);
      } else {
        errorCount++;
        console.log(`❌ Failed to sync resident ${i + 1}`);
      }
      
      // Small delay to avoid rate limiting
      Utilities.sleep(100);
    }
    
    console.log(`🎯 SYNC COMPLETE: ${successCount} successful, ${errorCount} errors`);
    
    // Send notification
    if (errorCount > 0) {
      sendNotification(`Emergency sync completed with ${errorCount} errors. Check logs.`);
    } else {
      sendNotification(`Emergency sync successful: ${successCount} residents synced.`);
    }
    
    return { success: successCount, errors: errorCount };
    
  } catch (error) {
    console.error("🚨 EMERGENCY SYNC ERROR:", error);
    sendNotification(`Emergency sync failed: ${error.message}`);
    return { success: 0, errors: 1 };
  }
}

// ===== FIREBASE SYNC =====
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
  // Use phone number if available
  const phone = residentData['*טלפון נייד'] || residentData['טלפון נייד'] || residentData['טלפון'];
  if (phone) {
    return `resident_${phone.replace(/\D/g, '')}`;
  }
  
  // Use name if available
  const firstName = residentData['*שם פרטי'] || residentData['שם פרטי'];
  const lastName = residentData['*שם משפחה'] || residentData['שם משפחה'];
  if (firstName && lastName) {
    return `resident_${firstName}_${lastName}_${Date.now()}`;
  }
  
  // Fallback
  return `resident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function getEmergencyEventId() {
  // Generate a unique event ID for this emergency
  return `emergency_${new Date().toISOString().split('T')[0]}_${Date.now()}`;
}

function sendNotification(message) {
  console.log(message);
  // You can add email notifications here if needed
}

// ===== STATUS MONITORING =====
function monitorStatusChanges() {
  try {
    console.log("🔍 Monitoring status changes...");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log("❌ Sheet not found");
      return;
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      console.log("❌ No data found");
      return;
    }
    
    const headers = values[0];
    const statusColumnIndex = headers.indexOf('סטטוס');
    
    if (statusColumnIndex === -1) {
      console.log("❌ Status column not found");
      return;
    }
    
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    let updatedCount = 0;
    
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const status = row[statusColumnIndex];
      
      if (status && status !== '') {
        // Get resident ID
        const phone = row[headers.indexOf('*טלפון נייד')] || row[headers.indexOf('טלפון נייד')] || row[headers.indexOf('טלפון')];
        const residentId = phone ? `resident_${phone.replace(/\D/g, '')}` : null;
        
        if (residentId) {
          // Update status in Firebase
          const success = updateResidentStatus(residentId, status);
          if (success) {
            updatedCount++;
            console.log(`✅ Updated status for resident ${i + 2}: ${status}`);
          }
        }
      }
    }
    
    console.log(`📊 Status monitoring complete: ${updatedCount} updates`);
    
  } catch (error) {
    console.error("❌ Status monitoring error:", error);
  }
}

function updateResidentStatus(residentId, newStatus) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${residentId}`;
    
    const payload = {
      fields: {
        'סטטוס': { stringValue: newStatus },
        'statusUpdatedAt': { timestampValue: new Date().toISOString() }
      }
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
    return response.getResponseCode() === 200;
    
  } catch (error) {
    console.error(`Error updating status for ${residentId}:`, error);
    return false;
  }
}

// ===== TRIGGER SETUP =====
function setupEmergencyTriggers() {
  console.log("🚨 Setting up emergency triggers...");
  
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'monitorStatusChanges') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new triggers
  // Monitor status changes every 2 minutes during emergency
  ScriptApp.newTrigger('monitorStatusChanges')
    .timeBased()
    .everyMinutes(2)
    .create();
  
  console.log("✅ Emergency triggers set up successfully");
}

// ===== EMERGENCY END =====
function endEmergencyEvent() {
  try {
    console.log("🏁 Ending emergency event...");
    
    // Export data to a new sheet (for backup)
    exportEmergencyData();
    
    // Clear Firebase data
    clearFirebaseData();
    
    // Remove triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'monitorStatusChanges') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    console.log("✅ Emergency event ended successfully");
    sendNotification("Emergency event ended. Data exported and Firebase cleared.");
    
  } catch (error) {
    console.error("❌ Error ending emergency event:", error);
  }
}

function exportEmergencyData() {
  try {
    console.log("📤 Exporting emergency data...");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log("❌ Sheet not found for export");
      return;
    }
    
    // Create backup sheet with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupSheetName = `Emergency_Backup_${timestamp}`;
    
    const backupSheet = spreadsheet.insertSheet(backupSheetName);
    const data = sheet.getDataRange().getValues();
    
    backupSheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    
    console.log(`✅ Emergency data exported to sheet: ${backupSheetName}`);
    
  } catch (error) {
    console.error("❌ Error exporting emergency data:", error);
  }
}

function clearFirebaseData() {
  try {
    console.log("🗑️ Clearing Firebase data...");
    
    let totalDeleted = 0;
    let pageToken = null;
    let hasMorePages = true;
    
    while (hasMorePages) {
      let url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents?pageSize=100`;
      
      if (pageToken) {
        url += `&pageToken=${pageToken}`;
      }
      
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
        pageToken = responseData.nextPageToken || null;
        hasMorePages = !!pageToken;
        
        console.log(`📄 Processing page with ${documents.length} documents...`);
        
        let pageDeletedCount = 0;
        for (let i = 0; i < documents.length; i++) {
          const doc = documents[i];
          const docId = doc.name.split('/').pop();
          
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
              pageDeletedCount++;
            }
          } catch (error) {
            console.error(`Failed to delete document ${docId}:`, error);
          }
          
          // Small delay to avoid rate limiting
          Utilities.sleep(50);
        }
        
        totalDeleted += pageDeletedCount;
        console.log(`✅ Deleted ${pageDeletedCount} documents from this page (Total: ${totalDeleted})`);
        
        // If there are more pages, wait a bit before processing next page
        if (hasMorePages) {
          Utilities.sleep(500);
        }
        
      } else {
        console.error(`❌ Failed to fetch documents. Response code: ${responseCode}`);
        break;
      }
    }
    
    console.log(`🎯 CLEAR COMPLETE: Deleted ${totalDeleted} total documents from Firebase`);
    
    // Verify the collection is empty
    const verifyUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents?pageSize=1`;
    const verifyResponse = UrlFetchApp.fetch(verifyUrl, options);
    const verifyData = JSON.parse(verifyResponse.getContentText());
    const remainingDocs = verifyData.documents || [];
    
    if (remainingDocs.length === 0) {
      console.log("✅ Verification: Firebase collection is now empty");
    } else {
      console.log(`⚠️ Warning: ${remainingDocs.length} documents may still remain`);
    }
    
  } catch (error) {
    console.error("❌ Error clearing Firebase data:", error);
  }
}

// ===== MANUAL FUNCTIONS =====
function clearAndSync() {
  console.log("🧹 CLEARING AND SYNCING...");
  clearFirebaseData();
  Utilities.sleep(1000); // Wait 1 second
  syncAllResidents();
  console.log("✅ Clear and sync completed");
}

function startEmergency() {
  console.log("🚨 STARTING EMERGENCY SEQUENCE...");
  syncAllResidents();
  setupEmergencyTriggers();
  console.log("✅ Emergency sequence started");
}

function testConnection() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    const response = UrlFetchApp.fetch(url);
    console.log("✅ Firebase connection successful");
    return true;
  } catch (error) {
    console.error("❌ Firebase connection failed:", error);
    return false;
  }
}

function checkForDuplicates() {
  try {
    console.log("🔍 Checking for duplicate residents...");
    
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    const response = UrlFetchApp.fetch(url);
    const responseData = JSON.parse(response.getContentText());
    const documents = responseData.documents || [];
    
    console.log(`📊 Found ${documents.length} total documents`);
    
    // Group by phone number and name to find duplicates
    const phoneGroups = {};
    const nameGroups = {};
    
    documents.forEach(doc => {
      const data = doc.fields || {};
      const phone = data['*טלפון נייד']?.stringValue || data['טלפון נייד']?.stringValue || data['טלפון']?.stringValue || '';
      const firstName = data['*שם פרטי']?.stringValue || data['שם פרטי']?.stringValue || '';
      const lastName = data['*שם משפחה']?.stringValue || data['שם משפחה']?.stringValue || '';
      const fullName = `${firstName} ${lastName}`.trim();
      
      if (phone) {
        if (!phoneGroups[phone]) phoneGroups[phone] = [];
        phoneGroups[phone].push({ id: doc.name.split('/').pop(), data: data });
      }
      
      if (fullName) {
        if (!nameGroups[fullName]) nameGroups[fullName] = [];
        nameGroups[fullName].push({ id: doc.name.split('/').pop(), data: data });
      }
    });
    
    // Check for phone duplicates
    console.log("\n📱 Phone number duplicates:");
    Object.keys(phoneGroups).forEach(phone => {
      if (phoneGroups[phone].length > 1) {
        console.log(`  Phone ${phone}: ${phoneGroups[phone].length} documents`);
        phoneGroups[phone].forEach(doc => {
          console.log(`    - ${doc.id}`);
        });
      }
    });
    
    // Check for name duplicates
    console.log("\n👤 Name duplicates:");
    Object.keys(nameGroups).forEach(name => {
      if (nameGroups[name].length > 1) {
        console.log(`  Name "${name}": ${nameGroups[name].length} documents`);
        nameGroups[name].forEach(doc => {
          console.log(`    - ${doc.id}`);
        });
      }
    });
    
    // Show all document IDs
    console.log("\n📋 All document IDs:");
    documents.forEach(doc => {
      const data = doc.fields || {};
      const phone = data['*טלפון נייד']?.stringValue || data['טלפון נייד']?.stringValue || data['טלפון']?.stringValue || '';
      const firstName = data['*שם פרטי']?.stringValue || data['שם פרטי']?.stringValue || '';
      const lastName = data['*שם משפחה']?.stringValue || data['שם משפחה']?.stringValue || '';
      console.log(`  ${doc.name.split('/').pop()}: ${firstName} ${lastName} (${phone})`);
    });
    
  } catch (error) {
    console.error("❌ Error checking for duplicates:", error);
  }
}
