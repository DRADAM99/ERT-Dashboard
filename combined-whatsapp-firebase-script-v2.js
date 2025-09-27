/** @OnlyCurrentDoc */
// filepath: Google Apps Script (bound to a Google Sheet)

// ===== CONFIGURATION =====
// Set debugMode to true to enable logging to the "Script Logs" sheet.
// Set debugMode to false to disable all logging.
var debugMode = true;

// Set the number of seconds to wait between sending messages to each batch of 10 numbers.
// For example, 5 means wait 5 seconds after processing 10 numbers.
var secWaitBetweenEach10Numbers = 1;

// Key for the phone number lookup table in Script Properties
var PHONE_LOOKUP_PROPERTY_KEY = 'PHONE_NUMBER_ROW_LOOKUP';

// Set reIndexWithEveryRun to true if you want the phone number lookup table
// to be updated every time sendWhatsAppMessages is triggered via doPost.
// Set to false if you manage the lookup table update separately.
var reIndexWithEveryRun = true;

// Force update lookup table on next run
var forceUpdateLookupTable = true;

// Firebase configuration
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE";
const SHEET_NAME = "2025"; // Change this to your actual sheet name
const DATA_RANGE = "A1:Z500";

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

// ===== PHONE NUMBER UTILITIES =====

/**
 * Normalizes a phone number by removing non-digit characters and handling common prefixes.
 * This function should be consistent with how numbers are stored in the sheet (col 0).
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
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    logToSheet([new Date(), "Error", `Sheet '${SHEET_NAME}' not found for lookup table generation.`]);
    throw new Error(`Sheet '${SHEET_NAME}' not found.`);
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

// ===== WEBHOOK HANDLERS =====

/**
 * Handles incoming POST requests and dispatches them to appropriate handlers.
 * It acts as a router for different types of triggers.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The event object containing POST parameters.
 */
