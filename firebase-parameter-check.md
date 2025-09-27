# Firebase Parameter Verification Checklist

## 🔍 **Current Configuration Analysis**

### 1. **Firebase Projects**
- **Root `firebase.js`**: `emergency-dashboard-a3842` ✅ (Used by ERT system)
- **`src/firebase.js`**: `crm-dashboard-2db5f` ❌ (Not used)
- **Google Apps Script**: `emergency-dashboard-a3842` ✅ (Correct)

### 2. **ERT System Configuration**
- **Import Path**: `"../firebase"` ✅ (Uses root firebase.js)
- **Project ID**: `emergency-dashboard-a3842` ✅
- **API Key**: `AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE` ✅
- **Collection**: `residents` ✅

### 3. **Google Apps Script Configuration**
- **Project ID**: `emergency-dashboard-a3842` ✅
- **API Key**: `AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE` ✅
- **Collection**: `residents` ✅
- **Sheet Name**: `גליון1` ✅

## 🔧 **Required Actions**

### 1. **Clean Up Duplicate Firebase Config**
Remove the unused `src/firebase.js` file since it's not being used:

```bash
rm src/firebase.js
```

### 2. **Verify Google Apps Script Configuration**
Make sure your Google Apps Script has these exact values:

```javascript
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842";
const FIREBASE_WEB_API_KEY = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE";
const SHEET_NAME = "גליון1";
const DATA_RANGE = "A1:Z500";
```

### 3. **Test Firebase Connection**
Add this test function to your Google Apps Script:

```javascript
function testFirebaseConnection() {
  try {
    Logger.log("=== FIREBASE CONNECTION TEST ===");
    
    // Test 1: Check if we can access the residents collection
    const url = `https://firestore.googleapis.com/v1/projects/emergency-dashboard-a3842/databases/(default)/documents/residents`;
    const options = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const response = UrlFetchApp.fetch(url, options);
    Logger.log(`Response Code: ${response.getResponseCode()}`);
    Logger.log(`Response: ${response.getContentText()}`);
    
    // Test 2: Try to create a test document
    const testId = "test_resident_" + Date.now();
    const testData = {
      fullName: "Test Resident",
      phoneNumber: "0501234567",
      status: "חדש",
      testField: "This is a test document"
    };
    
    const success = syncResidentToFirebase(testId, testData);
    Logger.log(`Test document creation: ${success}`);
    
    return success;
    
  } catch (error) {
    Logger.log("Firebase connection test failed: " + error.toString());
    return false;
  }
}
```

### 4. **Verify Firestore Security Rules**
Make sure your `firestore.rules` includes the residents collection:

```javascript
match /residents/{residentId} {
  allow read: if isAuthenticated();
  allow create, update: if 
    request.resource.data.fullName is string &&
    request.resource.data.phoneNumber is string &&
    request.resource.data.status is string;
  allow delete: if isAdmin();
}
```

### 5. **Test Complete Flow**
1. Run `testFirebaseConnection()` in Google Apps Script
2. Check the logs for any errors
3. Run `manualSync()` to sync all residents
4. Check Firebase Console for `residents` collection
5. Check ERT system for data

## 🚨 **Potential Issues to Check**

### 1. **Authentication Issues**
- The API key might not have the right permissions
- Firestore might not be enabled in the project
- Security rules might be blocking writes

### 2. **Data Structure Issues**
- The data format might not match what ERT expects
- Field names might be different between Sheets and ERT

### 3. **Network Issues**
- Google Apps Script might be blocked from accessing Firebase
- Rate limiting might be preventing writes

## 📋 **Debugging Steps**

### Step 1: Test Firebase Connection
```javascript
function debugFirebase() {
  Logger.log("Testing Firebase connection...");
  
  const url = "https://firestore.googleapis.com/v1/projects/emergency-dashboard-a3842/databases/(default)/documents";
  const response = UrlFetchApp.fetch(url);
  
  Logger.log(`Status: ${response.getResponseCode()}`);
  Logger.log(`Response: ${response.getContentText()}`);
}
```

### Step 2: Test Data Structure
```javascript
function testDataStructure() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName("גליון1");
  const data = sheet.getDataRange().getValues();
  
  Logger.log("Headers: " + JSON.stringify(data[0]));
  if (data.length > 1) {
    Logger.log("Sample row: " + JSON.stringify(data[1]));
  }
}
```

### Step 3: Test ERT System
Check browser console for any Firebase connection errors in your ERT system.

## ✅ **Expected Results**

After fixing the configuration:
1. Google Apps Script should successfully sync data to `residents` collection
2. ERT system should display residents data in real-time
3. No authentication or permission errors in logs
4. Data should appear in Firebase Console under `residents` collection 