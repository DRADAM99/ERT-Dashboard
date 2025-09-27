/**
 * Combined Google Apps Script: WhatsApp Messaging + Firebase Sync V3
 * 
 * This script combines:
 * 1. Original WhatsApp messaging functionality via Twilio
 * 2. Enhanced Firebase sync with proper column mapping
 * 3. ירוק בעיניים (Green in Eyes) trigger function
 * 4. Proper status mapping for user replies
 * 
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Go to Extensions > Apps Script
 * 3. Replace the default code with this complete script
 * 4. Update the configuration values below
 * 5. Set up script properties for Twilio credentials
 */

// ===== CONFIGURATION =====
const FIREBASE_PROJECT_ID_V3 = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY_V3 = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE";
const SHEET_NAME_V3 = "2025"; // Change this to your actual sheet name
const DATA_RANGE_V3 = "A1:Z500";

// Set debugMode to true to enable logging to the "Script Logs" sheet.
var debugMode = true;

// Key for the phone number lookup table in Script Properties
var PHONE_LOOKUP_PROPERTY_KEY = 'PHONE_NUMBER_ROW_LOOKUP_V3';

// Set reIndexWithEveryRun to true if you want the phone number lookup table
// to be updated every time sendWhatsAppMessages is triggered via doPost.
// Set to false if you manage the lookup table update separately.
var reIndexWithEveryRun = true;

// ===== UTILITY FUNCTIONS =====

/**
 * Normalizes a phone number by removing non-digit characters and handling common prefixes.
 * This function should be consistent with how numbers are stored in the sheet.
 * @param {string} phoneNumber The phone number string to normalize.
 * @returns {string} The normalized phone number.
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  // Remove all non-digit characters
  var normalized = phoneNumber.toString().replace(/\D/g, '');
  // If it starts with '0', remove it (common for local Israeli numbers without country code)
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  // If it's an Israeli number, ensure it starts with 972
  if (normalized.length === 9 && !normalized.startsWith('972')) { // e.g., 541234567 -> 972541234567
    normalized = '972' + normalized;
  }
  // Further normalization for Twilio 'From' numbers which may include '+whatsapp:'
  // For 'whatsapp:+972541234567', it should become '972541234567'
  if (normalized.startsWith('whatsapp')) {
      normalized = normalized.replace('whatsapp', '').replace(/^\+/, '');
  }

  return normalized;
}

/**
 * Generates and updates a lookup table of phone numbers to row indices
 * and saves it to Script Properties. This function should be run manually
 * or via a time-driven trigger whenever the sheet data changes.
 */
function updatePhoneLookupTable() {
  logToSheet([new Date(), "Lookup Table Update", "Starting to update phone number lookup table."]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_V3);

  if (!sheet) {
    logToSheet([new Date(), "Error", "Sheet '" + SHEET_NAME_V3 + "' not found for lookup table generation."]);
    throw new Error("Sheet '" + SHEET_NAME_V3 + "' not found.");
  }

  var data = sheet.getDataRange().getValues();
  var phoneLookup = {}; // Object to store normalizedNumber -> row index mapping

  // Find phone number column index
  const headers = data[0];
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
    logToSheet([new Date(), "Error", "Phone number column not found in headers: " + JSON.stringify(headers)]);
    throw new Error("Phone number column not found");
  }

  // Iterate from the second row (index 1) to skip headers
  for (var i = 1; i < data.length; i++) {
    var phoneNumber = data[i][phoneIndex];
    if (phoneNumber) {
      var normalized = normalizePhoneNumber(phoneNumber);
      // Store the 1-based row index (i + 1)
      phoneLookup[normalized] = i + 1;
    }
  }

  try {
    PropertiesService.getScriptProperties().setProperty(
      PHONE_LOOKUP_PROPERTY_KEY,
      JSON.stringify(phoneLookup)
    );
    logToSheet([new Date(), "Lookup Table Update", "Successfully updated phone number lookup table. Entries: " + Object.keys(phoneLookup).length]);
  } catch (e) {
    logToSheet([new Date(), "Error", "Failed to save lookup table to Script Properties: " + e.toString()]);
    throw e;
  }
}

// ===== LOGGING FUNCTIONS =====

/**
 * Helper function to append a row to the log sheet if debugMode is true.
 * @param {Array} rowData The data to append to the log sheet.
 */