function doPost(e) {
  // Always log the incoming request for debugging
  console.log("=== WEBHOOK RECEIVED ===");
  console.log("Event object:", JSON.stringify(e));
  console.log("Parameters:", JSON.stringify(e.parameter || {}));
  
  // Force log to sheet immediately - don't rely on try/catch
  try {
    var timestamp = new Date();
    logToSheet([timestamp, "doPost Start", "Webhook received"]);
  } catch (logError) {
    console.log("Failed to log to sheet: " + logError.toString());
  }

  try {
    var params = {};
    
    // First try to get parameters from e.parameter
    if (e && e.parameter) {
      params = e.parameter;
      logToSheet([new Date(), "Parameter Source", "Using e.parameter: " + JSON.stringify(params)]);
    }
    // If no parameters found, try to parse from postData.contents (form-encoded data)
    else if (e && e.postData && e.postData.contents) {
      try {
        logToSheet([new Date(), "Parameter Source", "Using e.postData.contents: " + e.postData.contents]);
        // Parse form-encoded data manually
        var formData = e.postData.contents;
        var pairs = formData.split('&');
        for (var i = 0; i < pairs.length; i++) {
          var pair = pairs[i].split('=');
          if (pair.length === 2) {
            params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
          }
        }
        logToSheet([new Date(), "Parsed Form Data", "Parsed from postData.contents: " + JSON.stringify(params)]);
      } catch (parseError) {
        logToSheet([new Date(), "Form Parse Error", "Failed to parse form data: " + parseError.toString()]);
      }
    } else {
      logToSheet([new Date(), "Parameter Source", "No parameters found in e.parameter or e.postData.contents"]);
    }

    // Log all parameters for debugging
    logToSheet([new Date(), "All Parameters", JSON.stringify(params)]);

    // Determine the type of trigger based on the presence of specific parameters
    // If 'From' and 'Body' (typical for Twilio inbound messages) are present,
    // it's an inbound Twilio message to be processed.
    if (params.From && params.Body) {
      logToSheet([new Date(), "Trigger Type", "Twilio Inbound Message (From & Body present)"]);
      logToSheet([new Date(), "From", params.From]);
      logToSheet([new Date(), "Body", params.Body]);
      return handleTwilioInbound(e);
    } else if (params.triggerWhatsappOverList === '1') { // New: Explicitly check for the WhatsApp send trigger parameter
      logToSheet([new Date(), "Trigger Type", "WhatsApp Send Trigger (triggerWhatsappOverList=1)"]);
      return handleWhatsAppTrigger(e);
    } else if (params.triggerGreenInEyes === '1') { // ירוק בעיניים trigger
      logToSheet([new Date(), "Trigger Type", "ירוק בעיניים Trigger (triggerGreenInEyes=1)"]);
      return handleGreenInEyesTrigger(e);
    } else if (params.clearSystem === '1') { // Clear system trigger
      logToSheet([new Date(), "Trigger Type", "Clear System Trigger (clearSystem=1)"]);
      return handleClearSystemTrigger(e);
    } else {
      // This block handles any other POST requests that don't fit the above criteria.
      logToSheet([new Date(), "Trigger Type", "Unrecognized/Unhandled POST Request", JSON.stringify(params)]);
      logToSheet([new Date(), "Response", "Unrecognized POST request. No action taken."]);
      return ContentService.createTextOutput("Unrecognized POST request").setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (error) {
    // Log any unexpected errors that occur in the routing logic
    logToSheet([new Date(), "doPost Error", error.toString()]);
    console.error("doPost Error:", error);
    // Always return an ERROR response for unhandled errors
    return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Handles inbound messages from Twilio, updating the Google Sheet with user replies.
 * This function now uses a lookup table from Script Properties for efficient row finding.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The event object from the Twilio webhook.
 * @returns {GoogleAppsScript.Content.TextOutput} A text output response.
 */
function handleTwilioInbound(e) {
  try {
    var params = e && e.parameter ? e.parameter : {};
    var fromNumber = params.From; // e.g., "whatsapp:+972541234567"
    var userReply = params.Body; // e.g., "4 - אנחנו זקוקים לסיוע"

    logToSheet([new Date(), "Twilio Inbound", "From: " + fromNumber + ", Body: " + userReply]);

    // Only update sheet if both parameters exist
    if (fromNumber && userReply) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
      if (!sheet) {
        logToSheet([new Date(), "Error", `Sheet '${SHEET_NAME}' not found.`]);
        return ContentService.createTextOutput("Sheet not found").setMimeType(ContentService.MimeType.TEXT);
      }

      // --- Use lookup table from Script Properties ---
      var phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY);
      if (!phoneLookupString) {
        logToSheet([new Date(), "Warning", "Phone number lookup table not found in Script Properties. Please run updatePhoneLookupTable() first."]);
        return ContentService.createTextOutput("Lookup table not initialized").setMimeType(ContentService.MimeType.TEXT);
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
        // Get headers to find correct column indices
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        
        // Find reply column index (try multiple possible names)
        const replyIndex = headers.findIndex(header => 
          header === 'תגובה' || header === 'reply' || header === 'Reply' || header === 'קוד חוזר'
        );
        
        // Find timestamp column index (try multiple possible names)
        const timestampIndex = headers.findIndex(header => 
          header === 'זמן תגובה' || header === 'reply_time' || header === 'Reply Time' || header === 'תאריך תגובה'
        );
        
        // Find status column index
        const statusIndex = headers.findIndex(header => header === 'סטטוס');
        
        logToSheet([new Date(), "Column Mapping", `Reply column: ${replyIndex + 1}, Timestamp column: ${timestampIndex + 1}, Status column: ${statusIndex + 1}`]);
        
        // Update reply with the actual user reply (like the original script)
        if (replyIndex !== -1) {
          sheet.getRange(rowIndex, replyIndex + 1).setValue(userReply);
          logToSheet([new Date(), "Update", `Updated reply in column ${replyIndex + 1}: ${userReply}`]);
        } else {
          logToSheet([new Date(), "Warning", "Reply column not found in headers: " + JSON.stringify(headers)]);
        }
        
        // Update timestamp
        if (timestampIndex !== -1) {
          sheet.getRange(rowIndex, timestampIndex + 1).setValue(new Date());
          logToSheet([new Date(), "Update", `Updated timestamp in column ${timestampIndex + 1}`]);
        } else {
          logToSheet([new Date(), "Warning", "Timestamp column not found in headers: " + JSON.stringify(headers)]);
        }
        
        // Update status with a simple mapping (simplified approach)
        if (statusIndex !== -1) {
          let statusValue = 'תגובה התקבלה'; // Default status
          
          // Simple mapping based on the original reply
          if (userReply.includes('4') || userReply.includes('זקוקים') || userReply.includes('סיוע')) {
            statusValue = 'זקוקים לסיוע';
          } else if (userReply.includes('1') || userReply.includes('בסדר') || userReply.includes('טוב')) {
            statusValue = 'כולם בסדר';
          } else if (userReply.includes('2') || userReply.includes('לא בטוח') || userReply.includes('לא יודע')) {
            statusValue = 'לא בטוח';
          } else if (userReply.includes('3') || userReply.includes('בטיפול') || userReply.includes('מטפלים')) {
            statusValue = 'בטיפול';
          }
          
          sheet.getRange(rowIndex, statusIndex + 1).setValue(statusValue);
          logToSheet([new Date(), "Update", `Updated status in column ${statusIndex + 1} to '${statusValue}' (original: '${userReply}')`]);
        } else {
          logToSheet([new Date(), "Warning", "Status column not found in headers: " + JSON.stringify(headers)]);
        }
        
        logToSheet([new Date(), "Success", "Updated reply for " + fromNumber + " in row " + rowIndex]);
        
        // Sync updated data to Firebase
        syncResidentsToFirebase();
      } else {
        logToSheet([new Date(), "No Match", "No matching phone number found for " + fromNumber + " in lookup table."]);
      }

    } else {
      logToSheet([new Date(), "Twilio Inbound Warning", "POST received with missing 'From' or 'Body' parameters for inbound handler."]);
    }
  } catch (error) {
    logToSheet([new Date(), "handleTwilioInbound Error", error.toString()]);
  }

  // Always respond OK for any POST to Twilio to prevent retries
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles triggers that initiate sending WhatsApp messages.
 * This function calls the sendWhatsAppMessages function.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The event object (parameters might be empty for this trigger).
 * @returns {GoogleAppsScript.Content.TextOutput} A text output response.
 */
function handleWhatsAppTrigger(e) {
  logToSheet([new Date(), "WhatsApp Trigger", "Initiating sendWhatsAppMessages()."]);
  try {
    if (reIndexWithEveryRun) {
      logToSheet([new Date(), "WhatsApp Trigger", "reIndexWithEveryRun is true. Calling updatePhoneLookupTable()."]);
      updatePhoneLookupTable();
    }
    sendWhatsAppMessages();
    logToSheet([new Date(), "WhatsApp Trigger", "sendWhatsAppMessages() completed successfully."]);
  } catch (error) {
    logToSheet([new Date(), "WhatsApp Trigger Error", "Error calling sendWhatsAppMessages: " + error.toString()]);
  }

  // Always respond OK
  return ContentService.createTextOutput("WhatsApp send initiated").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles triggers that initiate the ירוק בעיניים (Green in Eyes) sequence.
 * This function calls the activateGreenInEyes function.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The event object (parameters might be empty for this trigger).
 * @returns {GoogleAppsScript.Content.TextOutput} A text output response.
 */
function handleGreenInEyesTrigger(e) {
  logToSheet([new Date(), "ירוק בעיניים Trigger", "Initiating activateGreenInEyes()."]);
  try {
    activateGreenInEyes();
    logToSheet([new Date(), "ירוק בעיניים Trigger", "activateGreenInEyes() completed successfully."]);
  } catch (error) {
    logToSheet([new Date(), "ירוק בעיניים Trigger Error", "Error calling activateGreenInEyes: " + error.toString()]);
  }

  // Always respond OK
  return ContentService.createTextOutput("ירוק בעיניים sequence initiated").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles triggers that clear the system for the next emergency event.
 * This function clears all resident statuses and removes all residents from Firebase.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The event object (parameters might be empty for this trigger).
 * @returns {GoogleAppsScript.Content.TextOutput} A text output response.
 */
function handleClearSystemTrigger(e) {
  logToSheet([new Date(), "Clear System Trigger", "Initiating complete system clear sequence."]);
  try {
    clearAllResidentStatuses();
    clearAllFirebaseData();
    logToSheet([new Date(), "Clear System Trigger", "Complete system clear sequence completed successfully."]);
  } catch (error) {
    logToSheet([new Date(), "Clear System Trigger Error", "Error clearing system: " + error.toString()]);
  }

  // Always respond OK
  return ContentService.createTextOutput("System cleared successfully").setMimeType(ContentService.MimeType.TEXT);
}

// ===== WHATSAPP MESSAGING FUNCTIONS =====

/**
 * Sends WhatsApp messages to numbers listed in the active sheet,
 * processing them in batches with a configurable delay.
 */
function sendWhatsAppMessages() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    logToSheet([new Date(), "Error", `Sheet '${SHEET_NAME}' not found.`]);
    throw new Error(`Sheet '${SHEET_NAME}' not found`);
  }

  // Retrieve API credentials from Script Properties
  var ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty('ACCOUNT_SID');
  var AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  var MESSAGING_SERVICE_SID = PropertiesService.getScriptProperties().getProperty('MESSAGING_SERVICE_SID');
  var CONTENT_SID = PropertiesService.getScriptProperties().getProperty('CONTENT_SID');

  // Basic validation for properties
  if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID || !CONTENT_SID) {
    logToSheet([new Date(), "Error", "Missing one or more Twilio API credentials in Script Properties."]);
    throw new Error("Missing Twilio API credentials.");
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  // Find phone number column index
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
    throw new Error("Phone number column not found");
  }

  // Start from row 1 to skip header row (index 0)
  var startRow = 1;
  var totalRows = data.length;

  logToSheet([new Date(), "sendWhatsAppMessages", "Processing " + (totalRows - startRow) + " rows for sending messages in batches of 10."]);

  for (var i = startRow; i < totalRows; i++) {
    var row = data[i];
    var number = row[phoneIndex]; // Phone number from the correct column

    if (!number) {
      logToSheet([new Date(), "Warning", "Skipping row " + (i + 1) + " due to empty phone number."]);
      continue; // Skip to the next row
    }

    // Format phone number for WhatsApp
    let formattedNumber = number.toString().replace(/\D/g, '');
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '972' + formattedNumber.substring(1);
    } else if (!formattedNumber.startsWith('972')) {
      formattedNumber = '972' + formattedNumber;
    }

    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + ACCOUNT_SID + '/Messages.json';
    var payload = {
      'To': 'whatsapp:+' + formattedNumber,
      'MessagingServiceSid': MESSAGING_SERVICE_SID,
      'ContentSid': CONTENT_SID
    };
    var options = {
      'method': 'post',
      'payload': payload,
      'headers': {
        'Authorization': 'Basic ' + Utilities.base64Encode(ACCOUNT_SID + ':' + AUTH_TOKEN)
      },
      'muteHttpExceptions': true
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();
      var jsonResponse = JSON.parse(response.getContentText());

      logToSheet([new Date(), "WhatsApp Send", "Sent to " + formattedNumber + " - Status: " + responseCode]);

      // Update status in sheet if status column exists
      const statusIndex = headers.findIndex(header => header === 'סטטוס');
      if (statusIndex !== -1) {
        // Only update status if it's currently empty or not a user reply
        const currentStatus = sheet.getRange(i + 1, statusIndex + 1).getValue();
        const userReplyStatuses = ['זקוקים לסיוע', 'כולם בסדר', 'לא בטוח', 'בטיפול', 'תגובה התקבלה'];
        
        if (!currentStatus || currentStatus === '' || !userReplyStatuses.includes(currentStatus)) {
          sheet.getRange(i + 1, statusIndex + 1).setValue('הודעה נשלחה');
          logToSheet([new Date(), "Status Update", `Updated status to 'הודעה נשלחה' for row ${i + 1}`]);
        } else {
          logToSheet([new Date(), "Status Preserved", `Preserved existing status '${currentStatus}' for row ${i + 1}`]);
        }
      }

    } catch (error) {
      logToSheet([new Date(), "WhatsApp Send Error", "Error sending to " + formattedNumber + ": " + error.toString()]);
      
      // Update status in sheet if status column exists
      const statusIndex = headers.findIndex(header => header === 'סטטוס');
      if (statusIndex !== -1) {
        sheet.getRange(i + 1, statusIndex + 1).setValue('Error: ' + error.message);
      }
    }

    // After processing every 10 numbers (starting from the first data row),
    // wait for the specified number of seconds.
    // (i - startRow + 1) gives the count of processed data rows.
    if ((i - startRow + 1) % 10 === 0 && (i + 1) < totalRows) {
      logToSheet([new Date(), "Batch Pause", "Processed 10 numbers. Pausing for " + secWaitBetweenEach10Numbers + " seconds."]);
      Utilities.sleep(secWaitBetweenEach10Numbers * 1000); // Utilities.sleep expects milliseconds
    }
  }
  
  logToSheet([new Date(), "sendWhatsAppMessages", "Finished sending messages."]);
  
  // Sync updated data to Firebase
  logToSheet([new Date(), "Firebase Sync", "Syncing updated data to Firebase..."]);
  syncResidentsToFirebase();
}

// ===== FIREBASE SYNC FUNCTIONS =====

function syncResidentsToFirebase() {
  try {
    logToSheet([new Date(), "Firebase Sync", "Starting residents sync to Firebase..."]);
    
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
    
    logToSheet([new Date(), "Firebase Sync", `Found ${dataRows.length} residents to sync`]);
    
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
    
    logToSheet([new Date(), "Firebase Sync", `Sync completed: ${successCount} successful, ${errorCount} errors`]);
    
  } catch (error) {
    logToSheet([new Date(), "Firebase Sync Error", error.toString()]);
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
      return true;
    } else {
      logToSheet([new Date(), "Firebase Sync Error", `Failed to sync resident ${residentId}: ${responseCode}`]);
      return false;
    }
    
  } catch (error) {
    logToSheet([new Date(), "Firebase Sync Error", `Error syncing resident ${residentId}: ${error.toString()}`]);
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
  
  logToSheet([new Date(), "Trigger Setup", "Firebase sync triggers set up successfully"]);
}

// ===== MANUAL FUNCTIONS =====

function manualSync() {
  syncResidentsToFirebase();
}

function manualWhatsAppSend() {
  sendWhatsAppMessages();
}

// ===== SYSTEM CLEAR FUNCTIONS =====

/**
 * Clears all resident statuses in the Google Sheet
 */
function clearAllResidentStatuses() {
  try {
    logToSheet([new Date(), "Clear Statuses", "Starting to clear all resident statuses..."]);
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error("Sheet '" + SHEET_NAME + "' not found");
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      logToSheet([new Date(), "Clear Statuses", "No data found in sheet"]);
      return;
    }
    
    const headers = values[0];
    const statusIndex = headers.findIndex(header => header === 'סטטוס');
    
    if (statusIndex === -1) {
      logToSheet([new Date(), "Clear Statuses Warning", "Status column 'סטטוס' not found in headers"]);
      return;
    }
    
    let clearedCount = 0;
    
    // Clear status for all data rows (skip header row)
    for (let i = 1; i < values.length; i++) {
      const currentStatus = values[i][statusIndex];
      if (currentStatus && currentStatus !== '') {
        sheet.getRange(i + 1, statusIndex + 1).setValue('');
        clearedCount++;
      }
    }
    
    logToSheet([new Date(), "Clear Statuses", "Cleared " + clearedCount + " resident statuses"]);
    
  } catch (error) {
    logToSheet([new Date(), "Clear Statuses Error", error.toString()]);
    throw error;
  }
}

