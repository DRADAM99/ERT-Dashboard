# Emergency Locator Security Setup Guide

## Problem
Your Emergency Locator Firebase project (`emergency-locator-585a5`) was shut down by Google because it had no security rules and was completely public.

## Solution Options

### Option 1: Secure the Emergency Locator Project (Recommended)
Keep the emergency locator as a separate service but secure it properly.

### Option 2: Integrate into Main ERT Dashboard
Move the emergency locator functionality into your main ERT dashboard project.

## Option 1: Secure Emergency Locator Project

### Step 1: Get Emergency Locator Firebase Config
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select the `emergency-locator-585a5` project
3. Go to Project Settings > General
4. Copy the Firebase config object

### Step 2: Update the Sync Script
1. Open `sync-ert-users-to-locator.js`
2. Replace the placeholder values in `emergencyLocatorConfig` with your actual config:

```javascript
const emergencyLocatorConfig = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "emergency-locator-585a5.firebaseapp.com",
  projectId: "emergency-locator-585a5",
  storageBucket: "emergency-locator-585a5.firebasestorage.app",
  messagingSenderId: "YOUR_ACTUAL_SENDER_ID",
  appId: "YOUR_ACTUAL_APP_ID"
};
```

### Step 3: Apply Security Rules
1. In the Firebase Console for `emergency-locator-585a5`
2. Go to Firestore Database > Rules
3. Replace the current rules with the contents of `emergency-locator-security-rules.js`

### Step 4: Sync ERT Users
1. Run the sync script to add your ERT users to the emergency locator:

```bash
node sync-ert-users-to-locator.js
```

### Step 5: Update Emergency Locator App
The emergency locator app needs to:
1. Use Firebase Authentication
2. Check if users exist in the `ert_users` collection
3. Only allow access to authenticated ERT users

## Option 2: Integrate into Main ERT Dashboard

If you prefer to consolidate everything into one project:

### Step 1: Create Emergency Map Component
Create a new component in your main ERT dashboard that handles emergency location tracking.

### Step 2: Update the iframe
Replace the current iframe with a local component:

```javascript
// Instead of:
<iframe src="https://emergency-locator-585a5.web.app/map.html" />

// Use:
<EmergencyMapComponent />
```

### Step 3: Add Emergency Collections to Main Project
Add these collections to your main ERT Firestore:
- `emergency_locations`
- `emergency_events`
- `user_sessions`

## Recommended Approach

I recommend **Option 1** (securing the emergency locator project) because:

1. **Separation of Concerns**: Emergency locator is a specialized service
2. **Scalability**: Can be deployed independently
3. **Security**: Easier to manage access control
4. **Maintenance**: Changes to emergency locator don't affect main dashboard

## Security Benefits

The new security rules provide:

1. **Authentication Required**: All access requires Firebase Auth
2. **ERT User Verification**: Only users in the `ert_users` collection can access
3. **Data Validation**: Ensures location data is properly formatted
4. **Role-Based Access**: Admins have additional privileges
5. **Audit Trail**: Tracks when users were synced

## Next Steps

1. **Immediate**: Apply the security rules to prevent further shutdown
2. **Short-term**: Sync your ERT users to the emergency locator
3. **Long-term**: Consider if you want to keep it separate or integrate

## Testing

After setup, test that:
1. ✅ ERT users can access the emergency locator
2. ✅ Non-ERT users cannot access
3. ✅ Location data is properly validated
4. ✅ Admin functions work correctly

## Support

If you need help with any of these steps, let me know and I can assist with the specific implementation details. 