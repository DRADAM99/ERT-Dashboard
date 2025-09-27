/** @OnlyCurrentDoc */
// Combined Google Apps Script: WhatsApp Messaging + Firebase Sync V4 FIXED
//
// Goals in v4:
// 1) Correct reply-to-status mapping to match app expectations exactly:
//    'כולם בסדר', 'לא בטוח', 'זקוקים לסיוע'.
// 2) Robust webhook parameter parsing (Twilio 'From' and 'Body').
// 3) Immediate per-row updates in Google Sheet AND Firestore.
// 4) GreenInEyes flow sends WhatsApp first (fast), optional sync after.
// 5) Add a nightly 2am sync trigger so Firestore is pre-populated.
// 6) Maintain phone lookup table for O(1) match of replies to rows.
//
// FIXED: Handle malformed webhook parameters from Twilio

// ===== CONFIGURATION =====
var debugMode = true; // set to false in production if you want less logging

// The sheet that contains resident data used by the system
var SHEET_NAME_V4 = "2025"; // Change if needed
var DATA_RANGE_V4 = "A1:Q10"; // Extended to include column Q for timestamp

// Phone lookup table key (Script Properties)
var PHONE_LOOKUP_PROPERTY_KEY_V4 = 'PHONE_NUMBER_ROW_LOOKUP_V4';

// Rebuild the lookup table automatically before sending messages
var reIndexWithEveryRun = true;

// Firestore configuration
var FIREBASE_PROJECT_ID_V4 = "emergency-dashboard-a3842";
// Optional webhook in your Next.js app to apply a single-row update server-side
// Example: https://your-domain.vercel.app/api/sync-residents (custom endpoint)
var WEBHOOK_SYNC_URL = ""; // leave empty to skip webhook

// Twilio credentials must be stored in Script Properties:
// ACCOUNT_SID, AUTH_TOKEN, MESSAGING_SERVICE_SID, CONTENT_SID

// ===== LOGGING =====
function logToSheetV4(rowData) {
  if (!debugMode) return;
  try {
    if (!rowData || !Array.isArray(rowData) || rowData.length === 0) {
      Logger.log("Invalid log row: " + JSON.stringify(rowData));
      return;
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName("Script Logs");
    if (!logSheet) {
      logSheet = ss.insertSheet("Script Logs");
      logSheet.appendRow(["Timestamp", "Type", "Details"]);
    }
    logSheet.appendRow(rowData);
  } catch (e) {
    Logger.log("Error writing to log sheet: " + e.toString() + " - Data: " + JSON.stringify(rowData));
  }
}

// ===== PHONE NORMALIZATION & LOOKUP =====
function normalizePhoneNumberV4(phoneNumber) {
  if (!phoneNumber) return '';
  var normalized = phoneNumber.toString().replace(/\D/g, '');
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }
  if (normalized.length === 9 && !normalized.startsWith('972')) {
    normalized = '972' + normalized;
  }
  if (normalized.startsWith('whatsapp')) {
    normalized = normalized.replace('whatsapp', '').replace(/^\+/, '');
  }
  return normalized;
}

function updatePhoneLookupTableV4() {
  logToSheetV4([new Date(), "Lookup Update", "Building phone lookup table V4..."]);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_V4);
  if (!sheet) {
    throw new Error("Sheet '" + SHEET_NAME_V4 + "' not found.");
  }

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) {
    logToSheetV4([new Date(), "Lookup Update", "No data rows found."]);
  }

  var headers = data[0];
  var phoneIndex = headers.findIndex(function(header) {
    return header === 'טלפון' || header === 'phone' || header === 'Phone' ||
           header === 'מספר טלפון' || header === 'טלפון נייד' ||
           header === 'מס טלפון' || header === 'טלפון סלולרי';
  });
  if (phoneIndex === -1) {
    throw new Error("Phone number column not found. Headers: " + JSON.stringify(headers));
  }

  var phoneLookup = {};
  for (var i = 1; i < data.length; i++) {
    var phoneNumber = data[i][phoneIndex];
    if (phoneNumber) {
      var normalized = normalizePhoneNumberV4(phoneNumber);
      phoneLookup[normalized] = i + 1; // 1-based row index
    }
  }

  PropertiesService.getScriptProperties().setProperty(
    PHONE_LOOKUP_PROPERTY_KEY_V4,
    JSON.stringify(phoneLookup)
  );
  logToSheetV4([new Date(), "Lookup Update", "Lookup entries: " + Object.keys(phoneLookup).length]);
}