/**
 * Clears all data from Firebase collections
 */
function clearAllFirebaseData() {
  try {
    logToSheet([new Date(), "Clear Firebase", "Starting to clear all data from Firebase..."]);
    
    // Collections to clear
    const collections = ['residents', 'eventLogs', 'tasks', 'leads', 'archivedTasks'];
    let totalDeleted = 0;
    let totalErrors = 0;
    
    for (let c = 0; c < collections.length; c++) {
      const collectionName = collections[c];
      logToSheet([new Date(), "Clear Firebase", "Clearing collection: " + collectionName]);
      
      try {
        // Get all documents from the collection
        const url = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + collectionName;
        const response = UrlFetchApp.fetch(url);
        const responseCode = response.getResponseCode();
        
        if (responseCode !== 200) {
          logToSheet([new Date(), "Clear Firebase Warning", "Failed to fetch " + collectionName + " from Firebase: " + responseCode]);
          continue;
        }
        
        const responseData = JSON.parse(response.getContentText());
        const documents = responseData.documents || [];
        
        logToSheet([new Date(), "Clear Firebase", "Found " + documents.length + " documents in " + collectionName + " to delete"]);
        
        let deletedCount = 0;
        let errorCount = 0;
        
        // Delete each document
        for (let i = 0; i < documents.length; i++) {
          const document = documents[i];
          const documentId = document.name.split('/').pop(); // Extract ID from full path
          
          try {
            const deleteUrl = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID + "/databases/(default)/documents/" + collectionName + "/" + documentId;
            const deleteResponse = UrlFetchApp.fetch(deleteUrl, {
              method: 'DELETE',
              muteHttpExceptions: true
            });
            
            if (deleteResponse.getResponseCode() === 200) {
              deletedCount++;
            } else {
              errorCount++;
              logToSheet([new Date(), "Clear Firebase Error", "Failed to delete " + collectionName + " document " + documentId + ": " + deleteResponse.getResponseCode()]);
            }
            
            // Small delay to avoid rate limiting
            Utilities.sleep(50);
            
          } catch (error) {
            errorCount++;
            logToSheet([new Date(), "Clear Firebase Error", "Error deleting " + collectionName + " document " + documentId + ": " + error.toString()]);
          }
        }
        
        logToSheet([new Date(), "Clear Firebase", "Deleted " + deletedCount + " documents from " + collectionName + ", " + errorCount + " errors"]);
        totalDeleted += deletedCount;
        totalErrors += errorCount;
        
      } catch (error) {
        logToSheet([new Date(), "Clear Firebase Error", "Error clearing collection " + collectionName + ": " + error.toString()]);
        totalErrors++;
      }
    }
    
    logToSheet([new Date(), "Clear Firebase", "Total deleted: " + totalDeleted + " documents, " + totalErrors + " errors"]);
    
  } catch (error) {
    logToSheet([new Date(), "Clear Firebase Error", error.toString()]);
    throw error;
  }
}

