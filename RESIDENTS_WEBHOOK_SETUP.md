# Residents Webhook Setup Guide

This guide explains how to set up the webhook system to sync residents data from Google Sheets to Firebase, which will automatically update the ResidentsManagement component in your dashboard.

## Overview

The system consists of:
1. **Google Apps Script** - Fetches data from Google Sheets and sends to webhook
2. **Next.js API Route** - Receives webhook data and updates Firestore
3. **Firestore Listener** - Already implemented in the main dashboard
4. **ResidentsManagement Component** - Displays the data with real-time updates

## Step 1: Deploy Your Next.js App

Make sure your Next.js app is deployed and accessible via HTTPS. You'll need the domain for the webhook URL.

## Step 2: Update Webhook URL

In the `google-apps-script-residents-sync.js` file, update the `WEBHOOK_URL`:

```javascript
const WEBHOOK_URL = "https://your-actual-domain.com/api/sync-residents";
```

Replace `your-actual-domain.com` with your actual deployed domain.

## Step 3: Set Up Google Apps Script

1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project
3. Copy the contents of `google-apps-script-residents-sync.js` into the editor
4. Update the configuration variables:
   - `SHEET_ID`: Your Google Sheet ID
   - `SHEET_NAME`: Your sheet name (default: "גליון1")
   - `WEBHOOK_URL`: Your deployed app's webhook URL
   - `API_KEY`: Your Google Sheets API key

## Step 4: Test the Webhook

1. In the Google Apps Script editor, run the `testWebhook()` function
2. Check the logs to see if the connection is successful
3. If successful, you should see a test resident in your Firebase console

## Step 5: Set Up Automatic Sync

Run the `setupTriggers()` function in Google Apps Script to set up automatic hourly sync.

## Step 6: Manual Sync

You can run `manualSync()` anytime to manually sync the data.

## API Endpoints

### POST /api/sync-residents
Receives residents data from Google Apps Script and updates Firestore.

**Request Body:**
```json
{
  "residents": [
    {
      "שם": "יוסי כהן",
      "טלפון": "050-1234567",
      "סטטוס": "כולם בבית וכולם בסדר",
      "כתובת": "רחוב הראשי 123"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Synced 1 residents",
  "timestamp": "2025-01-27T10:30:00.000Z"
}
```

### GET /api/sync-residents
Returns current residents count and sample data for testing.

**Response:**
```json
{
  "success": true,
  "count": 5,
  "residents": [
    {
      "id": "doc-id",
      "שם": "יוסי כהן",
      "סטטוס": "כולם בבית וכולם בסדר",
      "syncedAt": "2025-01-27T10:30:00.000Z"
    }
  ]
}
```

## Data Flow

1. **Google Sheets** → Contains resident data
2. **Google Apps Script** → Fetches data and sends to webhook
3. **Next.js API** → Receives data and updates Firestore
4. **Firestore** → Stores the data
5. **Dashboard** → Real-time listener updates the ResidentsManagement component
6. **UI** → Displays updated data with color-coded status indicators

## Status Color Mapping

The ResidentsManagement component uses these status colors:

```javascript
const residentStatusColorMap = {
  'כולם בבית וכולם בסדר': 'bg-green-500',
  'אנחנו זקוקים לסיוע': 'bg-red-500',
  'לא כולם בבית, כולם בסדר': 'bg-orange-400',
  'אין מידע על כל בני הבית': 'bg-yellow-400',
};
```

## Troubleshooting

### Webhook Not Receiving Data
1. Check the webhook URL is correct and accessible
2. Verify your app is deployed and running
3. Check the Google Apps Script logs for errors

### Data Not Updating in Dashboard
1. Check the Firestore console to see if data is being written
2. Verify the residents collection exists
3. Check browser console for any JavaScript errors

### Google Apps Script Errors
1. Make sure you have edit access to the Google Sheet
2. Verify the sheet name matches exactly
3. Check that the sheet has data in the expected format

## Security Considerations

1. **API Key**: Keep your Google Sheets API key secure
2. **Webhook URL**: Use HTTPS for production
3. **Firestore Rules**: Ensure proper security rules are in place
4. **Rate Limiting**: Consider implementing rate limiting for the webhook

## Monitoring

- Check Google Apps Script execution logs
- Monitor Firestore usage and costs
- Set up alerts for webhook failures
- Track sync frequency and success rates

## Customization

### Adding New Fields
1. Add the field to your Google Sheet
2. The webhook will automatically include new fields
3. Update the ResidentsManagement component if needed for display

### Changing Sync Frequency
Modify the trigger in Google Apps Script:
```javascript
// Every 30 minutes
.everyMinutes(30)

// Every 6 hours
.everyHours(6)

// Daily at 9 AM
.timeBased()
.everyDays(1)
.atHour(9)
```

### Error Handling
The webhook includes comprehensive error handling and logging. Check the server logs for detailed error information. 