function logToSheet(rowData) {
  if (debugMode) {
    try {
      // Ensure rowData is valid
      if (!rowData || !Array.isArray(rowData) || rowData.length === 0) {
        Logger.log("Invalid rowData passed to logToSheet: " + JSON.stringify(rowData));
        return;
      }
      
      var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Script Logs");
      if (!logSheet) {
        // Create the log sheet if it doesn't exist and debugMode is true
        logSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Script Logs");
        logSheet.appendRow(["Timestamp", "Type", "Details"]);
      }
      logSheet.appendRow(rowData);
    } catch (e) {
      // Fallback to Logger.log if there's an issue with the spreadsheet itself
      Logger.log("Error writing to log sheet: " + e.toString() + " - Attempted data: " + JSON.stringify(rowData));
    }
  }
}

// ===== ירוק בעיניים (GREEN IN EYES) TRIGGER FUNCTION =====
function activateGreenInEyes() {
  try {
    logToSheet([new Date(), "🚀 ירוק בעיניים", "Starting ירוק בעיניים sequence..."]);
    
    // First sync the latest data to Firebase
    logToSheet([new Date(), "📊 Firebase Sync", "Syncing residents data to Firebase..."]);
    syncResidentsToFirebase();
    
    // Then send WhatsApp messages to all residents
    logToSheet([new Date(), "📱 WhatsApp", "Sending WhatsApp messages to all residents..."]);
    sendWhatsAppMessages();
    
    logToSheet([new Date(), "✅ ירוק בעיניים", "ירוק בעיניים sequence completed successfully!"]);
    
  } catch (error) {
    logToSheet([new Date(), "❌ ירוק בעיניים Error", error.toString()]);
    throw error;
  }
}

// ===== WHATSAPP MESSAGING FUNCTIONS =====

