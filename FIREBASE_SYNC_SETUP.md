# Firebase Sync Setup Guide

This guide will help you set up the complete Firebase sync system for your ERT project.

## Overview

The system now works as follows:
1. **Google Sheets** remains the source of truth for residents data
2. **Google Apps Script** automatically syncs data to Firebase
3. **ERT System** fetches residents from Firebase in real-time
4. You can create tasks, assign users, and manage residents from the ERT interface

## Step 1: Set up Google Apps Script

### 1.1 Open Google Apps Script
1. Go to your Google Sheet with residents data
2. Click **Extensions** > **Apps Script**
3. Replace the default code with the content from `firebase-sync-script.js`

### 1.2 Update Configuration
In the script, update these values:
```javascript
const FIREBASE_PROJECT_ID = "emergency-dashboard-a3842"; // Your Firebase project ID
const FIREBASE_WEB_API_KEY = "AIzaSyADV9_C-i0F91jr8TcOq2zItMsnjag6oyE"; // Your Firebase Web API Key
const SHEET_NAME = "גליון1"; // Your sheet name
const DATA_RANGE = "A1:Z500"; // Adjust range as needed
```

### 1.3 Set up Triggers
1. In the Apps Script editor, run the `setupTriggers()` function
2. This will create automatic triggers that sync data:
   - Every 5 minutes
   - Every hour
3. You can also run `manualSync()` to sync immediately

## Step 2: Verify Firebase Configuration

### 2.1 Check Firebase Project
- Your Firebase project ID: `emergency-dashboard-a3842`
- Make sure Firestore is enabled
- Verify the security rules include the residents collection

### 2.2 Test the Connection
1. In Apps Script, run the `testFirebaseConnection()` function
2. Check the logs for any errors

## Step 3: Update ERT System

The ERT system has been updated to:
- Fetch residents from Firebase instead of Google Sheets
- Use real-time listeners for live updates
- Maintain the same filtering and categorization functionality

## Step 4: Test the Complete System

### 4.1 Test Data Flow
1. Add a new resident to your Google Sheet
2. Wait for the automatic sync (or run `manualSync()`)
3. Check that the resident appears in your ERT system
4. Verify that categories are properly extracted

### 4.2 Test Real-time Updates
1. Modify a resident's status in Google Sheets
2. Verify the change appears in ERT within 5 minutes
3. Test creating tasks and assigning users to residents

## Troubleshooting

### Common Issues

#### 1. Firebase Connection Errors
- Verify your Firebase project ID and API key
- Check that Firestore is enabled in your Firebase project
- Ensure the security rules allow the residents collection

#### 2. Sync Not Working
- Check Apps Script logs for errors
- Verify the sheet name and range are correct
- Test the `manualSync()` function

#### 3. Data Not Appearing in ERT
- Check browser console for Firebase connection errors
- Verify the user is authenticated
- Check that the residents collection exists in Firebase

### Debugging Steps

1. **Check Apps Script Logs**
   - Go to Apps Script > Executions
   - View logs for any errors

2. **Check Firebase Console**
   - Go to Firebase Console > Firestore
   - Verify residents are being added to the collection

3. **Check ERT System**
   - Open browser developer tools
   - Check console for any errors
   - Verify Firebase connection

## API Endpoints

### Sync Residents API
- **Endpoint**: `/api/sync-residents`
- **Method**: POST
- **Purpose**: Manually trigger residents sync from ERT system
- **Body**: `{ "sheetData": [...] }`

## Security Considerations

1. **API Key Security**: The Firebase Web API key is public by design, but you should monitor usage
2. **Data Validation**: The system validates data before syncing
3. **Rate Limiting**: The script includes delays to avoid rate limiting
4. **Error Handling**: Comprehensive error handling and logging

## Maintenance

### Regular Tasks
1. Monitor Apps Script execution logs
2. Check Firebase usage and costs
3. Verify data consistency between Sheets and Firebase
4. Update security rules as needed

### Backup Strategy
- Google Sheets serves as the primary backup
- Firebase provides real-time access and task management
- Consider regular exports from Firebase for additional backup

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Apps Script and Firebase logs
3. Verify all configuration values are correct
4. Test with a small dataset first

## Next Steps

Once the basic sync is working, you can enhance the system with:
1. **Bidirectional sync**: Update Firebase data back to Sheets
2. **Advanced filtering**: More sophisticated resident filtering
3. **Analytics**: Track sync performance and data quality
4. **Notifications**: Email alerts for sync failures 