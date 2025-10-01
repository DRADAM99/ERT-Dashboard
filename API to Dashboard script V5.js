/** @OnlyCurrentDoc */
// Clean WhatsApp Messaging + Firebase Sync
// Simplified and organized version

// ===== CONFIGURATION =====
const CONFIG = {
  DEBUG_MODE: true,
  SHEET_NAME: "2025",
  DATA_RANGE: "A1:Q10",
  PHONE_LOOKUP_KEY: 'PHONE_NUMBER_ROW_LOOKUP_V4',
  FIREBASE_PROJECT_ID: "emergency-dashboard-a3842",
  WEBHOOK_SYNC_URL: "",
  RE_INDEX_ON_RUN: true,
  
  // Status mappings
  STATUS_MAPPINGS: {
    HELP_NEEDED: 'זקוקים לסיוע',
    ALL_GOOD: 'כולם בסדר', 
    UNSURE: 'לא בטוח',
    REPLY_RECEIVED: 'תגובה התקבלה',
    MESSAGE_SENT: 'הודעה נשלחה'
  },
  
  // Column names to search for
  PHONE_COLUMNS: ['טלפון', 'phone', 'Phone', 'מספר טלפון', 'טלפון נייד', 'מס טלפון', 'טלפון סלולרי'],
  STATUS_COLUMN: 'סטטוס',
  TIMESTAMP_COLUMN: 'updated at'
};

// ===== UTILITIES =====
class Logger {
  /**
   * Logs messages to the Script Logs sheet for debugging
   * @param {string} type - Type of log entry
   * @param {string} message - Log message
   * @param {*} data - Optional data to include
   */
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
      Logger.log("LogError", "Failed to write log", error.toString());
    }
  }
}

class PhoneHelper {
  /**
   * Normalizes phone numbers to standard format (972XXXXXXXXX)
   * @param {string|number} phoneNumber - Raw phone number
   * @returns {string} Normalized phone number
   */
  static normalize(phoneNumber) {
    if (!phoneNumber) return '';
    
    let normalized = phoneNumber.toString().replace(/\D/g, '');
    
    // Remove leading zero
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1);
    }
    
    // Add country code if missing
    if (normalized.length === 9 && !normalized.startsWith('972')) {
      normalized = '972' + normalized;
    }
    
    // Clean WhatsApp prefix
    if (normalized.includes('whatsapp')) {
      normalized = normalized.replace('whatsapp', '').replace(/^\+/, '');
    }
    
    return normalized;
  }
  
  /**
   * Finds the index of the phone column in sheet headers
   * @param {Array} headers - Sheet header row
   * @returns {number} Index of phone column or -1 if not found
   */
  static findPhoneColumnIndex(headers) {
    return headers.findIndex(header => CONFIG.PHONE_COLUMNS.includes(header));
  }
}

class StatusMapper {
  /**
   * Maps user reply text to appropriate status
   * @param {string} reply - User's reply message
   * @returns {string} Mapped status in Hebrew
   */
  static mapReplyToStatus(reply) {
    if (!reply) return CONFIG.STATUS_MAPPINGS.REPLY_RECEIVED;
    
    const text = reply.toString().toLowerCase();
    
    // Priority: help > ok > unsure
    if (/(4|זקוקים|סיוע|help)/i.test(text)) return CONFIG.STATUS_MAPPINGS.HELP_NEEDED;
    if (/(1|בסדר|הכל בסדר|כולם בסדר|ok|okay|fine|טוב)/i.test(text)) return CONFIG.STATUS_MAPPINGS.ALL_GOOD;
    if (/(2|לא בטוח|לא יודע|unsure|unknown|don't know)/i.test(text)) return CONFIG.STATUS_MAPPINGS.UNSURE;
    
    return CONFIG.STATUS_MAPPINGS.REPLY_RECEIVED;
  }
}

// ===== SHEET OPERATIONS =====
class SheetManager {
  /**
   * Initializes sheet manager with cached sheet data and column indices
   */
  constructor() {
    this.sheet = this.getSheet();
    this.headers = this.getHeaders();
    this.phoneIndex = PhoneHelper.findPhoneColumnIndex(this.headers);
    this.statusIndex = this.headers.indexOf(CONFIG.STATUS_COLUMN);
    this.timestampIndex = this.headers.indexOf(CONFIG.TIMESTAMP_COLUMN);
  }
  
  /**
   * Gets the main data sheet from the active spreadsheet
   * @returns {Sheet} Google Sheets sheet object
   */
  getSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) throw new Error(`Sheet '${CONFIG.SHEET_NAME}' not found`);
    return sheet;
  }
  