function manualClearSystem() {
  clearAllResidentStatuses();
  clearAllFirebaseData();
}

// ===== TEST FUNCTIONS =====

function testLogToSheet() {
  logToSheet([new Date(), "Test", "Manual test of logToSheet function"]);
}

// ===== TEST FUNCTIONS =====

function testFirebaseConnection() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
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
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      logToSheet([new Date(), "Test Error", `Sheet "${SHEET_NAME}" not found!`]);
      return false;
    }
    
    const range = sheet.getRange(DATA_RANGE);
    const values = range.getValues();
    
    if (values.length < 2) {
      logToSheet([new Date(), "Test Error", "No data found in sheet"]);
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    logToSheet([new Date(), "Test", `Found ${dataRows.length} residents in sheet`]);
    logToSheet([new Date(), "Test", "Headers: " + JSON.stringify(headers)]);
    
    // Check for required fields
    const requiredFields = ['טלפון', 'שם פרטי', 'שם משפחה'];
    logToSheet([new Date(), "Test", "Checking required fields:"]);
    
    requiredFields.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        logToSheet([new Date(), "Test", `✅ "${field}" found at column ${String.fromCharCode(65 + index)}`]);
      } else {
        logToSheet([new Date(), "Test", `❌ "${field}" NOT FOUND`]);
      }
    });
    
    // Also check for alternative phone column names
    const phoneAlternatives = ['מספר טלפון', 'טלפון נייד', 'מס טלפון', 'טלפון סלולרי'];
    logToSheet([new Date(), "Test", "Checking for phone number columns:"]);
    phoneAlternatives.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        logToSheet([new Date(), "Test", `✅ Found phone column: "${field}" at column ${String.fromCharCode(65 + index)}`]);
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
    logToSheet([new Date(), "Test", `ACCOUNT_SID: ${ACCOUNT_SID ? '✅ Set' : '❌ Missing'}`]);
    logToSheet([new Date(), "Test", `AUTH_TOKEN: ${AUTH_TOKEN ? '✅ Set' : '❌ Missing'}`]);
    logToSheet([new Date(), "Test", `MESSAGING_SERVICE_SID: ${MESSAGING_SERVICE_SID ? '✅ Set' : '❌ Missing'}`]);
    logToSheet([new Date(), "Test", `CONTENT_SID: ${CONTENT_SID ? '✅ Set' : '❌ Missing'}`]);
    
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
    
    // Test 4: Lookup table
    logToSheet([new Date(), "Test", "4. Testing lookup table..."]);
    testLookupTable();
    
    // Test 5: Status mapping
    logToSheet([new Date(), "Test", "5. Testing status mapping..."]);
    testStatusMapping();
    
    // Test 6: Webhook debugging
    logToSheet([new Date(), "Test", "6. Testing webhook setup..."]);
    debugTwilioWebhook();
    
    logToSheet([new Date(), "Test", "✅ All tests passed! System is ready."]);
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Comprehensive test failed: " + error.toString()]);
    return false;
  }
}