function sendWhatsAppMessages() {
  try {
    logToSheet([new Date(), "📱 WhatsApp", "Starting WhatsApp message sending..."]);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME_V3);
    
    if (!sheet) {
      throw new Error("Sheet '" + SHEET_NAME_V3 + "' not found");
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
      logToSheet([new Date(), "Error", "Phone number column not found. Available columns: " + JSON.stringify(headers)]);
      throw new Error("Phone number column not found. Please check your column headers.");
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 1; i < data.length; i++) { // skip header
      const row = data[i];
      const phoneNumber = row[phoneIndex];
      
      if (!phoneNumber) {
        logToSheet([new Date(), "Warning", "Skipping row " + (i + 1) + " due to empty phone number."]);
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

        logToSheet([new Date(), "WhatsApp Send", "Sent to " + formattedNumber + " - Status: " + responseCode]);
        
        // Update status in sheet if status column exists
        const statusIndex = headers.findIndex(header => header === 'סטטוס');
        if (statusIndex !== -1) {
          // Only update status if it's currently empty or not a user reply
          const currentStatus = sheet.getRange(i + 1, statusIndex + 1).getValue();
          const userReplyStatuses = ['זקוקים לסיוע', 'הכל בסדר', 'לא בטוח', 'תגובה התקבלה'];
          
          if (!currentStatus || currentStatus === '' || !userReplyStatuses.includes(currentStatus)) {
            sheet.getRange(i + 1, statusIndex + 1).setValue('הודעה נשלחה');
            logToSheet([new Date(), "Status Update", "Updated status to 'הודעה נשלחה' for row " + (i + 1)]);
          } else {
            logToSheet([new Date(), "Status Preserved", "Preserved existing status '" + currentStatus + "' for row " + (i + 1)]);
          }
        }
        
        successCount++;

      } catch (error) {
        logToSheet([new Date(), "WhatsApp Send Error", "Error sending to " + formattedNumber + ": " + error.toString()]);
        
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
    
    logToSheet([new Date(), "WhatsApp Send", "WhatsApp messaging completed: " + successCount + " successful, " + errorCount + " errors"]);
    
    // Sync updated data to Firebase
    logToSheet([new Date(), "Firebase Sync", "Syncing updated data to Firebase..."]);
    syncResidentsToFirebase();
    
  } catch (error) {
    logToSheet([new Date(), "WhatsApp Send Error", "Error in sendWhatsAppMessages: " + error.toString()]);
    throw error;
  }
}

// ===== WEBHOOK HANDLER FOR WHATSAPP REPLIES =====

function doPost(e) {
  try {
    logToSheet([new Date(), "doPost Start", "Webhook received"]);
    
    // Log all available data for debugging
    logToSheet([new Date(), "Debug", "e.parameter: " + JSON.stringify(e.parameter)]);
    logToSheet([new Date(), "Debug", "e.postData: " + JSON.stringify(e.postData)]);
    
    let params = {};
    
    // Try to get parameters from e.parameter first
    if (e && e.parameter) {
      params = e.parameter;
      logToSheet([new Date(), "Debug", "Using e.parameter"]);
    }
    // If no parameters found, try to parse from postData.contents (form-encoded data)
    else if (e && e.postData && e.postData.contents) {
      try {
        logToSheet([new Date(), "Debug", "Parsing from e.postData.contents: " + e.postData.contents]);
        // Parse form-encoded data manually
        var formData = e.postData.contents;
        var pairs = formData.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split('=');
          if (pair.length === 2) {
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
          }
        }
        logToSheet([new Date(), "Debug", "Parsed params: " + JSON.stringify(params)]);
      } catch (parseError) {
        logToSheet([new Date(), "Debug", "Failed to parse form data: " + parseError.toString()]);
      }
    } else {
      logToSheet([new Date(), "Debug", "No parameters found in e.parameter or e.postData.contents"]);
    }
    
    const fromNumber = params.From;
    const userReply = params.Body;

    logToSheet([new Date(), "Parameters", "From: " + fromNumber + ", Body: " + userReply]);
    
    // CRITICAL: If no parameters found, return early with detailed logging
    if (!fromNumber || !userReply) {
      logToSheet([new Date(), "CRITICAL", "Missing From or Body parameters - webhook may not be configured correctly"]);
      logToSheet([new Date(), "CRITICAL", "From: " + fromNumber + ", Body: " + userReply]);
      return ContentService.createTextOutput("Missing parameters").setMimeType(ContentService.MimeType.TEXT);
    }

    if (fromNumber && userReply) {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_V3);
      if (!sheet) {
        logToSheet([new Date(), "Error", "Sheet '" + SHEET_NAME_V3 + "' not found"]);
        return ContentService.createTextOutput("Sheet not found").setMimeType(ContentService.MimeType.TEXT);
      }

      // --- Use lookup table from Script Properties (like original script) ---
      var phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY);
      if (!phoneLookupString) {
        logToSheet([new Date(), "Warning", "Phone number lookup table not found in Script Properties. Please run updatePhoneLookupTable() first."]);
        // Fallback: Update lookup table now
        updatePhoneLookupTable();
        phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY);
      }

      var phoneLookup;
      try {
        phoneLookup = JSON.parse(phoneLookupString);
      } catch (jsonError) {
        logToSheet([new Date(), "Error", "Failed to parse phone lookup table JSON: " + jsonError.toString()]);
        return ContentService.createTextOutput("Lookup table parsing error").setMimeType(ContentService.MimeType.TEXT);
      }

      var normalizedFromNumber = normalizePhoneNumber(fromNumber);
      var rowIndex = phoneLookup[normalizedFromNumber]; // Get the 1-based row index

      logToSheet([new Date(), "Lookup Result", "Incoming Normalized Num: " + normalizedFromNumber + ", Found Row Index: " + rowIndex]);

      if (rowIndex) {
        // Get headers for column mapping
        const data = sheet.getDataRange().getValues();
        const headers = data[0];
        
        // Find reply column index
        const replyIndex = headers.findIndex(header => 
          header === 'תגובה' || header === 'reply' || header === 'Reply' || header === 'קוד חוזר'
        );
        
        // Find timestamp column index
        const timestampIndex = headers.findIndex(header => 
          header === 'זמן תגובה' || header === 'reply_time' || header === 'Reply Time' || header === 'תאריך תגובה'
        );
        
        // Update reply
        if (replyIndex !== -1) {
          sheet.getRange(rowIndex, replyIndex + 1).setValue(userReply);
          logToSheet([new Date(), "Update", "Updated reply in column " + (replyIndex + 1) + ": " + userReply]);
        }
        
        // Update timestamp
        if (timestampIndex !== -1) {
          sheet.getRange(rowIndex, timestampIndex + 1).setValue(new Date());
          logToSheet([new Date(), "Update", "Updated timestamp in column " + (timestampIndex + 1)]);
        }
        
        // Update status with proper mapping
        const statusIndex = headers.findIndex(header => header === 'סטטוס');
        if (statusIndex !== -1) {
          let statusValue = 'תגובה התקבלה'; // Default status
          
          // Simple mapping based on the user reply
          if (userReply.includes('4') || userReply.includes('זקוקים') || userReply.includes('סיוע')) {
            statusValue = 'זקוקים לסיוע';
          } else if (userReply.includes('1') || userReply.includes('בסדר') || userReply.includes('טוב')) {
            statusValue = 'הכל בסדר';
          } else if (userReply.includes('2') || userReply.includes('לא בטוח') || userReply.includes('לא יודע')) {
            statusValue = 'לא בטוח';
          }
          
          sheet.getRange(rowIndex, statusIndex + 1).setValue(statusValue);
          logToSheet([new Date(), "Update", "Updated status in column " + (statusIndex + 1) + " to '" + statusValue + "' (original: '" + userReply + "')"]);
        }
        
        logToSheet([new Date(), "Success", "Updated reply for " + fromNumber + " in row " + rowIndex]);
      } else {
        logToSheet([new Date(), "No Match", "No matching phone number found for " + fromNumber + " in lookup table."]);
      }
      // --- End lookup table approach ---

      // Sync updated data to Firebase
      syncResidentsToFirebase();

    } else {
      logToSheet([new Date(), "Warning", "POST received with no From or Body parameters"]);
    }
  } catch (error) {
    logToSheet([new Date(), "doPost Error", error.toString()]);
    console.error("doPost Error:", error);
  }

  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput("WhatsApp + Firebase Sync Service V3 is running").setMimeType(ContentService.MimeType.TEXT);
}