  /**
   * Gets the header row from the sheet
   * @returns {Array} Array of header names
   */
  getHeaders() {
    const data = this.sheet.getDataRange().getValues();
    return data && data.length ? data[0] : [];
  }
  
  /**
   * Updates the status column for a specific row
   * @param {number} rowIndex - 1-based row number
   * @param {string} status - Status value to set
   * @returns {boolean} True if updated successfully
   */
  updateStatus(rowIndex, status) {
    if (this.statusIndex === -1) return false;
    this.sheet.getRange(rowIndex, this.statusIndex + 1).setValue(status);
    return true;
  }
  
  /**
   * Updates the timestamp column for a specific row
   * @param {number} rowIndex - 1-based row number
   * @returns {boolean} True if updated successfully
   */
  updateTimestamp(rowIndex) {
    if (this.timestampIndex === -1) return false;
    this.sheet.getRange(rowIndex, this.timestampIndex + 1).setValue(new Date());
    return true;
  }
  
  /**
   * Checks if a row is empty in columns A-P
   * @param {Array} row - Row data array
   * @returns {boolean} True if row is empty
   */
  isRowEmpty(row) {
    // Check columns A-P (0..15)
    for (let c = 0; c < 16; c++) {
      const value = row[c];
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Builds an object from a sheet row with headers as keys
   * @param {number} rowIndex - 1-based row number
   * @returns {Object} Row data as key-value object
   */
  buildRowObject(rowIndex) {
    const range = this.sheet.getRange(CONFIG.DATA_RANGE);
    const values = range.getValues();
    const row = values[rowIndex - 1]; // Convert to 0-based
    
    const obj = {};
    for (let i = 0; i < this.headers.length; i++) {
      if (this.headers[i]) obj[this.headers[i]] = row[i];
    }
    
    // Add metadata
    obj.syncedAt = new Date();
    obj.source = "google_sheets";
    obj.rowIndex = rowIndex;
    
    return obj;
  }
}

// ===== PHONE LOOKUP TABLE =====
class PhoneLookupManager {
  /**
   * Builds and caches phone number to row index lookup table
   */
  static update() {
    Logger.log("LookupUpdate", "Building phone lookup table...");
    
    const sheetManager = new SheetManager();
    const data = sheetManager.sheet.getDataRange().getValues();
    
    if (!data || data.length < 2) {
      Logger.log("LookupUpdate", "No data rows found");
      return;
    }
    
    if (sheetManager.phoneIndex === -1) {
      throw new Error("Phone number column not found");
    }
    
    const phoneLookup = {};
    for (let i = 1; i < data.length; i++) {
      const phoneNumber = data[i][sheetManager.phoneIndex];
      if (phoneNumber) {
        const normalized = PhoneHelper.normalize(phoneNumber);
        phoneLookup[normalized] = i + 1; // 1-based row index
      }
    }
    
    PropertiesService.getScriptProperties().setProperty(
      CONFIG.PHONE_LOOKUP_KEY,
      JSON.stringify(phoneLookup)
    );
    
    Logger.log("LookupUpdate", `Created ${Object.keys(phoneLookup).length} lookup entries`);
  }
  
  /**
   * Finds the sheet row index for a given phone number
   * @param {string} fromNumber - Phone number to lookup
   * @returns {number|null} 1-based row index or null if not found
   */
  static findRowIndex(fromNumber) {
    // Get cached lookup table
    let phoneLookupString = PropertiesService.getScriptProperties().getProperty(CONFIG.PHONE_LOOKUP_KEY);
    
    if (!phoneLookupString) {
      this.update();
      phoneLookupString = PropertiesService.getScriptProperties().getProperty(CONFIG.PHONE_LOOKUP_KEY);
    }
    
    let phoneLookup = {};
    try {
      phoneLookup = JSON.parse(phoneLookupString || '{}');
    } catch (error) {
      Logger.log("LookupError", "JSON parse failed", error.toString());
      return null;
    }
    
    const normalized = PhoneHelper.normalize(fromNumber);
    return phoneLookup[normalized] || null;
  }
}

// ===== FIREBASE/FIRESTORE OPERATIONS =====
class FirebaseManager {
  /**
   * Converts JavaScript object to Firestore field format
   * @param {Object} data - Data object to convert
   * @returns {Object} Firestore-formatted fields object
   */
  static convertToFirestoreFields(data) {
    const fields = {};
    
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (value === null || value === undefined) return;
      
      if (value instanceof Date) {
        fields[key] = { timestampValue: value.toISOString() };
      } else if (typeof value === 'string') {
        fields[key] = { stringValue: value };
      } else if (typeof value === 'number') {
        fields[key] = { integerValue: String(Math.floor(value)) };
      } else if (typeof value === 'boolean') {
        fields[key] = { booleanValue: value };
      } else {
        fields[key] = { stringValue: String(value) };
      }
    });
    
    return fields;
  }
  