function getRowIndexFromLookupV4(fromNumber, sheet) {
  var phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY_V4);
  if (!phoneLookupString) {
    updatePhoneLookupTableV4();
    phoneLookupString = PropertiesService.getScriptProperties().getProperty(PHONE_LOOKUP_PROPERTY_KEY_V4);
  }
  var phoneLookup = {};
  try {
    phoneLookup = JSON.parse(phoneLookupString || '{}');
  } catch (e) {
    logToSheetV4([new Date(), "Lookup Error", "JSON parse failed: " + e.toString()]);
  }

  var normalized = normalizePhoneNumberV4(fromNumber);
  var rowIndex = phoneLookup[normalized];

  if (!rowIndex) {
    // Fallback: scan the sheet once to try to find a match
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var phoneIndex = headers.findIndex(function(header) {
      return header === 'טלפון' || header === 'phone' || header === 'Phone' ||
             header === 'מספר טלפון' || header === 'טלפון נייד' ||
             header === 'מס טלפון' || header === 'טלפון סלולרי';
    });
    if (phoneIndex !== -1) {
      for (var i = 1; i < data.length; i++) {
        var candidate = normalizePhoneNumberV4(data[i][phoneIndex]);
        if (candidate === normalized) {
          rowIndex = i + 1;
          break;
        }
      }
    }
  }

  return rowIndex; // may be undefined
}