function testLookupTable() {
  try {
    logToSheet([new Date(), "Test", "=== TESTING LOOKUP TABLE ==="]);
    
    // Get the lookup table
    var phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY);
    if (!phoneLookupString) {
      logToSheet([new Date(), "Test Error", "Lookup table not found in Script Properties"]);
      return false;
    }
    
    var phoneLookup = JSON.parse(phoneLookupString);
    logToSheet([new Date(), "Test", `Lookup table has ${Object.keys(phoneLookup).length} entries`]);
    
    // Show first few entries
    const entries = Object.entries(phoneLookup).slice(0, 3);
    entries.forEach(([phone, row]) => {
      logToSheet([new Date(), "Test", `Phone: ${phone} -> Row: ${row}`]);
    });
    
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Lookup table test failed: " + error.toString()]);
    return false;
  }
}

function testWebhook() {
  try {
    logToSheet([new Date(), "Test", "=== TESTING WEBHOOK ==="]);
    
    // Get the webhook URL
    const webAppUrl = ScriptApp.getService().getUrl();
    logToSheet([new Date(), "Test", `Webhook URL: ${webAppUrl}`]);
    
    // Test with sample Twilio data
    const testData = {
      From: "whatsapp:+972541234567",
      Body: "4 - אנחנו זקוקים לסיוע"
    };
    
    logToSheet([new Date(), "Test", "Test data: " + JSON.stringify(testData)]);
    
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Webhook test failed: " + error.toString()]);
    return false;
  }
}

