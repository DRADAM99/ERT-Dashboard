/**
 * Combined Google Apps Script: WhatsApp Messaging + Firebase Sync
 * 
 * This script combines:
 * 1. Original WhatsApp messaging functionality via Twilio
 * 2. Enhanced Firebase sync with proper column mapping
 * 3. ירוק בעיניים (Green in Eyes) trigger function
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this complete script
 * 4. Update the configuration values below
 * 5. Set up script properties for Twilio credentials
 */

// ===== CONFIGURATION =====
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyBHeb_AS_Iyfc8K7z2T01tLYfhFfGAs_wk";
const SHEET_NAME = "2025"; // Change this to your actual sheet name
const DATA_RANGE = "A1:Z500";

// ===== ירוק בעיניים (GREEN IN EYES) TRIGGER FUNCTION =====
function activateGreenInEyes() {
  try {
    console.log("🚀 Starting ירוק בעיניים sequence...");
    
    // First sync the latest data to Firebase
    console.log("📊 Syncing residents data to Firebase...");
    syncResidentsToFirebase();
    
    // Then send WhatsApp messages to all residents
    console.log("📱 Sending WhatsApp messages to all residents...");
    sendWhatsAppMessages();
    
    console.log("✅ ירוק בעיניים sequence completed successfully!");
    
  } catch (error) {
    console.error("❌ Error in ירוק בעיניים sequence:", error);
    throw error;
  }
}

// ===== WHATSAPP MESSAGING FUNCTIONS =====

function sendWhatsAppMessages() {
  try {
    console.log("📱 Starting WhatsApp message sending...");
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }

    // Get Twilio credentials from script properties
    const ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty('ACCOUNT_SID');
    const AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
    const MESSAGING_SERVICE_SID = PropertiesService.getScriptProperties().getProperty('MESSAGING_SERVICE_SID');
    const CONTENT_SID = PropertiesService.getScriptProperties().getProperty('CONTENT_SID');

    if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID || !CONTENT_SID) {
      throw new Error("Missing Twilio credentials. Please set up script properties.");
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find phone number column index - try multiple possible names
    const phoneIndex = headers.findIndex(header => 
      header === 'טלפון' || 
      header === 'phone' || 
      header === 'Phone' ||
      header === 'מספר טלפון' ||
      header === 'טלפון נייד' ||
      header === 'מס טלפון' ||
      header === 'טלפון סלולרי'
    );
    
    if (phoneIndex === -1) {
      console.log("⚠️ Phone number column not found. Available columns:", headers);
      throw new Error("Phone number column not found. Please check your column headers.");
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 1; i < data.length; i++) { // skip header
      const row = data[i];
      const phoneNumber = row[phoneIndex];
      
      if (!phoneNumber) {
        console.log(`⏭️ Skipping row ${i + 1} due to empty phone number.`);
        continue;
      }

      // Format phone number for WhatsApp
      let formattedNumber = phoneNumber.toString().replace(/\D/g, '');
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '972' + formattedNumber.substring(1);
      } else if (!formattedNumber.startsWith('972')) {
        formattedNumber = '972' + formattedNumber;
      }

      const url = 'https://api.twilio.com/2010-04-01/Accounts/' + ACCOUNT_SID + '/Messages.json';
      const payload = {
        'To': 'whatsapp:+' + formattedNumber,
        'MessagingServiceSid': MESSAGING_SERVICE_SID,
        'ContentSid': CONTENT_SID
      };
      
      const options = {
        'method': 'post',
        'payload': payload,
        'headers': {
          'Authorization': 'Basic ' + Utilities.base64Encode(ACCOUNT_SID + ':' + AUTH_TOKEN)
        }
      };

      try {
        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        const jsonResponse = JSON.parse(response.getContentText());

        console.log(`✅ Sent to ${formattedNumber} - Status: ${responseCode}`);
        
        // Update status in sheet if status column exists
        const statusIndex = headers.findIndex(header => header === 'סטטוס');
        if (statusIndex !== -1) {
          sheet.getRange(i + 1, statusIndex + 1).setValue('Message Sent');
        }
        
        successCount++;

      } catch (error) {
        console.error(`❌ Error sending to ${formattedNumber}: ${error}`);
        
        // Update status in sheet if status column exists
        const statusIndex = headers.findIndex(header => header === 'סטטוס');
        if (statusIndex !== -1) {
          sheet.getRange(i + 1, statusIndex + 1).setValue('Error: ' + error.message);
        }
        
        errorCount++;
      }
      
      // Small delay to avoid rate limiting
      Utilities.sleep(100);
    }
    
    console.log(`📱 WhatsApp messaging completed: ${successCount} successful, ${errorCount} errors`);
    
    // Sync updated data to Firebase
    console.log("🔄 Syncing updated data to Firebase...");
    syncResidentsToFirebase();
    
  } catch (error) {
    console.error("❌ Error in sendWhatsAppMessages:", error);
    throw error;
  }
}

