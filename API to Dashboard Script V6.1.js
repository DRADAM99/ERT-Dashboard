/** @OnlyCurrentDoc */
// Clean WhatsApp Messaging + Firebase Sync - V6.1

const CONFIG = {
  DEBUG_MODE: true,
  SHEET_NAME: "גיליון1",
  DATA_RANGE: "A1:Q50",
  PHONE_LOOKUP_KEY: "PHONE_NUMBER_ROW_LOOKUP_V4",
  FIREBASE_PROJECT_ID: "emergency-dashboard-a3842",
  WEBHOOK_SYNC_URL: "",
  RE_INDEX_ON_RUN: true,
  STATUS_MAPPINGS: {
    HELP_NEEDED: "זקוקים לסיוע",
    ALL_GOOD: "כולם בסדר",
    UNSURE: "לא בטוח",
    REPLY_RECEIVED: "תגובה התקבלה",
    MESSAGE_SENT: "הודעה נשלחה",
  },
  PHONE_COLUMNS: ["טלפון", "phone", "Phone", "מספר טלפון", "טלפון נייד", "מס טלפון", "טלפון סלולרי"],
  STATUS_COLUMN: "סטטוס",
  TIMESTAMP_COLUMN: "updated at",
  INVALID_PHONE_PLACEHOLDERS: ["אין לי טלפון", "אין טלפון", "ללא טלפון", "לא ידוע", "unknown", "n/a", "na", "-"],
};

class Logger {
  static log(type, message, data = null) {
    if (!CONFIG.DEBUG_MODE) return;
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let logSheet = ss.getSheetByName("Script Logs");
      if (!logSheet) {
        logSheet = ss.insertSheet("Script Logs");
        logSheet.appendRow(["Timestamp", "Type", "Message", "Data"]);
      }
      logSheet.appendRow([new Date(), type, message, data ? JSON.stringify(data) : ""]);
    } catch (error) {
      console.error("LogError:", error);
    }
  }
}

class PhoneHelper {
  static isPlaceholder(phoneNumber) {
    if (phoneNumber === null || phoneNumber === undefined) return true;
    const raw = String(phoneNumber).trim().toLowerCase();
    if (!raw) return true;
    return CONFIG.INVALID_PHONE_PLACEHOLDERS.some((v) => raw === v.toLowerCase());
  }

  static normalize(phoneNumber) {
    if (this.isPlaceholder(phoneNumber)) return "";
    let normalized = String(phoneNumber).replace(/\D/g, "");
    if (!normalized) return "";
    if (normalized.startsWith("0")) normalized = normalized.substring(1);
    if (normalized.length === 9 && !normalized.startsWith("972")) normalized = "972" + normalized;
    return normalized;
  }

  static isValidIsraeliMobile(normalized) {
    return /^9725\d{8}$/.test(normalized);
  }

  static isSendablePhone(phoneNumber) {
    const normalized = this.normalize(phoneNumber);
    return !!normalized && this.isValidIsraeliMobile(normalized);
  }

  static findPhoneColumnIndex(headers) {
    return headers.findIndex((header) => CONFIG.PHONE_COLUMNS.includes(header));
  }
}