// ===== FIREBASE SYNC FUNCTIONS =====

function syncResidentsToFirebase() {
  try {
    logToSheet([new Date(), "Firebase Sync", "Starting residents sync to Firebase..."]);
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME_V3);
    
    if (!sheet) {
      throw new Error("Sheet '" + SHEET_NAME_V3 + "' not found");
    }
    
    const range = sheet.getRange(DATA_RANGE_V3);
    const values = range.getValues();
    
    if (values.length < 2) {
      throw new Error("No data found in sheet");
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    logToSheet([new Date(), "Firebase Sync", "Found " + dataRows.length + " residents to sync"]);
    
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
    
    logToSheet([new Date(), "Firebase Sync", "Sync completed: " + successCount + " successful, " + errorCount + " errors"]);
    
  } catch (error) {
    logToSheet([new Date(), "Firebase Sync Error", error.toString()]);
    throw error;
  }
}

function syncResidentToFirebase(residentId, residentData) {
  try {
    const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID_V3 + "/databases/(default)/documents/residents/" + residentId;
    
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
      logToSheet([new Date(), "Firebase Sync Error", "Failed to sync resident " + residentId + ": " + responseCode]);
      return false;
    }
    
  } catch (error) {
    logToSheet([new Date(), "Firebase Sync Error", "Error syncing resident " + residentId + ": " + error.toString()]);
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
    return "resident_" + phoneNumber.toString().replace(/\D/g, '');
  }
  // Then try full name
  else if (residentData['שם פרטי'] && residentData['שם משפחה']) {
    const fullName = residentData['שם פרטי'] + " " + residentData['שם משפחה'];
    return "resident_" + fullName.replace(/\s+/g, '_') + "_" + Date.now();
  }
  // Fallback to timestamp
  else {
    return "resident_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }
}

// ===== MANUAL FUNCTIONS =====

function manualSync() {
  syncResidentsToFirebase();
}

function manualWhatsAppSend() {
  sendWhatsAppMessages();
}

function manualGreenInEyes() {
  activateGreenInEyes();
}

// ===== TEST FUNCTIONS =====

function testLogToSheet() {
  logToSheet([new Date(), "Test", "Manual test of logToSheet function"]);
}

function testWebhookSimulation() {
  try {
    logToSheet([new Date(), "Test", "=== TESTING WEBHOOK SIMULATION ==="]);
    
    // First, update the phone lookup table
    logToSheet([new Date(), "Test", "Updating phone lookup table..."]);
    updatePhoneLookupTable();
    
    // Simulate a webhook call with test data
    const testData = {
      parameter: {
        From: "whatsapp:+972501234567",
        Body: "4 - אנחנו זקוקים לסיוע"
      }
    };
    
    logToSheet([new Date(), "Test", "Simulating webhook with test data..."]);
    logToSheet([new Date(), "Test", "From: " + testData.parameter.From]);
    logToSheet([new Date(), "Test", "Body: " + testData.parameter.Body]);
    
    // Call doPost with test data
    const result = doPost(testData);
    
    logToSheet([new Date(), "Test", "Webhook simulation completed. Result: " + result.getContent()]);
    
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Webhook simulation failed: " + error.toString()]);
    return false;
  }
}

function initializeLookupTable() {
  try {
    logToSheet([new Date(), "Init", "Initializing phone lookup table..."]);
    updatePhoneLookupTable();
    logToSheet([new Date(), "Init", "Phone lookup table initialized successfully!"]);
    return true;
  } catch (error) {
    logToSheet([new Date(), "Init Error", "Failed to initialize lookup table: " + error.toString()]);
    return false;
  }
}