  /**
   * Generates a unique resident ID from row data
   * @param {Object} rowObj - Row data object
   * @returns {string} Unique resident identifier
   */
  static generateResidentId(rowObj) {
    // Try phone first
    const phoneFields = CONFIG.PHONE_COLUMNS;
    for (const field of phoneFields) {
      if (rowObj[field]) {
        return 'resident_' + rowObj[field].toString().replace(/\D/g, '');
      }
    }
    
    // Try name combination
    if (rowObj['שם פרטי'] && rowObj['שם משפחה']) {
      return 'resident_' + (rowObj['שם פרטי'] + '_' + rowObj['שם משפחה']).replace(/[^\p{L}\p{N}_]+/gu, '_');
    }
    
    // Fallback to row index or random
    return rowObj.rowIndex ? `resident_row_${rowObj.rowIndex}` : `resident_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Syncs a single row to Firestore database
   * @param {SheetManager} sheetManager - Sheet manager instance
   * @param {number} rowIndex - 1-based row number to sync
   */
  static async syncRowToFirestore(sheetManager, rowIndex) {
    try {
      const rowObj = sheetManager.buildRowObject(rowIndex);
      const residentId = this.generateResidentId(rowObj);
      const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE_PROJECT_ID}/databases/(default)/documents/residents/${residentId}`;
      
      // Convert to Firestore format
      const fields = this.convertToFirestoreFields(rowObj);
      const payload = { fields };
      
      const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode === 200) {
        Logger.log("FirestoreSync", `Row ${rowIndex} synced successfully`, residentId);
      } else {
        Logger.log("FirestoreError", `Row ${rowIndex} sync failed: ${statusCode}`, response.getContentText());
      }
      
    } catch (error) {
      Logger.log("FirestoreError", "Sync failed", error.toString());
    }
  }
}

// ===== TWILIO/WHATSAPP OPERATIONS =====
class TwilioManager {
  /**
   * Retrieves Twilio credentials from Script Properties
   * @returns {Object} Twilio credentials object
   */
  static getTwilioCredentials() {
    const properties = PropertiesService.getScriptProperties();
    const credentials = {
      accountSid: properties.getProperty('ACCOUNT_SID'),
      authToken: properties.getProperty('AUTH_TOKEN'),
      messagingServiceSid: properties.getProperty('MESSAGING_SERVICE_SID'),
      contentSid: properties.getProperty('CONTENT_SID')
    };
    
    if (!credentials.accountSid || !credentials.authToken || !credentials.messagingServiceSid || !credentials.contentSid) {
      throw new Error("Missing Twilio credentials in Script Properties");
    }
    
    return credentials;
  }
  
  /**
   * Formats phone number for Twilio API (972XXXXXXXXX format)
   * @param {string|number} phoneNumber - Raw phone number
   * @returns {string} Formatted phone number
   */
  static formatPhoneNumber(phoneNumber) {
    let formatted = phoneNumber.toString().replace(/\D/g, '');
    
    if (formatted.startsWith('0')) {
      formatted = '972' + formatted.substring(1);
    } else if (!formatted.startsWith('972')) {
      formatted = '972' + formatted;
    }
    
    return formatted;
  }
  
  /**
   * Sends WhatsApp messages to all phone numbers in the sheet
   */
  static sendWhatsAppMessages() {
    Logger.log("WhatsAppSend", "Starting WhatsApp message send");
    
    const credentials = this.getTwilioCredentials();
    const sheetManager = new SheetManager();
    
    if (CONFIG.RE_INDEX_ON_RUN) {
      PhoneLookupManager.update();
    }
    
    const data = sheetManager.sheet.getDataRange().getValues();
    let processed = 0;
    let consecutiveEmpty = 0;
    
    for (let i = 1; i < data.length; i++) {
      // Check abort flag
      if (this.shouldAbort()) {
        Logger.log("WhatsAppAbort", "Abort flag detected, stopping send");
        break;
      }
      
      const row = data[i];
      
      // Skip empty rows
      if (sheetManager.isRowEmpty(row)) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 5) {
          Logger.log("WhatsAppStop", "Too many consecutive empty rows, stopping");
          this.setAbortFlag();
          break;
        }
        continue;
      }
      