class StatusMapper {
  static mapReplyToStatus(reply) {
    if (!reply) return CONFIG.STATUS_MAPPINGS.REPLY_RECEIVED;
    const text = reply.toString().toLowerCase();
    if (/(4|זקוקים|סיוע|help)/i.test(text)) return CONFIG.STATUS_MAPPINGS.HELP_NEEDED;
    if (/(1|בסדר|הכל בסדר|כולם בסדר|ok|okay|fine|טוב)/i.test(text)) return CONFIG.STATUS_MAPPINGS.ALL_GOOD;
    if (/(2|לא בטוח|לא יודע|unsure|unknown|don't know)/i.test(text)) return CONFIG.STATUS_MAPPINGS.UNSURE;
    return CONFIG.STATUS_MAPPINGS.REPLY_RECEIVED;
  }
}

class SheetManager {
  constructor() {
    this.sheet = this.getSheet();
    this.headers = this.getHeaders();
    this.phoneIndex = PhoneHelper.findPhoneColumnIndex(this.headers);
    this.statusIndex = this.findHeaderIndex(["סטטוס", "status"]);
    this.timestampIndex = this.findHeaderIndex(["updated at", "Updated at", "updated_at", "timestamp"]);
  }

  getSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error(`Sheet '${CONFIG.SHEET_NAME}' not found`);
    return sheet;
  }

  getHeaders() {
    const data = this.sheet.getDataRange().getValues();
    return data && data.length ? data[0] : [];
  }

  findHeaderIndex(candidates) {
    const normalizedHeaders = this.headers.map((h) => String(h || "").trim().toLowerCase());
    for (const c of candidates) {
      const idx = normalizedHeaders.indexOf(String(c).trim().toLowerCase());
      if (idx !== -1) return idx;
    }
    return -1;
  }

  updateStatus(rowIndex, status) {
    if (this.statusIndex === -1) return false;
    this.sheet.getRange(rowIndex, this.statusIndex + 1).setValue(status);
    return true;
  }

  updateTimestamp(rowIndex) {
    if (this.timestampIndex === -1) return false;
    this.sheet.getRange(rowIndex, this.timestampIndex + 1).setValue(new Date());
    return true;
  }

  isRowEmpty(row) {
    for (let c = 0; c < 16; c++) {
      const value = row[c];
      if (value !== null && value !== undefined && String(value).trim() !== "") return false;
    }
    return true;
  }

  buildRowObject(rowIndex) {
    const range = this.sheet.getRange(CONFIG.DATA_RANGE);
    const values = range.getValues();
    const row = values[rowIndex - 1];
    const obj = {};
    for (let i = 0; i < this.headers.length; i++) {
      if (this.headers[i]) obj[this.headers[i]] = row[i];
    }
    obj.syncedAt = new Date();
    obj.source = "google_sheets";
    obj.rowIndex = rowIndex;
    return obj;
  }
}

class PhoneLookupManager {
  static update() {
    Logger.log("LookupUpdate", "Building phone lookup table...");
    const sheetManager = new SheetManager();
    const data = sheetManager.sheet.getDataRange().getValues();
    if (!data || data.length < 2) {
      Logger.log("LookupUpdate", "No data rows found");
      return;
    }
    if (sheetManager.phoneIndex === -1) throw new Error("Phone number column not found");

    const phoneLookup = {};
    for (let i = 1; i < data.length; i++) {
      const phoneNumber = data[i][sheetManager.phoneIndex];
      if (!PhoneHelper.isSendablePhone(phoneNumber)) continue;
      const normalized = PhoneHelper.normalize(phoneNumber);
      phoneLookup[normalized] = i + 1;
    }

    PropertiesService.getScriptProperties().setProperty(CONFIG.PHONE_LOOKUP_KEY, JSON.stringify(phoneLookup));
    Logger.log("LookupUpdate", `Created ${Object.keys(phoneLookup).length} lookup entries`);
  }

