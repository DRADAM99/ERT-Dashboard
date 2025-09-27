// Test script to verify new fields are syncing correctly
// Run this in Google Apps Script to test your new fields

function testNewFieldsSync() {
  try {
    console.log("=== TESTING NEW FIELDS SYNC ===");
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("גליון1");
    
    if (!sheet) {
      console.log("❌ Sheet 'גליון1' not found!");
      return false;
    }
    
    const range = sheet.getRange("A1:Z500");
    const values = range.getValues();
    
    if (values.length < 2) {
      console.log("❌ No data found in sheet");
      return false;
    }
    
    const headers = values[0];
    const dataRows = values.slice(1).filter(row => row.some(cell => cell !== ""));
    
    console.log(`✅ Found ${dataRows.length} residents in sheet`);
    console.log("📋 All Headers:", headers);
    
    // Check for new fields
    const newFields = [
      'מספר בית',    // B1
      'הורה/ילד',    // N1
      'מסגרת',       // H1
      'מקום מסגרת',  // I1
      'תאריך לידה',  // F1
      'סטטוס מגורים' // M1
    ];
    
    console.log("🔍 Checking for new fields:");
    newFields.forEach(field => {
      const index = headers.indexOf(field);
      if (index !== -1) {
        console.log(`✅ Found: ${field} at column ${String.fromCharCode(65 + index)}`);
      } else {
        console.log(`❌ Missing: ${field}`);
      }
    });
    
    // Show sample data for new fields
    if (dataRows.length > 0) {
      const sampleRow = dataRows[0];
      console.log("📊 Sample data for new fields:");
      newFields.forEach(field => {
        const index = headers.indexOf(field);
        if (index !== -1) {
          console.log(`  ${field}: "${sampleRow[index]}"`);
        }
      });
    }
    
    console.log("=== TEST COMPLETE ===");
    return true;
    
  } catch (error) {
    console.log("❌ TEST ERROR: " + error.toString());
    return false;
  }
}

function testFirebaseSyncWithNewFields() {
  try {
    console.log("=== TESTING FIREBASE SYNC WITH NEW FIELDS ===");
    
    // Run the main sync function
    syncResidentsToFirebase();
    
    console.log("✅ Sync completed. Check Firebase Console for new fields.");
    return true;
    
  } catch (error) {
    console.log("❌ SYNC ERROR: " + error.toString());
    return false;
  }
}
