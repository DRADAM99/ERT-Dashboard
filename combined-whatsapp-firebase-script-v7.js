/** @OnlyCurrentDoc */
// ============================================================================
// Combined Google Apps Script v7.0 — Firebase-Centered Architecture
// ============================================================================
//
// ARCHITECTURE CHANGE from v4/v5:
//   - Firebase Cloud Functions now handle ALL Twilio traffic (send + receive)
//   - This script's role: trigger Firebase, provide Sheet utilities, manual ops
//   - Dual mode support: חי (Live) / תרגיל (Drill)
//   - No direct Twilio API calls from this script
//   - Fresh data pulled from Google Sheet at trigger time (no nightly sync)
//
// FLOW:
//   1. Dashboard (or this script) writes to Firestore "emergencyEvents" collection
//   2. Cloud Function "triggerGreenEyes" fires on document create
//   3. Cloud Function reads residents from the appropriate Google Sheet
//   4. Cloud Function sends WhatsApp messages via Twilio (mode-specific template)
//   5. Twilio inbound replies go to Cloud Function "handleTwilioWebhook"
//   6. Cloud Function updates Firestore + writes status back to Google Sheet
//
// SETUP REQUIREMENTS:
//   - Script Properties must contain:
//       LIVE_SHEET_ID        — Google Sheet ID for real residents
//       DRILL_SHEET_ID       — Google Sheet ID for drill residents
//       LIVE_CONTENT_SID     — Twilio template SID for live emergencies
//       DRILL_CONTENT_SID    — Twilio template SID for drill exercises
//   - Firebase Cloud Functions must be deployed (see functions/index.js)
//   - Firebase service account must have edit access to both Google Sheets
// ============================================================================

// ===== CONFIGURATION =====

var FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
var FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1/projects/" +
    FIREBASE_PROJECT_ID + "/databases/(default)/documents";

var DEFAULT_SHEET_NAME = "2025";
var DEFAULT_DATA_RANGE = "A1:Q";

var debugMode = true;

var PHONE_COLUMNS = [
  "טלפון", "phone", "Phone", "מספר טלפון",
  "טלפון נייד", "מס טלפון", "טלפון סלולרי"
];
var STATUS_COLUMN = "סטטוס";
var TIMESTAMP_COLUMN = "updated at";

// Status values matching the dashboard exactly
var STATUS = {
  ALL_GOOD:       "כולם בסדר",
  HELP_NEEDED:    "זקוקים לסיוע",
  UNSURE:         "לא בטוח",
  REPLY_RECEIVED: "תגובה התקבלה",
  MESSAGE_SENT:   "הודעה נשלחה"
};

// ===== MODE HELPERS =====

/**
 * Returns the configuration for the given mode.
 * Reads sheet IDs and content SIDs from Script Properties.
 * @param {string} mode - "live" or "drill"
 * @returns {Object} { sheetId, sheetName, dataRange, contentSid, label }
 */
function getModeConfig(mode) {
  var props = PropertiesService.getScriptProperties();
  if (mode === "drill") {
    return {
      sheetId:    props.getProperty("DRILL_SHEET_ID") || "",
      sheetName:  props.getProperty("DRILL_SHEET_NAME") || DEFAULT_SHEET_NAME,
      dataRange:  DEFAULT_DATA_RANGE,
      contentSid: props.getProperty("DRILL_CONTENT_SID") || "",
      label:      "תרגיל"
    };
  }
  // Default: live
  return {
    sheetId:    props.getProperty("LIVE_SHEET_ID") || "",
    sheetName:  props.getProperty("LIVE_SHEET_NAME") || DEFAULT_SHEET_NAME,
    dataRange:  DEFAULT_DATA_RANGE,
    contentSid: props.getProperty("LIVE_CONTENT_SID") || "",
    label:      "חי"
  };
}

/**
 * Validates that the mode configuration has all required fields.
 * @param {Object} config - from getModeConfig()
 * @param {string} mode - "live" or "drill"
 * @returns {string|null} Error message or null if valid
 */
function validateModeConfig(config, mode) {
  if (!config.sheetId) return "Missing " + mode.toUpperCase() + "_SHEET_ID in Script Properties";
  if (!config.contentSid) return "Missing " + mode.toUpperCase() + "_CONTENT_SID in Script Properties";
  return null;
}

