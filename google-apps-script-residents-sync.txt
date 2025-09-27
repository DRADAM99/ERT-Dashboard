/**
 * Google Apps Script to sync residents data from Google Sheets to Firebase via webhook
 * 
 * This script should be deployed as a web app and can be triggered:
 * 1. Manually from the Apps Script editor
 * 2. On a time-based trigger (e.g., every hour)
 * 3. On form submission if you have a Google Form connected
 * 4. On edit of the spreadsheet
 */

// Configuration - Update these values
const SHEET_ID = "1raVDAVFs8UzEEWQE7N0uVLUft3lM9Xq9VFS_FXxWuok"; // Your Google Sheet ID
const SHEET_NAME = "גליון1"; // Your sheet name
const WEBHOOK_URL = "https://your-domain.com/api/sync-residents"; // Update with your actual domain
const API_KEY = "AIzaSyBR53KDvquviY4yq4bqsmHrw8LoH86-wZs"; // Your Google Sheets API key

/**
 * Main function to sync residents data
 */
function syncResidentsToFirebase() {
  try {
    console.log("Starting residents sync...");
    
    // Get the spreadsheet and sheet
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      throw new Error(`Sheet "${SHEET_NAME}" not found`);
    }
    
    // Get all data from the sheet
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      console.log("No data found in sheet");
      return;
    }
    
    // Get headers (first row)
    const headers = data[0];
    console.log("Headers:", headers);
    
    // Validate required headers
    const requiredHeaders = ['timestamp', 'סטטוס', 'שם משפחה', 'שם פרטי', 'טלפון', 'שכונה', 'בית', 'הערות', 'event_id'];
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
    }
    
    // Convert data rows to objects
    const residents = data.slice(1).map((row, index) => {
      const resident = {};
      headers.forEach((header, colIndex) => {
        if (header && row[colIndex] !== undefined) {
          // Handle timestamp conversion
          if (header === 'timestamp') {
            const timestampValue = row[colIndex];
            if (timestampValue instanceof Date) {
              resident[header] = timestampValue.toISOString();
            } else if (typeof timestampValue === 'string') {
              // Try to parse as date
              const date = new Date(timestampValue);
              if (!isNaN(date.getTime())) {
                resident[header] = date.toISOString();
              } else {
                resident[header] = timestampValue; // Keep as string if can't parse
              }
            } else {
              resident[header] = new Date().toISOString(); // Default to current time
            }
          } else {
            resident[header] = row[colIndex];
          }
        }
      });
      return resident;
    }).filter(resident => {
      // Filter out empty rows
      return Object.values(resident).some(value => value !== "" && value !== null);
    });
    
    console.log(`Found ${residents.length} residents to sync`);
    
    if (residents.length === 0) {
      console.log("No valid residents found");
      return;
    }
    
    // Validate each resident has required fields
    for (let i = 0; i < residents.length; i++) {
      const resident = residents[i];
      const missingFields = requiredHeaders.filter(field => !resident[field]);
      
      if (missingFields.length > 0) {
        throw new Error(`Resident ${i + 1} missing required fields: ${missingFields.join(', ')}`);
      }
    }
    
    // Send data to webhook
    const response = sendToWebhook(residents);
    
    if (response.success) {
      console.log(`Successfully synced ${residents.length} residents`);
      
      // Optional: Add a timestamp to the sheet to track last sync
      const lastRow = sheet.getLastRow();
      const timestampCol = headers.indexOf("Last Synced") + 1;
      if (timestampCol > 0) {
        sheet.getRange(lastRow + 1, timestampCol).setValue(new Date());
      }
    } else {
      throw new Error(`Webhook failed: ${response.error}`);
    }
    
  } catch (error) {
    console.error("Error syncing residents:", error);
    throw error;
  }
}

/**
 * Send data to the webhook endpoint
 */
function sendToWebhook(residents) {
  const payload = {
    residents: residents
  };
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log(`Webhook response: ${responseCode} - ${responseText}`);
    
    if (responseCode >= 200 && responseCode < 300) {
      return JSON.parse(responseText);
    } else {
      throw new Error(`HTTP ${responseCode}: ${responseText}`);
    }
  } catch (error) {
    console.error("Error sending to webhook:", error);
    throw error;
  }
}

/**
 * Test function to check webhook connectivity
 */
function testWebhook() {
  try {
    const testResidents = [
      {
        "timestamp": new Date().toISOString(),
        "סטטוס": "כולם בסדר",
        "שם משפחה": "כהן",
        "שם פרטי": "יוסי",
        "טלפון": "050-1234567",
        "שכונה": "הרצליה",
        "בית": "123",
        "הערות": "תושב חדש, צריכים לעקוב אחרי המצב",
        "event_id": "EVT-001"
      }
    ];
    
    const response = sendToWebhook(testResidents);
    console.log("Webhook test successful:", response);
  } catch (error) {
    console.error("Webhook test failed:", error);
  }
}

/**
 * Set up automatic triggers
 */
function setupTriggers() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncResidentsToFirebase') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new trigger to run every hour
  ScriptApp.newTrigger('syncResidentsToFirebase')
    .timeBased()
    .everyHours(1)
    .create();
  
  console.log("Triggers set up successfully");
}

/**
 * Manual trigger function for testing
 */
function manualSync() {
  syncResidentsToFirebase();
}

/**
 * Get current residents count from webhook
 */
function getCurrentResidentsCount() {
  try {
    const response = UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'GET',
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode >= 200 && responseCode < 300) {
      const data = JSON.parse(responseText);
      console.log(`Current residents in Firebase: ${data.count}`);
      return data.count;
    } else {
      console.error(`Failed to get count: ${responseCode} - ${responseText}`);
      return null;
    }
  } catch (error) {
    console.error("Error getting residents count:", error);
    return null;
  }
} 