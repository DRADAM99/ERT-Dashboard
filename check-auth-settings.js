#!/usr/bin/env node

/**
 * Check and Configure Emergency Locator Authentication Settings
 * 
 * This script helps configure the emergency locator project to use email/password authentication
 * like the main ERT dashboard.
 */

console.log('🔐 Checking Emergency Locator Authentication Settings...\n');

console.log('📋 Current Setup:');
console.log('- ERT Dashboard: Email/Password Authentication ✅');
console.log('- Emergency Locator: Need to verify authentication method');

console.log('\n🔧 Steps to Configure Emergency Locator Authentication:');

console.log('\n1️⃣ Check Current Authentication Settings:');
console.log('   - Go to Firebase Console > emergency-locator-585a5');
console.log('   - Navigate to Authentication > Sign-in method');
console.log('   - Check if "Email/Password" is enabled');

console.log('\n2️⃣ Enable Email/Password Authentication:');
console.log('   - If Email/Password is not enabled, click "Enable"');
console.log('   - This will allow the same authentication method as ERT Dashboard');

console.log('\n3️⃣ Create Test User in Emergency Locator:');
console.log('   - Go to Authentication > Users');
console.log('   - Add your email as a user with the same password as ERT Dashboard');
console.log('   - Or use the same credentials you use for ERT Dashboard');

console.log('\n4️⃣ Test Authentication:');
console.log('   - Try logging into the emergency locator directly');
console.log('   - Use the same email/password as your ERT Dashboard');

console.log('\n🎯 Alternative Solution:');
console.log('If the emergency locator app doesn\'t support email/password auth,');
console.log('we can modify the security rules to allow access from authenticated ERT users.');

console.log('\n📝 Next Steps:');
console.log('1. Check Firebase Console authentication settings');
console.log('2. Enable email/password if not enabled');
console.log('3. Create test user or use existing credentials');
console.log('4. Test direct access to emergency locator');
console.log('5. If successful, the dashboard integration should work'); 