// ===== LOGGING =====

function logToSheet(rowData) {
  if (!debugMode) return;
  try {
    if (!rowData || !Array.isArray(rowData) || rowData.length === 0) return;
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName("Script Logs V7");
    if (!logSheet) {
      logSheet = ss.insertSheet("Script Logs V7");
      logSheet.appendRow(["Timestamp", "Type", "Details", "Mode"]);
    }
    logSheet.appendRow(rowData);
  } catch (e) {
    Logger.log("Log error: " + e.toString());
  }
}

// ===== PHONE NORMALIZATION =====

/**
 * Normalizes an Israeli phone number to 972XXXXXXXXX format.
 * @param {string|number} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  if (!phone) return "";
  var n = phone.toString().replace(/\D/g, "");
  // Strip whatsapp prefix if present
  n = n.replace(/^whatsapp/, "");
  if (n.startsWith("0")) {
    n = "972" + n.substring(1);
  }
  if (n.length === 9 && !n.startsWith("972")) {
    n = "972" + n;
  }
  return n;
}

// ===== FIRESTORE REST HELPERS =====

/**
 * Converts a JS object to Firestore REST API field format.
 */
function toFirestoreFields(data) {
  var fields = {};
  Object.keys(data).forEach(function(key) {
    var val = data[key];
    if (val === null || val === undefined) return;
    if (Object.prototype.toString.call(val) === "[object Date]") {
      fields[key] = { timestampValue: val.toISOString() };
    } else if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "number") {
      fields[key] = { integerValue: String(Math.floor(val)) };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else {
      fields[key] = { stringValue: String(val) };
    }
  });
  return fields;
}

/**
 * Writes (PATCH) a document to Firestore via REST API.
 * @param {string} collectionPath - e.g. "emergencyEvents"
 * @param {string} docId
 * @param {Object} data - plain JS object
 * @returns {number} HTTP status code
 */
function writeFirestoreDoc(collectionPath, docId, data) {
  var url = FIRESTORE_BASE_URL + "/" + collectionPath + "/" + docId;
  var payload = { fields: toFirestoreFields(data) };
  var options = {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var resp = UrlFetchApp.fetch(url, options);
  return resp.getResponseCode();
}

/**
 * Reads a Firestore document via REST API.
 * @param {string} docPath - e.g. "system/activeEmergency"
 * @returns {Object|null} Parsed fields or null
 */
function readFirestoreDoc(docPath) {
  var url = FIRESTORE_BASE_URL + "/" + docPath;
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var json = JSON.parse(resp.getContentText());
    return json.fields || null;
  } catch (e) {
    return null;
  }
}

// ===== CORE: GREEN EYES ACTIVATION =====

/**
 * Activates the Green Eyes emergency procedure.
 * Writes an emergencyEvents document to Firestore, which triggers the
 * Cloud Function to read residents, send WhatsApp, and manage the flow.
 *
 * @param {string} mode - "live" or "drill"
 * @param {string} [triggeredBy] - Who triggered (email/alias)
 * @returns {Object} { success, eventId, message }
 */
function activateGreenEyes(mode, triggeredBy) {
  mode = mode || "live";
  triggeredBy = triggeredBy || "AppsScript";

  logToSheet([new Date(), "GreenEyes", "Activating in mode: " + mode, mode]);

  // Validate config
  var config = getModeConfig(mode);
  var configError = validateModeConfig(config, mode);
  if (configError) {
    logToSheet([new Date(), "GreenEyes Error", configError, mode]);
    return { success: false, eventId: null, message: configError };
  }

  // Generate unique event ID
  var eventId = "ge_" + mode + "_" + new Date().getTime();

  // Write the emergency event to Firestore — this triggers the Cloud Function
  var eventData = {
    type: "green_eyes",
    mode: mode,
    triggeredBy: triggeredBy,
    triggeredAt: new Date(),
    status: "pending",
    sheetId: config.sheetId,
    sheetName: config.sheetName,
    contentSid: config.contentSid,
    modeLabel: config.label
  };

  var statusCode = writeFirestoreDoc("emergencyEvents", eventId, eventData);

  if (statusCode === 200) {
    logToSheet([new Date(), "GreenEyes OK", "Event created: " + eventId, mode]);

    // Also update system/activeEmergency for quick lookups by the Twilio webhook
    writeFirestoreDoc("system", "activeEmergency", {
      mode: mode,
      eventId: eventId,
      sheetId: config.sheetId,
      sheetName: config.sheetName,
      contentSid: config.contentSid,
      activatedAt: new Date(),
      activatedBy: triggeredBy
    });

    return { success: true, eventId: eventId, message: "Event created, Cloud Function will process" };
  } else {
    var errMsg = "Firestore write failed with status " + statusCode;
    logToSheet([new Date(), "GreenEyes Error", errMsg, mode]);
    return { success: false, eventId: null, message: errMsg };
  }
}