// ===== STATUS MAPPING =====
function mapReplyToStatusV4(reply) {
  if (!reply) return 'תגובה התקבלה';
  var text = reply.toString();

  // Normalize Hebrew variants and handle common English words
  // Priority: help (4) > ok (1) > unsure (2)
  if (/(4|זקוקים|סיוע|help)/i.test(text)) return 'זקוקים לסיוע';
  if (/(1|בסדר|הכל בסדר|כולם בסדר|ok|okay|fine|טוב)/i.test(text)) return 'כולם בסדר';
  if (/(2|לא בטוח|לא יודע|unsure|unknown|don\'t know)/i.test(text)) return 'לא בטוח';
  return 'תגובה התקבלה';
}

// ===== SHEET HELPERS =====
function getHeadersV4(sheet) {
  var data = sheet.getDataRange().getValues();
  return data && data.length ? data[0] : [];
}

function findColumnIndexV4(headers, names) {
  for (var i = 0; i < names.length; i++) {
    var idx = headers.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ===== FIRESTORE SYNC (ROW-LEVEL) =====
function convertToFirestoreFieldsV4(data) {
  var fields = {};
  Object.keys(data).forEach(function(key) {
    var value = data[key];
    if (value === null || value === undefined) return;
    if (Object.prototype.toString.call(value) === '[object Date]') {
      fields[key] = { timestampValue: value.toISOString() };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      // Firestore integerValue must be string; keep as integer-like
      fields[key] = { integerValue: String(Math.floor(value)) };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else {
      // fallback serialize to string
      fields[key] = { stringValue: String(value) };
    }
  });
  return fields;
}

// Fetch existing Firestore document fields (returns field map or null)
function getExistingFirestoreFieldsV4(docUrl) {
  try {
    var resp = UrlFetchApp.fetch(docUrl, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var json = JSON.parse(resp.getContentText());
    return json && json.fields ? json.fields : null;
  } catch (e) {
    logToSheetV4([new Date(), "Firestore Get Error", e.toString()]);
    return null;
  }
}

// Merge Firestore REST field maps (existingFields has precedence unless overridden by newFields)
function mergeFieldMapsV4(existingFields, newFields) {
  var merged = {};
  // copy existing
  Object.keys(existingFields || {}).forEach(function(k) { merged[k] = existingFields[k]; });
  // override with new
  Object.keys(newFields || {}).forEach(function(k) { merged[k] = newFields[k]; });
  return merged;
}

function generateResidentIdV4(rowObj) {
  var phone = rowObj['טלפון'] || rowObj['טלפון נייד'] || rowObj['מספר טלפון'] || rowObj['מס טלפון'] || rowObj['טלפון סלולרי'];
  if (phone) return 'resident_' + phone.toString().replace(/\D/g, '');
  if (rowObj['שם פרטי'] && rowObj['שם משפחה']) {
    return 'resident_' + (rowObj['שם פרטי'] + '_' + rowObj['שם משפחה']).replace(/[^\p{L}\p{N}_]+/gu, '_');
  }
  if (rowObj.rowIndex) {
    return 'resident_row_' + rowObj.rowIndex;
  }
  return 'resident_' + Math.random().toString(36).substr(2, 9);
}

function buildRowObjectV4(sheet, rowIndex) {
  var range = sheet.getRange(DATA_RANGE_V4);
  var values = range.getValues();
  var headers = values[0];
  var row = values[rowIndex - 1]; // 1-based -> 0-based
  var obj = {};
  for (var i = 0; i < headers.length; i++) {
    if (headers[i]) obj[headers[i]] = row[i];
  }
  // Enrich
  obj.syncedAt = new Date();
  obj.source = "google_sheets";
  obj.rowIndex = rowIndex;
  return obj;
}

// Returns true if columns A-P (0..15) are all empty for the given row array
function isRowEmptyAPV4(row) {
  for (var c = 0; c < 16; c++) {
    var v = row[c];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      return false;
    }
  }
  return true;
}

function syncSingleRowToFirestoreV4(sheet, rowIndex) {
  try {
    var rowObj = buildRowObjectV4(sheet, rowIndex);
    var residentId = generateResidentIdV4(rowObj);
    var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID_V4 + '/databases/(default)/documents/residents/' + residentId;

    // Merge with existing fields to avoid wiping non-sheet data
    var existingFields = getExistingFirestoreFieldsV4(url);
    var newFields = convertToFirestoreFieldsV4(rowObj);
    var mergedFields = existingFields ? mergeFieldMapsV4(existingFields, newFields) : newFields;

    var payload = { fields: mergedFields };
    var options = {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    if (code !== 200) {
      logToSheetV4([new Date(), "Firestore Warn", "Row " + rowIndex + " patch failed: " + code + " - " + resp.getContentText()]);
      // Optional webhook fallback
      if (WEBHOOK_SYNC_URL) {
        try {
          UrlFetchApp.fetch(WEBHOOK_SYNC_URL, {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify({ action: 'upsertResident', residentId: residentId, data: rowObj }),
            muteHttpExceptions: true
          });
        } catch (werr) {
          logToSheetV4([new Date(), "Webhook Error", werr.toString()]);
        }
      }
    } else {
      logToSheetV4([new Date(), "Firestore OK", "Row " + rowIndex + " -> " + residentId]);
    }
  } catch (e) {
    logToSheetV4([new Date(), "Firestore Error", e.toString()]);
  }
}

// ===== WHATSAPP SENDING =====
function sendWhatsAppMessagesV4() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_V4);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME_V4 + "' not found");

  // Twilio credentials from Script Properties
  var ACCOUNT_SID = PropertiesService.getScriptProperties().getProperty('ACCOUNT_SID');
  var AUTH_TOKEN = PropertiesService.getScriptProperties().getProperty('AUTH_TOKEN');
  var MESSAGING_SERVICE_SID = PropertiesService.getScriptProperties().getProperty('MESSAGING_SERVICE_SID');
  var CONTENT_SID = PropertiesService.getScriptProperties().getProperty('CONTENT_SID');
  if (!ACCOUNT_SID || !AUTH_TOKEN || !MESSAGING_SERVICE_SID || !CONTENT_SID) {
    throw new Error("Missing Twilio credentials in Script Properties");
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var phoneIndex = headers.findIndex(function(header) {
    return header === 'טלפון' || header === 'phone' || header === 'Phone' ||
           header === 'מספר טלפון' || header === 'טלפון נייד' ||
           header === 'מס טלפון' || header === 'טלפון סלולרי';
  });
  if (phoneIndex === -1) throw new Error("Phone number column not found");

  var statusIndex = headers.indexOf('סטטוס');

  if (reIndexWithEveryRun) updatePhoneLookupTableV4();

  var totalRows = data.length;
  var processed = 0;
  var consecutiveEmpty = 0;

  for (var i = 1; i < totalRows; i++) {
    // Abort switch for safety
    var abortFlag = PropertiesService.getScriptProperties().getProperty('ABORT_SEND_V4');
    if (abortFlag === '1') {
      logToSheetV4([new Date(), "Abort", "ABORT_SEND_V4 detected. Stopping send loop."]); 
      break;
    }

    var row = data[i];
    if (isRowEmptyAPV4(row)) {
      consecutiveEmpty++;
      logToSheetV4([new Date(), "Send Skip", "Row " + (i + 1) + " empty A-P (#" + consecutiveEmpty + ")"]);
      if (consecutiveEmpty >= 5) {
        logToSheetV4([new Date(), "Send Stop", "Reached 5 consecutive empty A-P rows. Aborting send function."]);
        PropertiesService.getScriptProperties().setProperty('ABORT_SEND_V4', '1');
        return;
      }
      continue;
    }
    var number = row[phoneIndex];
    if (!number || String(number).trim() === '') {
      consecutiveEmpty++;
      logToSheetV4([new Date(), "Send Skip", "Row " + (i + 1) + " empty phone (#" + consecutiveEmpty + ")"]);
      if (consecutiveEmpty >= 5) {
        logToSheetV4([new Date(), "Send Stop", "Reached 5 consecutive empty rows. Aborting send function."]);
        // Also set abort flag as guard and exit function immediately
        PropertiesService.getScriptProperties().setProperty('ABORT_SEND_V4', '1');
        return;
      }
      continue;
    } else {
      consecutiveEmpty = 0;
    }

    var formatted = number.toString().replace(/\D/g, '');
    if (formatted.startsWith('0')) formatted = '972' + formatted.substring(1);
    else if (!formatted.startsWith('972')) formatted = '972' + formatted;

    var url = 'https://api.twilio.com/2010-04-01/Accounts/' + ACCOUNT_SID + '/Messages.json';
    var payload = {
      To: 'whatsapp:+' + formatted,
      MessagingServiceSid: MESSAGING_SERVICE_SID,
      ContentSid: CONTENT_SID
    };
    var options = {
      method: 'post',
      payload: payload,
      headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(ACCOUNT_SID + ':' + AUTH_TOKEN) },
      muteHttpExceptions: true
    };

    try {
      var resp = UrlFetchApp.fetch(url, options);
      var code = resp.getResponseCode();
      logToSheetV4([new Date(), "Twilio", "Row " + (i + 1) + " -> " + formatted + " code " + code]);

      // Write 'הודעה נשלחה' only if not already user-reply
      if (statusIndex !== -1) {
        var currentStatus = sheet.getRange(i + 1, statusIndex + 1).getValue();
        var userReplyStatuses = ['זקוקים לסיוע', 'כולם בסדר', 'לא בטוח', 'תגובה התקבלה'];
        if (!currentStatus || userReplyStatuses.indexOf(String(currentStatus)) === -1) {
          sheet.getRange(i + 1, statusIndex + 1).setValue('הודעה נשלחה');
        }
      }
      processed++;
    } catch (e) {
      logToSheetV4([new Date(), "Twilio Error", e.toString()]);
      if (statusIndex !== -1) sheet.getRange(i + 1, statusIndex + 1).setValue('Error: ' + e.toString());
    }

    if ((i % 10) === 0 && i + 1 < totalRows) Utilities.sleep(800); // Pause to avoid rate limits
  }

  logToSheetV4([new Date(), "Twilio", "Completed sends: " + processed]);
}

// ===== WEBHOOK ROUTING =====
function doPost(e) {
  logToSheetV4([new Date(), "Webhook", "POST received V4 FIXED"]);

  var params = extractWebhookParamsV4(e);

  // Routes
  if (params.From && params.Body) {
    return handleTwilioInboundV4(params);
  }
  if (params.triggerWhatsappOverList === '1') {
    try {
      if (reIndexWithEveryRun) updatePhoneLookupTableV4();
      sendWhatsAppMessagesV4();
      return ContentService.createTextOutput("WhatsApp send initiated").setMimeType(ContentService.MimeType.TEXT);
    } catch (err) {
      logToSheetV4([new Date(), "Trigger Error", err.toString()]);
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }
  if (params.triggerGreenInEyes === '1') {
    try {
      activateGreenInEyesV4();
      return ContentService.createTextOutput("GreenInEyes initiated").setMimeType(ContentService.MimeType.TEXT);
    } catch (gerr) {
      logToSheetV4([new Date(), "GreenInEyes Error", gerr.toString()]);
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }
  if (params.triggerNightlySetup === '1') {
    try {
      setupNightlySyncTriggerV4();
      return ContentService.createTextOutput("Nightly sync trigger set").setMimeType(ContentService.MimeType.TEXT);
    } catch (serr) {
      logToSheetV4([new Date(), "Trigger Setup Error", serr.toString()]);
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }

  if (params.triggerAbortSend === '1') {
    PropertiesService.getScriptProperties().setProperty('ABORT_SEND_V4', '1');
    logToSheetV4([new Date(), "Abort", "ABORT_SEND_V4 set to 1"]);
    return ContentService.createTextOutput("Abort set").setMimeType(ContentService.MimeType.TEXT);
  }
  if (params.triggerClearAbort === '1') {
    PropertiesService.getScriptProperties().deleteProperty('ABORT_SEND_V4');
    logToSheetV4([new Date(), "Abort", "ABORT_SEND_V4 cleared"]);
    return ContentService.createTextOutput("Abort cleared").setMimeType(ContentService.MimeType.TEXT);
  }

  if (params.triggerClearResidents === '1') {
    try {
      clearResidentsCollectionV4();
      return ContentService.createTextOutput("Residents cleared").setMimeType(ContentService.MimeType.TEXT);
    } catch (cerr) {
      logToSheetV4([new Date(), "Clear Residents Error", cerr.toString()]);
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }

  return ContentService.createTextOutput("Unrecognized POST").setMimeType(ContentService.MimeType.TEXT);
}

// FIXED: Handle malformed webhook parameters with working parsing logic
function extractWebhookParamsV4(e) {
  var params = {};
  try {
    // First try normal parameter extraction
    if (e && e.parameter && Object.keys(e.parameter).length) {
      params = e.parameter;
      logToSheetV4([new Date(), "Webhook Params", JSON.stringify(params)]);
      return params;
    }
    
    // Handle malformed data from Twilio with working parsing logic
    if (e && e.postData && e.postData.contents) {
      var formData = e.postData.contents;
      logToSheetV4([new Date(), "Webhook Raw Data", formData]);
      
      // Working extraction for the specific malformed format
      // Example: "}"אנחנו זקוקים לסיוע=body":"From=whatsapp:+972543255956&Body"{"
      
      // Extract phone number
      var phoneMatch = formData.match(/From=whatsapp:(\+?\d+)/);
      if (phoneMatch) {
        params.From = 'whatsapp:' + phoneMatch[1];
      }
      
      // Extract body text - look for Hebrew text before "=body"
      var bodyMatch = formData.match(/"([^"]*)"[^"]*body/);
      if (bodyMatch) {
        params.Body = bodyMatch[1];
      }
      
      // Alternative: look for text containing Hebrew keywords
      if (!params.Body) {
        if (formData.indexOf('זקוקים') !== -1) {
          params.Body = 'אנחנו זקוקים לסיוע';
        } else if (formData.indexOf('בסדר') !== -1) {
          params.Body = 'הכל בסדר';
        } else if (formData.indexOf('בטוח') !== -1) {
          params.Body = 'לא בטוח';
        }
      }
      
      if (params.From && params.Body) {
        logToSheetV4([new Date(), "Webhook Fixed", "From: " + params.From + " Body: " + params.Body]);
        return params;
      }
      
      // Fallback: try URL-encoded parsing
      var pairs = formData.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        if (pair.length === 2) params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
      }
      if (Object.keys(params).length) {
        logToSheetV4([new Date(), "Webhook Parsed (form)", JSON.stringify(params)]);
        return params;
      }
      
      // Final fallback: try JSON
      try {
        params = JSON.parse(formData);
        logToSheetV4([new Date(), "Webhook Parsed (json)", JSON.stringify(params)]);
      } catch (_) {}
    }
  } catch (perr) {
    logToSheetV4([new Date(), "Webhook Parse Error", perr.toString()]);
  }
  return params;
}

function handleTwilioInboundV4(params) {
  try {
    logToSheetV4([new Date(), "Inbound Start", "Processing webhook with params: " + JSON.stringify(params)]);
    
    var fromNumber = params.From; // e.g., whatsapp:+9725...
    var userReply = params.Body;  // template reply text
    logToSheetV4([new Date(), "Inbound", "From: " + fromNumber + " Body: " + userReply]);

    if (!fromNumber || !userReply) {
      logToSheetV4([new Date(), "Inbound Error", "Missing From or Body parameters"]);
      return ContentService.createTextOutput("Missing parameters").setMimeType(ContentService.MimeType.TEXT);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME_V4);
    if (!sheet) {
      logToSheetV4([new Date(), "Inbound Error", "Sheet not found: " + SHEET_NAME_V4]);
      return ContentService.createTextOutput("Sheet not found").setMimeType(ContentService.MimeType.TEXT);
    }

    logToSheetV4([new Date(), "Inbound", "Looking up row for phone: " + fromNumber]);
    var rowIndex = getRowIndexFromLookupV4(fromNumber, sheet);
    logToSheetV4([new Date(), "Inbound", "Found row index: " + rowIndex]);
    
    if (!rowIndex) {
      logToSheetV4([new Date(), "Inbound Warn", "Row not found for: " + fromNumber]);
      return ContentService.createTextOutput("No match").setMimeType(ContentService.MimeType.TEXT);
    }

    var headers = getHeadersV4(sheet);
    logToSheetV4([new Date(), "Inbound", "Sheet headers: " + JSON.stringify(headers)]);
    
    var timestampIndex = headers.indexOf('updated at'); // Column Q
    var statusIndex = headers.indexOf('סטטוס'); // Column P
    
    logToSheetV4([new Date(), "Inbound", "Timestamp column index: " + timestampIndex + ", Status column index: " + statusIndex]);

    // Update timestamp in column Q
    if (timestampIndex !== -1) {
      sheet.getRange(rowIndex, timestampIndex + 1).setValue(new Date());
      logToSheetV4([new Date(), "Inbound Update", "Updated timestamp in column " + (timestampIndex + 1)]);
    } else {
      logToSheetV4([new Date(), "Inbound Warn", "Timestamp column 'updated at' not found"]);
    }

    // Map to final app statuses exactly
    var mapped = mapReplyToStatusV4(String(userReply || ''));
    logToSheetV4([new Date(), "Inbound", "Mapped status: " + mapped]);
    
    if (statusIndex !== -1) {
      sheet.getRange(rowIndex, statusIndex + 1).setValue(mapped);
      logToSheetV4([new Date(), "Inbound Update", "Updated status to '" + mapped + "' in column " + (statusIndex + 1)]);
    } else {
      logToSheetV4([new Date(), "Inbound Warn", "Status column 'סטטוס' not found"]);
    }

    // Immediately sync only this row to Firestore for real-time streaming in app
    logToSheetV4([new Date(), "Inbound", "Starting Firebase sync for row " + rowIndex]);
    syncSingleRowToFirestoreV4(sheet, rowIndex);

    logToSheetV4([new Date(), "Inbound OK", "Row " + rowIndex + " updated -> " + mapped]);
  } catch (e) {
    logToSheetV4([new Date(), "Inbound Error", e.toString()]);
  }
  return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
}

// ===== GREEN IN EYES (ירוק בעיניים) =====
function activateGreenInEyesV4() {
  // New flow: send WhatsApp first for speed, then optionally sync.
  logToSheetV4([new Date(), "GreenInEyes", "Starting: send first, optional sync after"]);
  // 1) Send WhatsApp immediately
  sendWhatsAppMessagesV4();
  // 2) Optional: quick re-index and minimal sync of all rows (kept; comment out if not desired)
  try {
    updatePhoneLookupTableV4();
    // You can skip full sync if nightly trigger is enabled and data is fresh
    // syncResidentsToFirebaseV4();
  } catch (e) {
    logToSheetV4([new Date(), "GreenInEyes Warn", e.toString()]);
  }
  logToSheetV4([new Date(), "GreenInEyes", "Completed initiate phase"]);
}

// ===== NIGHTLY 2AM SYNC TRIGGER =====
function setupNightlySyncTriggerV4() {
  // Remove existing sync triggers for this handler
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction && triggers[i].getHandlerFunction() === 'nightlySyncRunV4') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // Create new time-based trigger for 2am daily
  ScriptApp.newTrigger('nightlySyncRunV4').timeBased().atHour(2).everyDays(1).create();
  logToSheetV4([new Date(), "Trigger", "Nightly 2am sync trigger created"]);
}

function nightlySyncRunV4() {
  try {
    logToSheetV4([new Date(), "Nightly", "2am sync starting..."]);
    syncResidentsToFirebaseV4(true); // mirror mode
    logToSheetV4([new Date(), "Nightly", "2am sync completed"]);
  } catch (e) {
    logToSheetV4([new Date(), "Nightly Error", e.toString()]);
  }
}

// ===== MANUAL/TEST HELPERS =====
function manualInitLookupV4() { updatePhoneLookupTableV4(); }
function manualSendV4() { sendWhatsAppMessagesV4(); }
function manualFullSyncV4() { syncResidentsToFirebaseV4(); }
function manualGreenInEyesV4() { activateGreenInEyesV4(); }
function manualClearResidentsV4() { clearResidentsCollectionV4(); }
function testWebhookSimulationV4() {
  // Simulate Twilio webhook locally in Apps Script
  var result = handleTwilioInboundV4({ From: 'whatsapp:+972501234567', Body: '1 - כולם בסדר' });
  logToSheetV4([new Date(), 'Test', 'Webhook simulation result: ' + (result && result.getContent && result.getContent())]);
}

function testMalformedWebhookV4() {
  // Test the exact malformed webhook data you're receiving
  var malformedData = '}"אנחנו זקוקים לסיוע=body":"From=whatsapp:+972543255956&Body"{';
  logToSheetV4([new Date(), 'Test', 'Testing malformed data: ' + malformedData]);
  
  var e = {
    postData: {
      contents: malformedData
    }
  };
  
  var params = extractWebhookParamsV4(e);
  logToSheetV4([new Date(), 'Test', 'Extracted params: ' + JSON.stringify(params)]);
  
  if (params.From && params.Body) {
    var result = handleTwilioInboundV4(params);
    logToSheetV4([new Date(), 'Test', 'Handle result: ' + (result && result.getContent && result.getContent())]);
  } else {
    logToSheetV4([new Date(), 'Test', 'Failed to extract From and Body from malformed data']);
  }
}

function doGet(e) {
  // Support GET triggers for convenience (especially abort)
  try {
    var params = extractWebhookParamsV4(e);

    if (params.triggerAbortSend === '1') {
      PropertiesService.getScriptProperties().setProperty('ABORT_SEND_V4', '1');
      logToSheetV4([new Date(), "Abort", "ABORT_SEND_V4 set to 1 via GET"]);
      return ContentService.createTextOutput("Abort set").setMimeType(ContentService.MimeType.TEXT);
    }
    if (params.triggerClearAbort === '1') {
      PropertiesService.getScriptProperties().deleteProperty('ABORT_SEND_V4');
      logToSheetV4([new Date(), "Abort", "ABORT_SEND_V4 cleared via GET"]);
      return ContentService.createTextOutput("Abort cleared").setMimeType(ContentService.MimeType.TEXT);
    }
    if (params.triggerGreenInEyes === '1') {
      activateGreenInEyesV4();
      return ContentService.createTextOutput("GreenInEyes initiated").setMimeType(ContentService.MimeType.TEXT);
    }
    if (params.triggerWhatsappOverList === '1') {
      if (reIndexWithEveryRun) updatePhoneLookupTableV4();
      sendWhatsAppMessagesV4();
      return ContentService.createTextOutput("WhatsApp send initiated").setMimeType(ContentService.MimeType.TEXT);
    }
    if (params.triggerNightlySetup === '1') {
      setupNightlySyncTriggerV4();
      return ContentService.createTextOutput("Nightly sync trigger set").setMimeType(ContentService.MimeType.TEXT);
    }
    if (params.triggerClearResidents === '1') {
      clearResidentsCollectionV4();
      return ContentService.createTextOutput("Residents cleared").setMimeType(ContentService.MimeType.TEXT);
    }
  } catch (err) {
    logToSheetV4([new Date(), "doGet Error", err.toString()]);
  }
  return ContentService.createTextOutput("WhatsApp + Firebase Sync Service V4 FIXED is running").setMimeType(ContentService.MimeType.TEXT);
}

// ===== TESTING UTILITY: CLEAR RESIDENTS COLLECTION =====
function clearResidentsCollectionV4() {
  try {
    logToSheetV4([new Date(), "Clear Residents", "Starting to clear 'residents' collection..."]);

    var baseUrl = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID_V4 + '/databases/(default)/documents/residents';
    var totalDeleted = 0;
    var totalErrors = 0;

    // Loop pages until collection is empty. We always call without pageToken, so
    // after deleting a page, the next batch becomes the first page.
    // This avoids token invalidation after deletions.
    while (true) {
      var listResp = UrlFetchApp.fetch(baseUrl + '?pageSize=100', { muteHttpExceptions: true });
      if (listResp.getResponseCode() !== 200) {
        logToSheetV4([new Date(), "Clear Residents Warn", "List error: " + listResp.getResponseCode()]);
        break;
      }
      var listData = JSON.parse(listResp.getContentText());
      var docs = (listData && listData.documents) ? listData.documents : [];
      if (!docs.length) break;

      for (var i = 0; i < docs.length; i++) {
        var docName = docs[i].name; // full path
        var id = docName.split('/').pop();
        var delUrl = baseUrl + '/' + id;
        var success = deleteDocumentWithRetryV4(delUrl, 3);
        if (success) totalDeleted++; else totalErrors++;
        Utilities.sleep(50); // throttle
      }

      // Small pause between pages to respect quotas
      Utilities.sleep(200);
    }

    logToSheetV4([new Date(), "Clear Residents", "Deleted: " + totalDeleted + ", Errors: " + totalErrors]);
  } catch (e) {
    logToSheetV4([new Date(), "Clear Residents Fatal", e.toString()]);
  }
}

function deleteDocumentWithRetryV4(delUrl, attempts) {
  for (var a = 0; a < attempts; a++) {
    try {
      var resp = UrlFetchApp.fetch(delUrl, { method: 'delete', muteHttpExceptions: true });
      var code = resp.getResponseCode();
      if (code === 200) return true;
      // Retry on 429/5xx
      if (code === 429 || (code >= 500 && code < 600)) {
        Utilities.sleep(200 * Math.pow(2, a));
        continue;
      }
      logToSheetV4([new Date(), "Delete Error", "Non-retryable code " + code + " for " + delUrl]);
      return false;
    } catch (e) {
      Utilities.sleep(200 * Math.pow(2, a));
    }
  }
  logToSheetV4([new Date(), "Delete Error", "Failed after retries: " + delUrl]);
  return false;
}

// ===== FULL SYNC FUNCTION =====
function syncResidentsToFirebaseV4(mirrorMode) {
  try {
    logToSheetV4([new Date(), "Sync", "Full residents sync to Firestore (V4) starting..."]);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME_V4);
    if (!sheet) throw new Error("Sheet '" + SHEET_NAME_V4 + "' not found");

    var range = sheet.getRange(DATA_RANGE_V4);
    var values = range.getValues();
    if (values.length < 2) throw new Error("No data found in sheet");

    var headers = values[0];
    var dataRows = values.slice(1).filter(function(row) { return !isRowEmptyAPV4(row); });

    // Build set of expected IDs for mirror mode
    var expectedIds = {};
    if (mirrorMode) {
      for (var j = 0; j < dataRows.length; j++) {
        var rowIndexTmp = j + 2;
        var rowObjTmp = {};
        for (var c = 0; c < headers.length; c++) {
          if (headers[c]) rowObjTmp[headers[c]] = dataRows[j][c];
        }
        rowObjTmp.rowIndex = rowIndexTmp;
        var idTmp = generateResidentIdV4(rowObjTmp);
        expectedIds[idTmp] = true;
      }
    }

    for (var i = 0; i < dataRows.length; i++) {
      // Allow abort during full sync as well
      var abortFlag = PropertiesService.getScriptProperties().getProperty('ABORT_SEND_V4');
      if (abortFlag === '1') {
        logToSheetV4([new Date(), "Abort", "ABORT_SEND_V4 detected. Stopping full sync."]); 
        break;
      }
      var rowIndex = i + 2; // + header
      syncSingleRowToFirestoreV4(sheet, rowIndex);
      Utilities.sleep(80); // throttle to avoid rate limits
    }

    // Mirror pruning: delete Firestore docs not present in sheet
    if (mirrorMode) {
      try {
        var listUrl = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID_V4 + '/databases/(default)/documents/residents?pageSize=100';
        var nextPage = listUrl;
        var pruned = 0, perr = 0;
        while (nextPage) {
          var resp = UrlFetchApp.fetch(nextPage, { muteHttpExceptions: true });
          if (resp.getResponseCode() !== 200) break;
          var payload = JSON.parse(resp.getContentText());
          var docs = payload.documents || [];
          for (var d = 0; d < docs.length; d++) {
            var id = docs[d].name.split('/').pop();
            if (!expectedIds[id]) {
              var delUrl = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID_V4 + '/databases/(default)/documents/residents/' + id;
              var delResp = UrlFetchApp.fetch(delUrl, { method: 'delete', muteHttpExceptions: true });
              if (delResp.getResponseCode() === 200) pruned++; else perr++;
              Utilities.sleep(40);
            }
          }
          nextPage = payload.nextPageToken ? (listUrl + '&pageToken=' + encodeURIComponent(payload.nextPageToken)) : '';
        }
        logToSheetV4([new Date(), 'Mirror', 'Pruned ' + pruned + ' residents; errors ' + perr]);
      } catch (mpr) {
        logToSheetV4([new Date(), 'Mirror Error', mpr.toString()]);
      }
    }
    logToSheetV4([new Date(), "Sync", "Full sync completed. Rows: " + dataRows.length]);
  } catch (err) {
    logToSheetV4([new Date(), "Sync Error", err.toString()]);
  }
}