  static findRowIndex(fromNumber) {
    let phoneLookupString = PropertiesService.getScriptProperties().getProperty(CONFIG.PHONE_LOOKUP_KEY);
    if (!phoneLookupString) {
      this.update();
      phoneLookupString = PropertiesService.getScriptProperties().getProperty(CONFIG.PHONE_LOOKUP_KEY);
    }

    let phoneLookup = {};
    try {
      phoneLookup = JSON.parse(phoneLookupString || "{}");
    } catch (error) {
      Logger.log("LookupError", "JSON parse failed", error.toString());
      return null;
    }

    const normalized = PhoneHelper.normalize(fromNumber);
    if (!normalized) return null;
    return phoneLookup[normalized] || null;
  }
}

class FirebaseManager {
  static convertToFirestoreFields(data) {
    const fields = {};
    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (value === null || value === undefined) return;
      if (value instanceof Date) fields[key] = { timestampValue: value.toISOString() };
      else if (typeof value === "string") fields[key] = { stringValue: value };
      else if (typeof value === "number") fields[key] = { integerValue: String(Math.floor(value)) };
      else if (typeof value === "boolean") fields[key] = { booleanValue: value };
      else fields[key] = { stringValue: String(value) };
    });
    return fields;
  }

  static generateResidentId(rowObj) {
    for (const field of CONFIG.PHONE_COLUMNS) {
      if (rowObj[field] && PhoneHelper.isSendablePhone(rowObj[field])) {
        return "resident_" + PhoneHelper.normalize(rowObj[field]);
      }
    }
    if (rowObj["שם פרטי"] && rowObj["שם משפחה"]) {
      return "resident_" + (rowObj["שם פרטי"] + "_" + rowObj["שם משפחה"]).replace(/[^\p{L}\p{N}_]+/gu, "_");
    }
    return rowObj.rowIndex ? `resident_row_${rowObj.rowIndex}` : `resident_${Math.random().toString(36).substr(2, 9)}`;
  }

  static syncRowToFirestore(sheetManager, rowIndex, additionalData = {}) {
    try {
      const rowObj = sheetManager.buildRowObject(rowIndex);
      Object.assign(rowObj, additionalData);

      // Keep both keys so Dashboard readers using either key stay in sync
      if (!rowObj.status && rowObj["סטטוס"]) rowObj.status = rowObj["סטטוס"];
      if (!rowObj["סטטוס"] && rowObj.status) rowObj["סטטוס"] = rowObj.status;

      const residentId = this.generateResidentId(rowObj);
      const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${residentId}`;
      const fields = this.convertToFirestoreFields(rowObj);
      const payload = { fields };
      const accessToken = ScriptApp.getOAuthToken();

      const options = {
        method: "patch",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + accessToken },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      };

      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      if (statusCode >= 200 && statusCode < 300) Logger.log("FirestoreSync", `Row ${rowIndex} synced successfully`, residentId);
      else Logger.log("FirestoreError", `Row ${rowIndex} sync failed: ${statusCode}`, response.getContentText());
    } catch (error) {
      Logger.log("FirestoreError", "Sync failed", error.toString());
    }
  }
}

class TwilioManager {
  static getTwilioCredentials() {
    const properties = PropertiesService.getScriptProperties();
    const credentials = {
      accountSid: properties.getProperty("ACCOUNT_SID"),
      authToken: properties.getProperty("AUTH_TOKEN"),
      messagingServiceSid: properties.getProperty("MESSAGING_SERVICE_SID"),
      contentSid: properties.getProperty("CONTENT_SID"),
    };
    if (!credentials.accountSid || !credentials.authToken || !credentials.messagingServiceSid || !credentials.contentSid) {
      throw new Error("Missing Twilio credentials in Script Properties");
    }
    return credentials;
  }

  static formatPhoneNumber(phoneNumber) {
    const formatted = PhoneHelper.normalize(phoneNumber);
    if (!PhoneHelper.isValidIsraeliMobile(formatted)) throw new Error(`Invalid or unsupported phone number: ${phoneNumber}`);
    return formatted;
  }

  static sendWhatsAppMessages() {
    Logger.log("WhatsAppSend", "Starting WhatsApp message send");
    const credentials = this.getTwilioCredentials();
    const sheetManager = new SheetManager();
    if (CONFIG.RE_INDEX_ON_RUN) PhoneLookupManager.update();

    const data = sheetManager.sheet.getDataRange().getValues();
    let processed = 0;
    let consecutiveEmpty = 0;

    for (let i = 1; i < data.length; i++) {
      if (this.shouldAbort()) {
        Logger.log("WhatsAppAbort", "Abort flag detected, stopping send");
        break;
      }

      const row = data[i];
      if (sheetManager.isRowEmpty(row)) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 5) {
          Logger.log("WhatsAppStop", "Too many consecutive empty rows, stopping");
          this.setAbortFlag();
          break;
        }
        continue;
      }

      const rowIndex = i + 1;
      const phoneNumber = row[sheetManager.phoneIndex];
      if (!phoneNumber || String(phoneNumber).trim() === "") {
        consecutiveEmpty++;
        continue;
      }
      if (!PhoneHelper.isSendablePhone(phoneNumber)) {
        Logger.log("WhatsAppSkip", `Skipping row ${rowIndex}: invalid/non-sendable phone`, String(phoneNumber));
        continue;
      }

      consecutiveEmpty = 0;
      try {
        const formatted = this.formatPhoneNumber(phoneNumber);
        const success = this.sendSingleMessage(credentials, formatted);

        const statusForSheet = success ? CONFIG.STATUS_MAPPINGS.MESSAGE_SENT : "שגיאת שליחה";
        sheetManager.updateStatus(rowIndex, statusForSheet);
        sheetManager.updateTimestamp(rowIndex);

        // Sync after sheet updates so dashboard gets latest status/timestamp
        const postSendData = {
          currentStatus: statusForSheet,
          status: statusForSheet,
          "סטטוס": statusForSheet,
          messageSentAt: new Date(),
          messageSentSuccess: success,
        };
        FirebaseManager.syncRowToFirestore(sheetManager, rowIndex, postSendData);

        if (success) {
          processed++;
          Logger.log("StatusUpdate", `Updated row ${rowIndex} status to MESSAGE_SENT`);
        } else {
          Logger.log("SendFailed", `Message send failed for row ${rowIndex}`);
        }
      } catch (error) {
        Logger.log("WhatsAppError", `Failed to send to row ${rowIndex}`, error.toString());
        sheetManager.updateStatus(rowIndex, `Error: ${error.toString()}`);
        sheetManager.updateTimestamp(rowIndex);

        const errorData = {
          currentStatus: `Error: ${error.toString()}`,
          messageSentAt: new Date(),
          messageSentSuccess: false,
          messageSentError: error.toString(),
        };
        FirebaseManager.syncRowToFirestore(sheetManager, rowIndex, errorData);
      }

      if ((i % 10) === 0 && rowIndex < data.length) Utilities.sleep(800);
    }

    Logger.log("WhatsAppComplete", `Sent ${processed} messages`);
  }

  static sendSingleMessage(credentials, phoneNumber) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`;
    const payload = {
      To: `whatsapp:+${phoneNumber}`,
      MessagingServiceSid: credentials.messagingServiceSid,
      ContentSid: credentials.contentSid,
    };
    const options = {
      method: "post",
      payload: payload,
      headers: { Authorization: "Basic " + Utilities.base64Encode(credentials.accountSid + ":" + credentials.authToken) },
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    Logger.log("TwilioResponse", `Phone ${phoneNumber}: Status ${statusCode}`);
    if (statusCode !== 201 && statusCode !== 200) Logger.log("TwilioError", `Error response: ${responseText}`);
    return statusCode >= 200 && statusCode < 300;
  }

  static shouldAbort() {
    return PropertiesService.getScriptProperties().getProperty("ABORT_SEND_V4") === "1";
  }
  static setAbortFlag() {
    PropertiesService.getScriptProperties().setProperty("ABORT_SEND_V4", "1");
  }
  static clearAbortFlag() {
    PropertiesService.getScriptProperties().deleteProperty("ABORT_SEND_V4");
  }
}

class WebhookHandler {
  static extractParams(e) {
    try {
      if (e && e.parameter && Object.keys(e.parameter).length) {
        Logger.log("WebhookParams", "Standard params", e.parameter);
        if (e.parameter.body && !e.parameter.From && !e.parameter.Body) {
          Logger.log("WebhookRawData", "Parsing body field", e.parameter.body);
          return this.parseFormData(e.parameter.body);
        }
        return e.parameter;
      }
      if (e && e.postData && e.postData.contents) return this.parseMalformedData(e.postData.contents);
    } catch (error) {
      Logger.log("WebhookParseError", "Failed to parse webhook", error.toString());
    }
    return {};
  }

  static parseFormData(formData) {
    const params = {};
    try {
      const pairs = formData.split("&");
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split("=");
        if (key && valueParts.length > 0) params[key] = decodeURIComponent(valueParts.join("="));
      }
      Logger.log("WebhookParsed", "Form data parsed", params);
    } catch (error) {
      Logger.log("WebhookParseError", "Failed to parse form data", error.toString());
    }
    return params;
  }

  static parseMalformedData(formData) {
    Logger.log("WebhookRawData", formData.substring(0, 200));
    const params = {};
    const phoneMatch = formData.match(/From=whatsapp:(\+?\d+)/);
    if (phoneMatch) params.From = "whatsapp:" + phoneMatch[1];

    const bodyMatch = formData.match(/"([^"]*)"[^"]*body/);
    if (bodyMatch) params.Body = bodyMatch[1];
    else {
      if (formData.includes("זקוקים")) params.Body = "אנחנו זקוקים לסיוע";
      else if (formData.includes("בסדר")) params.Body = "הכל בסדר";
      else if (formData.includes("בטוח")) params.Body = "לא בטוח";
    }

    if (!params.Body) {
      const buttonMatch = formData.match(/ButtonPayload=([^&]+)/);
      if (buttonMatch) params.Body = this.mapButtonPayload(buttonMatch[1]);
    }

    Logger.log("WebhookParsed", "Extracted params", params);
    return params;
  }

  static mapButtonPayload(payload) {
    const mapping = {
      button_1: "אנחנו זקוקים לסיוע",
      help_needed: "אנחנו זקוקים לסיוע",
      "זקוקים לסיוע": "אנחנו זקוקים לסיוע",
      button_2: "הכל בסדר",
      all_good: "הכל בסדר",
      "כולם בסדר": "הכל בסדר",
      button_3: "לא בטוח",
      unsure: "לא בטוח",
      "לא בטוח": "לא בטוח",
    };
    return mapping[payload] || payload;
  }

  static handleInboundMessage(params) {
    try {
      Logger.log("InboundStart", "Processing inbound message", params);
      if (!params.From || !params.Body) return ContentService.createTextOutput("Missing parameters").setMimeType(ContentService.MimeType.TEXT);

      const sheetManager = new SheetManager();
      const rowIndex = PhoneLookupManager.findRowIndex(params.From);
      if (!rowIndex) {
        Logger.log("InboundWarn", `No row found for phone: ${params.From}`);
        return ContentService.createTextOutput("No match").setMimeType(ContentService.MimeType.TEXT);
      }

      sheetManager.updateTimestamp(rowIndex);
      const mappedStatus = StatusMapper.mapReplyToStatus(params.Body);
      sheetManager.updateStatus(rowIndex, mappedStatus);

      const replyData = {
        lastReplyAt: new Date(),
        lastReplyMessage: params.Body,
        currentStatus: mappedStatus,
        status: mappedStatus,
        "סטטוס": mappedStatus,
        replyReceived: true,
      };
      FirebaseManager.syncRowToFirestore(sheetManager, rowIndex, replyData);
      Logger.log("InboundSuccess", `Updated row ${rowIndex} with status: ${mappedStatus}`);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
      Logger.log("InboundError", "Processing failed", error.toString());
      return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
    }
  }
}