// ===== WEBHOOK ENTRY POINTS =====

/**
 * Handles incoming POST requests from the dashboard or external callers.
 * Supported parameters:
 *   triggerGreenInEyes=1  — Activate Green Eyes (default: live)
 *   mode=live|drill       — Override mode
 *   triggeredBy=<name>    — Who triggered
 *   checkStatus=1         — Return current status
 *   clearEmergency=1      — Clear active emergency
 *   testConfig=1          — Validate configuration
 */
function doPost(e) {
  logToSheet([new Date(), "Webhook", "POST received v7.0", ""]);

  var params = {};
  try {
    if (e && e.parameter && Object.keys(e.parameter).length) {
      params = e.parameter;
    } else if (e && e.postData && e.postData.contents) {
      var pairs = e.postData.contents.split("&");
      for (var i = 0; i < pairs.length; i++) {
        var kv = pairs[i].split("=");
        if (kv.length === 2) {
          params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
        }
      }
    }
  } catch (parseErr) {
    logToSheet([new Date(), "Parse Error", parseErr.toString(), ""]);
  }

  // Route: Green Eyes activation
  if (params.triggerGreenInEyes === "1") {
    var mode = params.mode || "live";
    var triggeredBy = params.triggeredBy || "Dashboard";
    var result = activateGreenEyes(mode, triggeredBy);
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
  }

  // Route: Check status
  if (params.checkStatus === "1") {
    var status = readFirestoreDoc("system/activeEmergency");
    return ContentService.createTextOutput(JSON.stringify(status || { status: "none" }))
        .setMimeType(ContentService.MimeType.JSON);
  }

  // Route: Clear active emergency
  if (params.clearEmergency === "1") {
    writeFirestoreDoc("system", "activeEmergency", {
      mode: "none",
      clearedAt: new Date(),
      clearedBy: params.triggeredBy || "AppsScript"
    });
    logToSheet([new Date(), "Clear", "Active emergency cleared", ""]);
    return ContentService.createTextOutput("Emergency cleared")
        .setMimeType(ContentService.MimeType.TEXT);
  }

  // Route: Test configuration
  if (params.testConfig === "1") {
    var testResult = testConfiguration();
    return ContentService.createTextOutput(JSON.stringify(testResult))
        .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput("v7.0 — Unrecognized POST")
      .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles incoming GET requests. Same routing as POST for convenience.
 */
function doGet(e) {
  logToSheet([new Date(), "Webhook", "GET received v7.0", ""]);

  var params = (e && e.parameter) ? e.parameter : {};

  if (params.triggerGreenInEyes === "1") {
    var mode = params.mode || "live";
    var triggeredBy = params.triggeredBy || "Manual";
    var result = activateGreenEyes(mode, triggeredBy);
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
  }

  if (params.checkStatus === "1") {
    var status = readFirestoreDoc("system/activeEmergency");
    return ContentService.createTextOutput(JSON.stringify(status || { status: "none" }))
        .setMimeType(ContentService.MimeType.JSON);
  }

  if (params.testConfig === "1") {
    var testResult = testConfiguration();
    return ContentService.createTextOutput(JSON.stringify(testResult))
        .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(
    "WhatsApp + Firebase v7.0 — Firebase-Centered Architecture\n" +
    "Modes: חי (Live) / תרגיל (Drill)\n" +
    "Use triggerGreenInEyes=1&mode=live or mode=drill"
  ).setMimeType(ContentService.MimeType.TEXT);
}

// ===== MANUAL UTILITY FUNCTIONS =====

/** Manual trigger: Live mode */
function manualTriggerLive() {
  var result = activateGreenEyes("live", "Manual (Apps Script)");
  logToSheet([new Date(), "Manual", JSON.stringify(result), "live"]);
  Logger.log(JSON.stringify(result));
}

/** Manual trigger: Drill mode */
function manualTriggerDrill() {
  var result = activateGreenEyes("drill", "Manual (Apps Script)");
  logToSheet([new Date(), "Manual", JSON.stringify(result), "drill"]);
  Logger.log(JSON.stringify(result));
}

/** Check current emergency status */
function checkStatus() {
  var status = readFirestoreDoc("system/activeEmergency");
  Logger.log("Active emergency: " + JSON.stringify(status));
  logToSheet([new Date(), "Status Check", JSON.stringify(status), ""]);
  return status;
}

/** Clear active emergency */
function clearActiveEmergency() {
  writeFirestoreDoc("system", "activeEmergency", {
    mode: "none",
    clearedAt: new Date(),
    clearedBy: "Manual (Apps Script)"
  });
  logToSheet([new Date(), "Clear", "Active emergency cleared manually", ""]);
  Logger.log("Active emergency cleared");
}

/**
 * Validates that all required configuration is in place.
 * Run this before first use to check everything is set up.
 */
function testConfiguration() {
  var props = PropertiesService.getScriptProperties();
  var results = {
    timestamp: new Date().toISOString(),
    version: "7.0",
    checks: []
  };

  // Check Script Properties
  var requiredProps = [
    "LIVE_SHEET_ID", "LIVE_CONTENT_SID",
    "DRILL_SHEET_ID", "DRILL_CONTENT_SID"
  ];
  for (var i = 0; i < requiredProps.length; i++) {
    var val = props.getProperty(requiredProps[i]);
    results.checks.push({
      name: requiredProps[i],
      status: val ? "OK" : "MISSING",
      value: val ? "(set)" : "(empty)"
    });
  }

  // Check live sheet access
  var liveConfig = getModeConfig("live");
  if (liveConfig.sheetId) {
    try {
      var liveSheet = SpreadsheetApp.openById(liveConfig.sheetId);
      var tab = liveSheet.getSheetByName(liveConfig.sheetName);
      results.checks.push({
        name: "Live Sheet Access",
        status: tab ? "OK" : "SHEET_TAB_NOT_FOUND",
        value: tab ? "Tab '" + liveConfig.sheetName + "' found" : "Tab '" + liveConfig.sheetName + "' not found"
      });
    } catch (e) {
      results.checks.push({ name: "Live Sheet Access", status: "ERROR", value: e.toString() });
    }
  }

  // Check drill sheet access
  var drillConfig = getModeConfig("drill");
  if (drillConfig.sheetId) {
    try {
      var drillSheet = SpreadsheetApp.openById(drillConfig.sheetId);
      var dtab = drillSheet.getSheetByName(drillConfig.sheetName);
      results.checks.push({
        name: "Drill Sheet Access",
        status: dtab ? "OK" : "SHEET_TAB_NOT_FOUND",
        value: dtab ? "Tab '" + drillConfig.sheetName + "' found" : "Tab '" + drillConfig.sheetName + "' not found"
      });
    } catch (e) {
      results.checks.push({ name: "Drill Sheet Access", status: "ERROR", value: e.toString() });
    }
  }

  // Check Firestore connectivity
  try {
    var fsResp = UrlFetchApp.fetch(FIRESTORE_BASE_URL + "/system/activeEmergency", { muteHttpExceptions: true });
    results.checks.push({
      name: "Firestore Access",
      status: fsResp.getResponseCode() === 200 || fsResp.getResponseCode() === 404 ? "OK" : "ERROR",
      value: "HTTP " + fsResp.getResponseCode()
    });
  } catch (e) {
    results.checks.push({ name: "Firestore Access", status: "ERROR", value: e.toString() });
  }

  logToSheet([new Date(), "Config Test", JSON.stringify(results), ""]);
  Logger.log(JSON.stringify(results, null, 2));
  return results;
}

// ===== SHEET READING UTILITIES =====
// These can be called by the Cloud Function via Apps Script Execution API,
// or used locally for manual inspection.

/**
 * Reads residents from the appropriate Google Sheet based on mode.
 * @param {string} mode - "live" or "drill"
 * @returns {Array<Object>} Array of resident objects
 */
function getResidentsFromSheet(mode) {
  var config = getModeConfig(mode);
  if (!config.sheetId) throw new Error("No sheet ID configured for mode: " + mode);

  var ss = SpreadsheetApp.openById(config.sheetId);
  var sheet = ss.getSheetByName(config.sheetName);
  if (!sheet) throw new Error("Sheet tab '" + config.sheetName + "' not found in " + mode + " sheet");

  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];

  var headers = data[0];
  var phoneIndex = findColumnIndex(headers, PHONE_COLUMNS);
  var statusIndex = headers.indexOf(STATUS_COLUMN);

  var residents = [];
  var consecutiveEmpty = 0;

  for (var i = 1; i < data.length; i++) {
    if (isRowEmpty(data[i])) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 5) break;
      continue;
    }
    consecutiveEmpty = 0;

    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = data[i][c];
    }
    obj.rowIndex = i + 1;
    obj.normalizedPhone = phoneIndex !== -1 ? normalizePhone(data[i][phoneIndex]) : "";

    residents.push(obj);
  }

  logToSheet([new Date(), "Sheet Read", "Found " + residents.length + " residents", mode]);
  return residents;
}