function testWebhookDirectly() {
  try {
    logToSheet([new Date(), "Test", "=== TESTING WEBHOOK DIRECTLY ==="]);
    
    // Test with actual webhook data format
    const testWebhookData = {
      parameter: {
        From: "whatsapp:+972501234567",
        Body: "4 - אנחנו זקוקים לסיוע"
      }
    };
    
    logToSheet([new Date(), "Test", "Testing with webhook data: " + JSON.stringify(testWebhookData)]);
    
    // Call doPost directly
    const result = doPost(testWebhookData);
    
    logToSheet([new Date(), "Test", "Webhook test completed. Result: " + result.getContent()]);
    
    return true;
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Webhook test failed: " + error.toString()]);
    return false;
  }
}

function testFirebaseConnection() {
  try {
    const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID_V3 + "/databases/(default)/documents/residents";
    const response = UrlFetchApp.fetch(url);
    logToSheet([new Date(), "Test", "Firebase connection test successful"]);
    return true;
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Firebase connection test failed: " + error.toString()]);
    return false;
  }
}

function testSheetStructure() {
  try {
    logToSheet([new Date(), "Test", "=== TESTING SHEET STRUCTURE ==="]);
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME_V3);
    
    if (!sheet) {
      logToSheet([new Date(), "Test Error", "Sheet '" + SHEET_NAME_V3 + "' not found!"]);
      return false;
    }
    
    const range = sheet.getRange(DATA_RANGE_V3);
    const values = range.getValues();
    
    if (values.length < 2) {
      logToSheet([new Date(), "Test Error", "No data found in sheet"]);
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    logToSheet([new Date(), "Test", "Found " + dataRows.length + " residents in sheet"]);
    
    // Check for required fields
    const requiredFields = ['טלפון', 'שם פרטי', 'שם משפחה'];
    logToSheet([new Date(), "Test", "Checking required fields:"]);
    
    requiredFields.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        logToSheet([new Date(), "Test", "✅ \"" + field + "\" found at column " + String.fromCharCode(65 + index)]);
      } else {
        logToSheet([new Date(), "Test", "❌ \"" + field + "\" NOT FOUND"]);
      }
    });
    
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Error testing sheet structure: " + error.toString()]);
    return false;
  }
}

function testTwilioCredentials() {
  try {
    const ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty('ACCOUNT_SID');
    const AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
    const MESSAGING_SERVICE_SID = PropertiesService.getScriptProperties().getProperty('MESSAGING_SERVICE_SID');
    const CONTENT_SID = PropertiesService.getScriptProperties().getProperty('CONTENT_SID');

    logToSheet([new Date(), "Test", "=== TESTING TWILIO CREDENTIALS ==="]);
    logToSheet([new Date(), "Test", "ACCOUNT_SID: " + (ACCOUNT_SID ? '✅ Set' : '❌ Missing')]);
    logToSheet([new Date(), "Test", "AUTH_TOKEN: " + (AUTH_TOKEN ? '✅ Set' : '❌ Missing')]);
    logToSheet([new Date(), "Test", "MESSAGING_SERVICE_SID: " + (MESSAGING_SERVICE_SID ? '✅ Set' : '❌ Missing')]);
    logToSheet([new Date(), "Test", "CONTENT_SID: " + (CONTENT_SID ? '✅ Set' : '❌ Missing')]);
    
    if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID || !CONTENT_SID) {
      logToSheet([new Date(), "Test Error", "Missing Twilio credentials. Please set up script properties."]);
      return false;
    }
    
    logToSheet([new Date(), "Test", "✅ All Twilio credentials are set"]);
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Error testing Twilio credentials: " + error.toString()]);
    return false;
  }
}

function comprehensiveTest() {
  try {
    logToSheet([new Date(), "Test", "=== COMPREHENSIVE SYSTEM TEST ==="]);
    
    // Test 1: Sheet structure
    logToSheet([new Date(), "Test", "1. Testing sheet structure..."]);
    if (!testSheetStructure()) {
      return false;
    }
    
    // Test 2: Firebase connection
    logToSheet([new Date(), "Test", "2. Testing Firebase connection..."]);
    if (!testFirebaseConnection()) {
      return false;
    }
    
    // Test 3: Twilio credentials
    logToSheet([new Date(), "Test", "3. Testing Twilio credentials..."]);
    if (!testTwilioCredentials()) {
      return false;
    }
    
    logToSheet([new Date(), "Test", "✅ All tests passed! System is ready."]);
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Comprehensive test failed: " + error.toString()]);
    return false;
  }
}
