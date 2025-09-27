/** @OnlyCurrentDoc */
// filepath: Google Apps Script (bound to a Google Sheet)

// --- Configuration ---
// Set debugMode to true to enable logging to the "Script Logs" sheet.
// Set debugMode to false to disable all logging.
var debugMode = false;

// Set the number of seconds to wait between sending messages to each batch of 10 numbers.
// For example, 5 means wait 5 seconds after processing 10 numbers.
var secWaitBetweenEach10Numbers = 1;

// Key for the phone number lookup table in Script Properties
var PHONE_LOOKUP_PROPERTY_KEY = 'PHONE_NUMBER_ROW_LOOKUP';

// Set reIndexWithEveryRun to true if you want the phone number lookup table
// to be updated every time sendWhatsAppMessages is triggered via doPost.
// Set to false if you manage the lookup table update separately.
var reIndexWithEveryRun = true;
// --- End Configuration ---


/**
 * Helper function to append a row to the log sheet if debugMode is true.
 * @param {Array} rowData The data to append to the log sheet.
 */
function logToSheet(rowData) {
  if (debugMode) {
    try {
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
 * or via a time-driven trigger whenever the 'גליון1' sheet data changes.
 */
function updatePhoneLookupTable() {
  logToSheet([new Date(), "Lookup Table Update", "Starting to update phone number lookup table."]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("גליון1");

  if (!sheet) {
    logToSheet([new Date(), "Error", "Sheet 'גליון1' not found for lookup table generation."]);
    throw new Error("Sheet 'גליון1' not found.");
  }

  var data = sheet.getDataRange().getValues();
  var phoneLookup = {}; // Object to store normalizedNumber -> row index mapping

  // Iterate from the second row (index 1) to skip headers
  for (var i = 1; i < data.length; i++) {
    var phoneNumber = data[i][0]; // Assuming phone number is in the first column (index 0)
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

/**
 * Handles incoming POST requests and dispatches them to appropriate handlers.
 * It acts as a router for different types of triggers.
 *
 * @param {GoogleAppsScript.Events.DoPost} e The event object containing POST parameters.
 */
function doPost(e) {
  logToSheet([new Date(), "doPost Start", JSON.stringify(e.parameter || {})]);

  try {
    var params = e && e.parameter ? e.parameter : {};

    // Determine the type of trigger based on the presence of specific parameters
    // If 'From' and 'Body' (typical for Twilio inbound messages) are present,
    // it's an inbound Twilio message to be processed.
    if (params.From && params.Body) {
      logToSheet([new Date(), "Trigger Type", "Twilio Inbound Message (From & Body present)"]);
      return handleTwilioInbound(e);
    } else if (params.triggerWhatsappOverList === '1') { // New: Explicitly check for the WhatsApp send trigger parameter
      logToSheet([new Date(), "Trigger Type", "WhatsApp Send Trigger (triggerWhatsappOverList=1)"]);
      return handleWhatsAppTrigger(e);
    } else {
      // This block handles any other POST requests that don't fit the above criteria.
      logToSheet([new Date(), "Trigger Type", "Unrecognized/Unhandled POST Request", JSON.stringify(params)]);
      logToSheet([new Date(), "Response", "Unrecognized POST request. No action taken."]);
      return ContentService.createTextOutput("Unrecognized POST request").setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (error) {
    // Log any unexpected errors that occur in the routing logic
    logToSheet([new Date(), "doPost Error", error.toString()]);
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
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("גליון1");
      if (!sheet) {
        logToSheet([new Date(), "Error", "Sheet 'גליון1' not found."]);
        return ContentService.createTextOutput("Sheet not found").setMimeType(ContentService.MimeType.TEXT);
      }

      // --- New: Use lookup table from Script Properties ---
      var phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY);
      if (!phoneLookupString) {
        logToSheet([new Date(), "Warning", "Phone number lookup table not found in Script Properties. Please run updatePhoneLookupTable() first."]);
        // Fallback: If no lookup table, you might re-enable sheet iteration here,
        // but for now, we'll assume the lookup table is essential.
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
        // Direct update using the found row index
        sheet.getRange(rowIndex, 3).setValue(userReply);
        sheet.getRange(rowIndex, 4).setValue(new Date());
        logToSheet([new Date(), "Success", "Updated reply for " + fromNumber + " in row " + rowIndex]);
      } else {
        logToSheet([new Date(), "No Match", "No matching phone number found for " + fromNumber + " in lookup table."]);
      }
      // --- End New ---

    } else {
      // This case should ideally be caught by the router in doPost
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
 * Sends WhatsApp messages to numbers listed in the active sheet,
 * processing them in batches with a configurable delay.
 */
function sendWhatsAppMessages() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

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
  // Start from row 1 to skip header row (index 0)
  var startRow = 1;
  var totalRows = data.length;

  logToSheet([new Date(), "sendWhatsAppMessages", "Processing " + (totalRows - startRow) + " rows for sending messages in batches of 10."]);

  for (var i = startRow; i < totalRows; i++) {
    var row = data[i];
    var number = row[0]; // Phone number is in the first column (index 0)

    if (!number) {
      logToSheet([new Date(), "Warning", "Skipping row " + (i + 1) + " due to empty phone number in column A."]);
      continue; // Skip to the next row
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
      },
      'muteHttpExceptions': true
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();
      var jsonResponse = JSON.parse(response.getContentText());

      logToSheet([new Date(), "WhatsApp Send", "Sent to " + number + " - Status: " + responseCode + " - Response: " + JSON.stringify(jsonResponse)]);

      sheet.getRange(i + 1, 2).setValue(responseCode); // Update the sheet with the response code

    } catch (error) {
      logToSheet([new Date(), "WhatsApp Send Error", "Error sending to " + number + ": " + error.toString()]);
      sheet.getRange(i + 1, 2).setValue('Error: ' + error.toString());
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
}

/**
 * A simple doGet function for testing deployment.
 */
function doGet(e) {
  return ContentService.createTextOutput("Hello, this is a GET response from your Apps Script!").setMimeType(ContentService.MimeType.TEXT);
}