function findColumnIndex(headers, names) {
  for (var i = 0; i < names.length; i++) {
    var idx = headers.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function isRowEmpty(row) {
  for (var c = 0; c < Math.min(row.length, 16); c++) {
    var v = row[c];
    if (v !== null && v !== undefined && String(v).trim() !== "") return false;
  }
  return true;
}

// ===== FIRESTORE SYNC UTILITIES =====
// Kept for manual operations and fallback scenarios.

/**
 * Generates a deterministic resident ID based on phone number.
 */
function generateResidentId(rowObj) {
  var phone = rowObj["טלפון"] || rowObj["טלפון נייד"] || rowObj["מספר טלפון"] ||
              rowObj["מס טלפון"] || rowObj["טלפון סלולרי"];
  if (phone) return "resident_" + phone.toString().replace(/\D/g, "");
  if (rowObj["שם פרטי"] && rowObj["שם משפחה"]) {
    return "resident_" + (rowObj["שם פרטי"] + "_" + rowObj["שם משפחה"]).replace(/[^\u0590-\u05FFa-zA-Z0-9_]+/g, "_");
  }
  if (rowObj.rowIndex) return "resident_row_" + rowObj.rowIndex;
  return "resident_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Manually syncs residents from the given mode's sheet to Firestore.
 * This is a FALLBACK — normally the Cloud Function handles this.
 * @param {string} mode - "live" or "drill"
 */
function manualSyncResidentsToFirestore(mode) {
  mode = mode || "live";
  logToSheet([new Date(), "Manual Sync", "Starting manual sync to Firestore", mode]);

  var residents = getResidentsFromSheet(mode);
  var synced = 0;
  var errors = 0;

  for (var i = 0; i < residents.length; i++) {
    var resident = residents[i];
    resident.syncedAt = new Date();
    resident.source = "google_sheets_manual";
    resident.mode = mode;

    var docId = generateResidentId(resident);
    var code = writeFirestoreDoc("residents", docId, resident);
    if (code === 200) {
      synced++;
    } else {
      errors++;
      logToSheet([new Date(), "Sync Error", "Row " + resident.rowIndex + " failed: HTTP " + code, mode]);
    }

    if (i % 10 === 0 && i > 0) Utilities.sleep(100);
  }

  logToSheet([new Date(), "Manual Sync Done", "Synced: " + synced + ", Errors: " + errors, mode]);
  Logger.log("Manual sync complete. Synced: " + synced + ", Errors: " + errors);
}

function manualSyncLive() { manualSyncResidentsToFirestore("live"); }
function manualSyncDrill() { manualSyncResidentsToFirestore("drill"); }