function doPost(e) {
  Logger.log("WebhookPost", "POST request received");
  const params = WebhookHandler.extractParams(e);
  if (params.From && params.Body) return WebhookHandler.handleInboundMessage(params);

  if (params.triggerGreenInEyes === "1") {
    try {
      activateGreenInEyes();
      return ContentService.createTextOutput("GreenInEyes initiated").setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
      Logger.log("GreenInEyesError", "Activation failed", error.toString());
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }

  if (params.triggerAbortSend === "1") {
    TwilioManager.setAbortFlag();
    return ContentService.createTextOutput("Abort set").setMimeType(ContentService.MimeType.TEXT);
  }
  if (params.triggerClearAbort === "1") {
    TwilioManager.clearAbortFlag();
    return ContentService.createTextOutput("Abort cleared").setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput("Unrecognized POST").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  const params = WebhookHandler.extractParams(e);
  if (params.triggerGreenInEyes === "1") {
    activateGreenInEyes();
    return ContentService.createTextOutput("GreenInEyes initiated").setMimeType(ContentService.MimeType.TEXT);
  }
  if (params.triggerWhatsappOverList === "1") {
    TwilioManager.sendWhatsAppMessages();
    return ContentService.createTextOutput("WhatsApp send initiated").setMimeType(ContentService.MimeType.TEXT);
  }
  if (params.triggerAbortSend === "1") {
    TwilioManager.setAbortFlag();
    return ContentService.createTextOutput("Abort set").setMimeType(ContentService.MimeType.TEXT);
  }
  if (params.triggerClearAbort === "1") {
    TwilioManager.clearAbortFlag();
    return ContentService.createTextOutput("Abort cleared").setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput("WhatsApp + Firebase Sync Service V6.1 is running").setMimeType(ContentService.MimeType.TEXT);
}

function activateGreenInEyes() {
  Logger.log("GreenInEyes", "Starting GreenInEyes flow");
  TwilioManager.sendWhatsAppMessages();
  Logger.log("GreenInEyes", "Completed");
}

function manualSendMessages() {
  TwilioManager.sendWhatsAppMessages();
}
function manualUpdateLookup() {
  PhoneLookupManager.update();
}
function manualTestWebhook() {
  const testData = '}"אנחנו זקוקים לסיוע=body":"From=whatsapp:+972543255956&Body"{';
  const e = { postData: { contents: testData } };
  const params = WebhookHandler.extractParams(e);
  Logger.log("TestWebhook", "Extracted params", params);
  if (params.From && params.Body) WebhookHandler.handleInboundMessage(params);
}
function manualClearAbort() {
  TwilioManager.clearAbortFlag();
}
function manualSetAbort() {
  TwilioManager.setAbortFlag();
}