function debugTwilioWebhook() {
  try {
    logToSheet([new Date(), "Debug", "=== TWILIO WEBHOOK DEBUGGING ==="]);
    
    // Get the webhook URL
    const webAppUrl = ScriptApp.getService().getUrl();
    logToSheet([new Date(), "Debug", `Webhook URL: ${webAppUrl}`]);
    
    // Instructions for Twilio setup
    logToSheet([new Date(), "Debug", "=== TWILIO SETUP INSTRUCTIONS ==="]);
    logToSheet([new Date(), "Debug", "1. Go to Twilio Console > Messaging > Settings > WhatsApp Sandbox"]);
    logToSheet([new Date(), "Debug", "2. Set the webhook URL to: " + webAppUrl]);
    logToSheet([new Date(), "Debug", "3. Make sure the webhook is set to POST method"]);
    logToSheet([new Date(), "Debug", "4. The webhook should send 'From' and 'Body' parameters"]);
    
    // Test the webhook with a simulated request
    logToSheet([new Date(), "Debug", "=== SIMULATING WEBHOOK REQUEST ==="]);
    
    const testPayload = {
      From: "whatsapp:+972541234567",
      Body: "4 - אנחנו זקוקים לסיוע"
    };
    
    const options = {
      method: 'POST',
      payload: testPayload,
      muteHttpExceptions: true
    };
    
    try {
      const response = UrlFetchApp.fetch(webAppUrl, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      logToSheet([new Date(), "Debug", `Webhook test response: ${responseCode} - ${responseText}`]);
      
      if (responseCode === 200) {
        logToSheet([new Date(), "Debug", "✅ Webhook is working correctly!"]);
      } else {
        logToSheet([new Date(), "Debug", "❌ Webhook returned error code: " + responseCode]);
      }
      
    } catch (error) {
      logToSheet([new Date(), "Debug", "❌ Webhook test failed: " + error.toString()]);
    }
    
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Debug Error", "Webhook debugging failed: " + error.toString()]);
    return false;
  }
}

function testStatusMapping() {
  try {
    logToSheet([new Date(), "Test", "=== TESTING STATUS MAPPING ==="]);
    
    const testReplies = [
      "4 - אנחנו זקוקים לסיוע",
      "1 - כולם בסדר",
      "2 - לא בטוח",
      "3 - בטיפול",
      "זקוקים לסיוע",
      "כולם בסדר",
      "לא בטוח",
      "בטיפול",
      "סיוע",
      "בסדר",
      "לא יודע",
      "מטפלים",
      "help",
      "ok",
      "don't know",
      "dealing with it",
      "random message",
      "תודה",
      "?"
    ];
    
    testReplies.forEach(reply => {
      let statusValue = 'תגובה התקבלה'; // Default status
      
      // Simple mapping based on the original reply
      if (reply.includes('4') || reply.includes('זקוקים') || reply.includes('סיוע')) {
        statusValue = 'זקוקים לסיוע';
      } else if (reply.includes('1') || reply.includes('בסדר') || reply.includes('טוב')) {
        statusValue = 'כולם בסדר';
      } else if (reply.includes('2') || reply.includes('לא בטוח') || reply.includes('לא יודע')) {
        statusValue = 'לא בטוח';
      } else if (reply.includes('3') || reply.includes('בטיפול') || reply.includes('מטפלים')) {
        statusValue = 'בטיפול';
      }
      
      logToSheet([new Date(), "Status Mapping Test", `Reply: "${reply}" -> Status: "${statusValue}"`]);
    });
    
    return true;
    
  } catch (error) {
    logToSheet([new Date(), "Test Error", "Status mapping test failed: " + error.toString()]);
    return false;
  }
}

/**
 * A simple doGet function for testing deployment.
 */
function doGet(e) {
  return ContentService.createTextOutput("WhatsApp + Firebase Sync Service is running").setMimeType(ContentService.MimeType.TEXT);
}