// ===== WEBHOOK HANDLER FOR WHATSAPP REPLIES =====

function doPost(e) {
  try {
    console.log("📨 Received webhook POST request");
    
    const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Script Logs");
    if (logSheet) {
      logSheet.appendRow([new Date(), "doPost Start", JSON.stringify(e)]);
    }

    const params = e && e.parameter ? e.parameter : {};
    const fromNumber = params.From;
    const userReply = params.Body;

    console.log(`📨 From: ${fromNumber}, Reply: ${userReply}`);

    if (fromNumber && userReply) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
      if (!sheet) {
        throw new Error(`Sheet "${SHEET_NAME}" not found`);
      }
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      // Find phone number column index - try multiple possible names
      const phoneIndex = headers.findIndex(header => 
        header === 'טלפון' || 
        header === 'phone' || 
        header === 'Phone' ||
        header === 'מספר טלפון' ||
        header === 'טלפון נייד' ||
        header === 'מס טלפון' ||
        header === 'טלפון סלולרי'
      );
      
      if (phoneIndex === -1) {
        console.log("⚠️ Phone number column not found. Available columns:", headers);
        throw new Error("Phone number column not found");
      }

      let foundMatch = false;
      
      for (let i = 1; i < data.length; i++) {
        const sheetPhoneNumber = data[i][phoneIndex].toString();
        
        // Normalize phone numbers for comparison
        const normalizedSheetPhone = sheetPhoneNumber.replace(/^0/, '').replace(/\D/g, '');
        const normalizedFromNumber = fromNumber.replace('whatsapp:+972', '972').replace(/\D/g, '');

        if (normalizedSheetPhone === normalizedFromNumber) {
          // Find reply column index
          const replyIndex = headers.findIndex(header => 
            header === 'תגובה' || header === 'reply' || header === 'Reply'
          );
          
          // Find timestamp column index
          const timestampIndex = headers.findIndex(header => 
            header === 'זמן תגובה' || header === 'reply_time' || header === 'Reply Time'
          );
          
          // Update reply
          if (replyIndex !== -1) {
            sheet.getRange(i + 1, replyIndex + 1).setValue(userReply);
          }
          
          // Update timestamp
          if (timestampIndex !== -1) {
            sheet.getRange(i + 1, timestampIndex + 1).setValue(new Date());
          }
          
          // Update status
          const statusIndex = headers.findIndex(header => header === 'סטטוס');
          if (statusIndex !== -1) {
            sheet.getRange(i + 1, statusIndex + 1).setValue('Replied');
          }
          
          console.log(`✅ Updated reply for ${fromNumber} in row ${i + 1}`);
          foundMatch = true;
          break;
        }
      }
      
      if (!foundMatch) {
        console.log(`⚠️ No matching phone number found for ${fromNumber}`);
        if (logSheet) {
          logSheet.appendRow([new Date(), "No Match", "No matching phone number found for " + fromNumber]);
        }
      }

      // Sync updated data to Firebase
      syncResidentsToFirebase();

    } else {
      console.log("⚠️ POST received with no From or Body parameters");
      if (logSheet) {
        logSheet.appendRow([new Date(), "No Params", "POST received with no From or Body parameters."]);
      }
    }
  } catch (error) {
    console.error("❌ Error in doPost:", error);
    const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Script Logs");
    if (logSheet) {
      logSheet.appendRow([new Date(), "Error", error.toString()]);
    }
  }

  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput("WhatsApp + Firebase Sync Service is running").setMimeType(ContentService.MimeType.TEXT);
}

// ===== FIREBASE SYNC FUNCTIONS =====