      const phoneNumber = row[sheetManager.phoneIndex];
      if (!phoneNumber || String(phoneNumber).trim() === '') {
        consecutiveEmpty++;
        continue;
      }
      
      consecutiveEmpty = 0;
      
      // Send message
      try {
        const formatted = this.formatPhoneNumber(phoneNumber);
        const success = this.sendSingleMessage(credentials, formatted);
        
        if (success) {
          processed++;
          // Update status if not already a user reply
          const currentStatus = sheetManager.sheet.getRange(i + 1, sheetManager.statusIndex + 1).getValue();
          const userReplyStatuses = Object.values(CONFIG.STATUS_MAPPINGS);
          
          if (!currentStatus || !userReplyStatuses.includes(String(currentStatus))) {
            sheetManager.updateStatus(i + 1, CONFIG.STATUS_MAPPINGS.MESSAGE_SENT);
          }
        }
      } catch (error) {
        Logger.log("WhatsAppError", `Failed to send to row ${i + 1}`, error.toString());
        sheetManager.updateStatus(i + 1, `Error: ${error.toString()}`);
      }
      
      // Rate limiting
      if ((i % 10) === 0 && i + 1 < data.length) {
        Utilities.sleep(800);
      }
    }
    
    Logger.log("WhatsAppComplete", `Sent ${processed} messages`);
  }
  
  /**
   * Sends a single WhatsApp message via Twilio API
   * @param {Object} credentials - Twilio credentials
   * @param {string} phoneNumber - Formatted phone number
   * @returns {boolean} True if message sent successfully
   */
  static sendSingleMessage(credentials, phoneNumber) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${credentials.accountSid}/Messages.json`;
    
    const payload = {
      To: `whatsapp:+${phoneNumber}`,
      MessagingServiceSid: credentials.messagingServiceSid,
      ContentSid: credentials.contentSid
    };
    
    // Log the webhook request details
    Logger.log("TwilioRequest", `URL: ${url}`);
    Logger.log("TwilioRequest", `Payload:`, payload);
    Logger.log("TwilioRequest", `AccountSID: ${credentials.accountSid ? credentials.accountSid.substring(0, 10) + '...' : 'MISSING'}`);
    
    const options = {
      method: 'post',
      payload: payload,
      headers: { 
        'Authorization': 'Basic ' + Utilities.base64Encode(credentials.accountSid + ':' + credentials.authToken) 
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    // Log the response details
    Logger.log("TwilioResponse", `Phone ${phoneNumber}: Status ${statusCode}`);
    if (statusCode !== 201 && statusCode !== 200) {
      Logger.log("TwilioError", `Error response: ${responseText}`);
    }
    
    return statusCode >= 200 && statusCode < 300;
  }
  
  /**
   * Checks if abort flag is set to stop message sending
   * @returns {boolean} True if should abort
   */
  static shouldAbort() {
    return PropertiesService.getScriptProperties().getProperty('ABORT_SEND_V4') === '1';
  }
  
  /**
   * Sets the abort flag to stop message sending
   */
  static setAbortFlag() {
    PropertiesService.getScriptProperties().setProperty('ABORT_SEND_V4', '1');
  }
  
  /**
   * Clears the abort flag to allow message sending
   */
  static clearAbortFlag() {
    PropertiesService.getScriptProperties().deleteProperty('ABORT_SEND_V4');
  }
}

// ===== WEBHOOK HANDLING =====
class WebhookHandler {
  /**
   * Extracts parameters from webhook request (handles malformed data)
   * @param {Object} e - Webhook event object
   * @returns {Object} Extracted parameters
   */
  static extractParams(e) {
    try {
      // Try standard parameter extraction first
      if (e && e.parameter && Object.keys(e.parameter).length) {
        Logger.log("WebhookParams", "Standard params", e.parameter);
        
        // Check if parameters came in as a 'body' field containing form data
        if (e.parameter.body && !e.parameter.From && !e.parameter.Body) {
          Logger.log("WebhookRawData", "Parsing body field", e.parameter.body);
          return this.parseFormData(e.parameter.body);
        }
        
        return e.parameter;
      }
      
      // Handle malformed Twilio webhook data
      if (e && e.postData && e.postData.contents) {
        return this.parseMalformedData(e.postData.contents);
      }
      
    } catch (error) {
      Logger.log("WebhookParseError", "Failed to parse webhook", error.toString());
    }
    
    return {};
  }
  
  /**
   * Parses form data string into parameter object
   * @param {string} formData - Form data string like "From=whatsapp:+123&Body=hello"
   * @returns {Object} Parsed parameters
   */
  static parseFormData(formData) {
    const params = {};
    
    try {
      // Split by & and parse each key=value pair
      const pairs = formData.split('&');
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split('=');
        if (key && valueParts.length > 0) {
          const value = decodeURIComponent(valueParts.join('='));
          params[key] = value;
        }
      }
      
      Logger.log("WebhookParsed", "Form data parsed", params);
    } catch (error) {
      Logger.log("WebhookParseError", "Failed to parse form data", error.toString());
    }
    
    return params;
  }
  
  /**
   * Parses malformed webhook data from Twilio
   * @param {string} formData - Raw form data string
   * @returns {Object} Parsed parameters
   */
  static parseMalformedData(formData) {
    Logger.log("WebhookRawData", formData.substring(0, 200));
    
    const params = {};
    
    // Extract phone number
    const phoneMatch = formData.match(/From=whatsapp:(\+?\d+)/);
    if (phoneMatch) {
      params.From = 'whatsapp:' + phoneMatch[1];
    }
    
    // Extract message body
    const bodyMatch = formData.match(/"([^"]*)"[^"]*body/);
    if (bodyMatch) {
      params.Body = bodyMatch[1];
    } else {
      // Try keyword detection
      if (formData.includes('זקוקים')) params.Body = 'אנחנו זקוקים לסיוע';
      else if (formData.includes('בסדר')) params.Body = 'הכל בסדר';  
      else if (formData.includes('בטוח')) params.Body = 'לא בטוח';
    }
    
    // Handle button payloads
    if (!params.Body) {
      const buttonMatch = formData.match(/ButtonPayload=([^&]+)/);
      if (buttonMatch) {
        const payload = buttonMatch[1];
        params.Body = this.mapButtonPayload(payload);
      }
    }
    
    Logger.log("WebhookParsed", "Extracted params", params);
    return params;
  }
  
  /**
   * Maps button payloads to appropriate response messages
   * @param {string} payload - Button payload identifier
   * @returns {string} Mapped response message
   */
  static mapButtonPayload(payload) {
    const mapping = {
      'button_1': 'אנחנו זקוקים לסיוע',
      'help_needed': 'אנחנו זקוקים לסיוע',
      'זקוקים לסיוע': 'אנחנו זקוקים לסיוע',
      'button_2': 'הכל בסדר',
      'all_good': 'הכל בסדר',
      'כולם בסדר': 'הכל בסדר',
      'button_3': 'לא בטוח',
      'unsure': 'לא בטוח',
      'לא בטוח': 'לא בטוח'
    };
    
    return mapping[payload] || payload;
  }
  
  /**
   * Handles inbound WhatsApp messages and updates sheet
   * @param {Object} params - Extracted webhook parameters
   * @returns {ContentService.TextOutput} HTTP response
   */
  static handleInboundMessage(params) {
    try {
      Logger.log("InboundStart", "Processing inbound message", params);
      
      if (!params.From || !params.Body) {
        Logger.log("InboundError", "Missing From or Body parameters");
        return ContentService.createTextOutput("Missing parameters").setMimeType(ContentService.MimeType.TEXT);
      }
      
      const sheetManager = new SheetManager();
      const rowIndex = PhoneLookupManager.findRowIndex(params.From);
      
      if (!rowIndex) {
        Logger.log("InboundWarn", `No row found for phone: ${params.From}`);
        return ContentService.createTextOutput("No match").setMimeType(ContentService.MimeType.TEXT);
      }
      
      // Update timestamp and status
      sheetManager.updateTimestamp(rowIndex);
      
      const mappedStatus = StatusMapper.mapReplyToStatus(params.Body);
      sheetManager.updateStatus(rowIndex, mappedStatus);
      
      // Sync to Firestore
      FirebaseManager.syncRowToFirestore(sheetManager, rowIndex);
      
      Logger.log("InboundSuccess", `Updated row ${rowIndex} with status: ${mappedStatus}`);
      return ContentService.createTextOutput("OK").setMimeType(ContentService.MimeType.TEXT);
      
    } catch (error) {
      Logger.log("InboundError", "Processing failed", error.toString());
      return ContentService.createTextOutput("Error").setMimeType(ContentService.MimeType.TEXT);
    }
  }
}

// ===== MAIN WEBHOOK ENDPOINTS =====
/**
 * Handles POST requests to the webhook endpoint
 * @param {Object} e - HTTP request event object
 * @returns {ContentService.TextOutput} HTTP response
 */
function doPost(e) {
  Logger.log("WebhookPost", "POST request received");
  
  const params = WebhookHandler.extractParams(e);
  
  // Route based on parameters
  if (params.From && params.Body) {
    return WebhookHandler.handleInboundMessage(params);
  }
  
  if (params.triggerWhatsappOverList === '1') {
    try {
      TwilioManager.sendWhatsAppMessages();
      return ContentService.createTextOutput("WhatsApp send initiated").setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
      Logger.log("TriggerError", "WhatsApp send failed", error.toString());
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }
  
  if (params.triggerGreenInEyes === '1') {
    try {
      activateGreenInEyes();
      return ContentService.createTextOutput("GreenInEyes initiated").setMimeType(ContentService.MimeType.TEXT);
    } catch (error) {
      Logger.log("GreenInEyesError", "Activation failed", error.toString());
      return ContentService.createTextOutput("ERROR").setMimeType(ContentService.MimeType.TEXT);
    }
  }
  
  // Abort controls
  if (params.triggerAbortSend === '1') {
    TwilioManager.setAbortFlag();
    return ContentService.createTextOutput("Abort set").setMimeType(ContentService.MimeType.TEXT);
  }
  
  if (params.triggerClearAbort === '1') {
    TwilioManager.clearAbortFlag();
    return ContentService.createTextOutput("Abort cleared").setMimeType(ContentService.MimeType.TEXT);
  }
  
  return ContentService.createTextOutput("Unrecognized POST").setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Handles GET requests to the webhook endpoint
 * @param {Object} e - HTTP request event object
 * @returns {ContentService.TextOutput} HTTP response
 */
function doGet(e) {
  const params = WebhookHandler.extractParams(e);
  
  if (params.triggerGreenInEyes === '1') {
    activateGreenInEyes();
    return ContentService.createTextOutput("GreenInEyes initiated").setMimeType(ContentService.MimeType.TEXT);
  }
  
  if (params.triggerWhatsappOverList === '1') {
    TwilioManager.sendWhatsAppMessages();
    return ContentService.createTextOutput("WhatsApp send initiated").setMimeType(ContentService.MimeType.TEXT);
  }
  
  if (params.triggerAbortSend === '1') {
    TwilioManager.setAbortFlag();
    return ContentService.createTextOutput("Abort set").setMimeType(ContentService.MimeType.TEXT);
  }
  
  if (params.triggerClearAbort === '1') {
    TwilioManager.clearAbortFlag();
    return ContentService.createTextOutput("Abort cleared").setMimeType(ContentService.MimeType.TEXT);
  }
  
  return ContentService.createTextOutput("WhatsApp + Firebase Sync Service V4 is running").setMimeType(ContentService.MimeType.TEXT);
}

// ===== MAIN OPERATIONS =====
/**
 * Activates the GreenInEyes flow: send messages then update lookup
 */
function activateGreenInEyes() {
  Logger.log("GreenInEyes", "Starting GreenInEyes flow");
  TwilioManager.sendWhatsAppMessages();
  PhoneLookupManager.update();
  Logger.log("GreenInEyes", "Completed");
}

// ===== MANUAL FUNCTIONS FOR TESTING =====
/**
 * Manually triggers WhatsApp message sending
 */
function manualSendMessages() {
  TwilioManager.sendWhatsAppMessages();
}

/**
 * Manually updates the phone lookup table
 */
function manualUpdateLookup() {
  PhoneLookupManager.update();
}

/**
 * Tests webhook parsing with sample malformed data
 */
function manualTestWebhook() {
  const testData = '}"אנחנו זקוקים לסיוע=body":"From=whatsapp:+972543255956&Body"{';
  const e = { postData: { contents: testData } };
  const params = WebhookHandler.extractParams(e);
  
  Logger.log("TestWebhook", "Extracted params", params);
  
  if (params.From && params.Body) {
    WebhookHandler.handleInboundMessage(params);
  }
}

/**
 * Manually clears the abort flag to resume message sending
 */
function manualClearAbort() {
  TwilioManager.clearAbortFlag();
}

/**
 * Manually sets the abort flag to stop message sending
 */
function manualSetAbort() {
  TwilioManager.setAbortFlag();
}
