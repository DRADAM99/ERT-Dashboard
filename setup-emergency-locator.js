#!/usr/bin/env node

/**
 * Emergency Locator Setup Script
 * 
 * This script helps you set up the emergency locator project with proper security.
 * 
 * Steps:
 * 1. Get your emergency locator Firebase config
 * 2. Update the sync script with the config
 * 3. Apply security rules to the emergency locator project
 * 4. Sync your ERT users to the emergency locator
 */

console.log('🚨 Emergency Locator Security Setup');
console.log('=====================================\n');

console.log('📋 To complete the setup, follow these steps:\n');

console.log('1. 🔑 Get Emergency Locator Firebase Config:');
console.log('   - Go to https://console.firebase.google.com/');
console.log('   - Select project: emergency-locator-585a5');
console.log('   - Go to Project Settings > General');
console.log('   - Copy the Firebase config object\n');

console.log('2. 📝 Update the sync script:');
console.log('   - Open lib/emergency-locator-sync.js');
console.log('   - Replace the placeholder values in emergencyLocatorConfig with your actual config\n');

console.log('3. 🔒 Apply Security Rules:');
console.log('   - In Firebase Console for emergency-locator-585a5');
console.log('   - Go to Firestore Database > Rules');
console.log('   - Replace current rules with the contents of emergency-locator-security-rules.js\n');

console.log('4. 👥 Sync ERT Users:');
console.log('   - Run: node sync-ert-users-to-locator.js');
console.log('   - Or use the Emergency Locator Integration component in your dashboard\n');

console.log('5. ✅ Test Access:');
console.log('   - Log into your ERT dashboard');
console.log('   - Go to the Emergency Locator section');
console.log('   - Click "Sync Current User" or "Request Access"\n');

console.log('📄 Security Rules Summary:');
console.log('- All access requires Firebase Authentication');
console.log('- Only ERT users (in ert_users collection) can access');
console.log('- All ERT users (admins and staff) have access');
console.log('- Location data is validated');
console.log('- Admin users have additional privileges\n');

console.log('🔧 Files Created:');
console.log('- emergency-locator-security-rules.js (copy to Firebase Console)');
console.log('- lib/emergency-locator-sync.js (update with your config)');
console.log('- components/EmergencyLocatorIntegration.js (integrated into dashboard)');
console.log('- setup-emergency-locator.js (this file)\n');

console.log('🎯 Next Steps:');
console.log('1. Copy the security rules to your emergency locator Firebase project');
console.log('2. Update the Firebase config in lib/emergency-locator-sync.js');
console.log('3. Test the integration in your dashboard\n');

console.log('Need help? Check EMERGENCY_LOCATOR_SECURITY_SETUP.md for detailed instructions.'); 