function syncResidentsToFirebase() {
  try {
    console.log("🔄 Starting residents sync to Firebase...");
    
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
      
      Utilities.sleep(100); // Small delay to avoid rate limiting
    }
    
    console.log(`✅ Firebase sync completed: ${successCount} successful, ${errorCount} errors`);
    
  } catch (error) {
    console.error("❌ Error syncing residents to Firebase:", error);
    throw error;
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
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      console.log(`✅ Successfully synced resident: ${residentId}`);
      return true;
    } else {
      console.error(`❌ Failed to sync resident ${residentId}: ${responseCode}`);
      console.error(`Response: ${response.getContentText()}`);
      return false;
    }
    
  } catch (error) {
    console.error(`❌ Error syncing resident ${residentId}:`, error);
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
  // Try to use phone number first (check multiple possible column names)
  const phoneNumber = residentData['טלפון'] || residentData['טלפון נייד'] || residentData['מספר טלפון'] || residentData['מס טלפון'] || residentData['טלפון סלולרי'];
  if (phoneNumber) {
    return `resident_${phoneNumber.toString().replace(/\D/g, '')}`;
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

// ===== TRIGGER SETUP =====

function setupTriggers() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncResidentsToFirebase') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new triggers for automatic sync
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyMinutes(5).create();
  
  console.log("✅ Firebase sync triggers set up successfully");
}

// ===== MANUAL FUNCTIONS =====

function manualSync() {
  syncResidentsToFirebase();
}

function manualWhatsAppSend() {
  sendWhatsAppMessages();
}

// ===== TEST FUNCTIONS =====

function testFirebaseConnection() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    const response = UrlFetchApp.fetch(url);
    console.log("✅ Firebase connection test successful");
    return true;
  } catch (error) {
    console.error("❌ Firebase connection test failed:", error);
    return false;
  }
}

function testSheetStructure() {
  try {
    console.log("=== TESTING SHEET STRUCTURE ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      console.log(`❌ Sheet "${SHEET_NAME}" not found!`);
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
    console.log("📋 Headers:", headers);
    
    // Check for required fields
    const requiredFields = ['טלפון', 'שם פרטי', 'שם משפחה'];
    console.log("\n🔍 Checking required fields:");
    
    requiredFields.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        console.log(`  ✅ "${field}" found at column ${String.fromCharCode(65 + index)}`);
      } else {
        console.log(`  ❌ "${field}" NOT FOUND`);
      }
    });
    
    // Also check for alternative phone column names
    const phoneAlternatives = ['מספר טלפון', 'טלפון נייד', 'מס טלפון', 'טלפון סלולרי'];
    console.log("\n📱 Checking for phone number columns:");
    phoneAlternatives.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        console.log(`  ✅ Found phone column: "${field}" at column ${String.fromCharCode(65 + index)}`);
      }
    });
    
    return true;
    
  } catch (error) {
    console.error("❌ Error testing sheet structure:", error);
    return false;
  }
}

function testTwilioCredentials() {
  try {
    const ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty('ACCOUNT_SID');
    const AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
    const MESSAGING_SERVICE_SID = PropertiesService.getScriptProperties().getProperty('MESSAGING_SERVICE_SID');
    const CONTENT_SID = PropertiesService.getScriptProperties().getProperty('CONTENT_SID');

    console.log("=== TESTING TWILIO CREDENTIALS ===");
    console.log(`ACCOUNT_SID: ${ACCOUNT_SID ? '✅ Set' : '❌ Missing'}`);
    console.log(`AUTH_TOKEN: ${AUTH_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`MESSAGING_SERVICE_SID: ${MESSAGING_SERVICE_SID ? '✅ Set' : '❌ Missing'}`);
    console.log(`CONTENT_SID: ${CONTENT_SID ? '✅ Set' : '❌ Missing'}`);
    
    if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID || !CONTENT_SID) {
      console.log("❌ Missing Twilio credentials. Please set up script properties.");
      return false;
    }
    
    console.log("✅ All Twilio credentials are set");
    return true;
    
  } catch (error) {
    console.error("❌ Error testing Twilio credentials:", error);
    return false;
  }
}

// ===== COMPREHENSIVE TEST =====

function comprehensiveTest() {
  try {
    console.log("=== COMPREHENSIVE SYSTEM TEST ===");
    
    // Test 1: Sheet structure
    console.log("1. Testing sheet structure...");
    if (!testSheetStructure()) {
      return false;
    }
    
    // Test 2: Firebase connection
    console.log("2. Testing Firebase connection...");
    if (!testFirebaseConnection()) {
      return false;
    }
    
    // Test 3: Twilio credentials
    console.log("3. Testing Twilio credentials...");
    if (!testTwilioCredentials()) {
      return false;
    }
    
    console.log("✅ All tests passed! System is ready.");
    return true;
    
  } catch (error) {
    console.error("❌ Comprehensive test failed:", error);
    return false;
  }
}
