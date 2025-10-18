/**Original App Script for sending WhatsApp messages to residents
 * @OnlyCurrentDoc */
// filepath: Google Apps Script (bound to a Google Sheet)

// Firebase configuration - UPDATE THESE VALUES
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyBHeb_AS_Iyfc8K7z2T01tLYfhFfGAs_wk";
const SHEET_NAME = "גליון1";
const DATA_RANGE = "A1:Z500";

function sendWhatsAppMessages() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  var ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty('ACCOUNT_SID');
  var AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  var MESSAGING_SERVICE_SID = PropertiesService.getScriptProperties().getProperty('MESSAGING_SERVICE_SID');
  var CONTENT_SID = PropertiesService.getScriptProperties().getProperty('CONTENT_SID');

  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) { // skip header
    var row = data[i];
    var number = row[0];
    if (!number) {
      Logger.log('Skipping row ' + (i + 1) + ' due to empty phone number.');
      continue;
    }

    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + ACCOUNT_SID + '/Messages.json';
    var payload = {
      'To': 'whatsapp:' + number,
      'MessagingServiceSid': MESSAGING_SERVICE_SID,
      'ContentSid': CONTENT_SID
    };
    var options = {
      'method': 'post',
      'payload': payload,
      'headers': {
        'Authorization': 'Basic ' + Utilities.base64Encode(ACCOUNT_SID + ':' + AUTH_TOKEN)
      }
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      var jsonResponse = JSON.parse(response.getContentText());

      Logger.log('Sent to ' + number + ' - Status: ' + response.getResponseCode());
      Logger.log(jsonResponse);

      sheet.getRange(i + 1, 2).setValue(response.getResponseCode());

    } catch (error) {
      Logger.log('Error sending to ' + number + ': ' + error);
      sheet.getRange(i + 1, 2).setValue('Error: ' + error);
    }
  }
  Logger.log('Finished sending messages.');
  
  // Sync to Firebase after sending WhatsApp messages
  syncResidentsToFirebase();
}

function doPost(e) {
  var logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Script Logs"); // Get your log sheet

  // --- Start of Logging ---
  logSheet.appendRow([new Date(), "doPost Start", JSON.stringify(e)]);
  // --- End of Logging ---

  try {
    var params = e && e.parameter ? e.parameter : {};
    var fromNumber = params.From;
    var userReply = params.Body;

    // --- Start of Logging ---
    logSheet.appendRow([new Date(), "Received Params", "From: " + fromNumber + ", Body: " + userReply]);
    // --- End of Logging ---

    if (fromNumber && userReply) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("גליון1");
      var data = sheet.getDataRange().getValues();

      // --- Start of Logging ---
      logSheet.appendRow([new Date(), "Processing Data", "Rows in sheet: " + data.length]);
      // --- End of Logging ---

      var foundMatch = false; // Flag to know if a match was found
      for (var i = 1; i < data.length; i++) {
        var sheetPhoneNumber = data[i][0].toString();

        var normalizedSheetPhone = sheetPhoneNumber.replace(/^0/, '').replace(/\D/g, '');
        var normalizedFromNumber = fromNumber.replace('whatsapp:+972', '972').replace(/\D/g, '');

        // --- Start of Logging ---
        logSheet.appendRow([new Date(), "Comparing", "Sheet Num: " + normalizedSheetPhone + ", Incoming Num: " + normalizedFromNumber]);
        // --- End of Logging ---

        if (normalizedSheetPhone === normalizedFromNumber) {
          sheet.getRange(i + 1, 3).setValue(userReply);
          sheet.getRange(i + 1, 4).setValue(new Date());
          // Use logSheet for success as well
          logSheet.appendRow([new Date(), "Success", "Updated reply for " + fromNumber + " in row " + (i + 1)]);
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) {
          logSheet.appendRow([new Date(), "No Match", "No matching phone number found for " + fromNumber]);
      }

      // Sync to Firebase after processing WhatsApp reply
      syncResidentsToFirebase();

    } else {
      logSheet.appendRow([new Date(), "No Params", "POST received with no From or Body parameters."]);
    }
  } catch (error) {
    logSheet.appendRow([new Date(), "Error", error.toString()]);
  }

  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  return ContentService.createTextOutput("Hello, this is a GET response");
}

// ===== FIREBASE SYNC FUNCTIONS =====

function syncResidentsToFirebase() {
  try {
    Logger.log("Starting residents sync to Firebase...");
    
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
      
      const success = syncResidentToFirebase(residentId, residentData);
      
      if (success) {
        successCount++;
      } else {
        errorCount++;
      }
      
      Utilities.sleep(100); // Small delay to avoid rate limiting
    }
    
    Logger.log(`Firebase sync completed: ${successCount} successful, ${errorCount} errors`);
    
  } catch (error) {
    Logger.log("Error syncing residents to Firebase: " + error.toString());
  }
}

function syncResidentToFirebase(residentId, residentData) {
  try {
    // Use the REST API with proper authentication
    const url = `https://firestore.googleapis.com/v1/projects/emergency-dashboard-a3842/databases/(default)/documents/residents/${residentId}`;
    
    const payload = {
      fields: convertToFirestoreFields(residentData)
    };
    
    const options = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        // Try without Authorization header first (public API key)
      },
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    Logger.log(`Response for ${residentId}: ${responseCode} - ${responseText}`);
    
    if (responseCode === 200) {
      Logger.log(`Successfully synced resident: ${residentId}`);
      return true;
    } else {
      Logger.log(`Failed to sync resident ${residentId}: ${responseCode} - ${responseText}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`Error syncing resident ${residentId}: ${error.toString()}`);
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

function setupTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncResidentsToFirebase') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new triggers for automatic sync
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('syncResidentsToFirebase').timeBased().everyMinutes(5).create();
  
  Logger.log("Firebase sync triggers set up successfully");
}

function manualSync() {
  syncResidentsToFirebase();
}

function testFirebaseConnection() {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/residents`;
    const response = UrlFetchApp.fetch(url);
    Logger.log("Firebase connection test successful");
    return true;
  } catch (error) {
    Logger.log("Firebase connection test failed: " + error.toString());
    return false;
  }
}