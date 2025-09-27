#!/usr/bin/env node

/**
 * Test Emergency Locator Component
 * 
 * This script tests if the Emergency Locator Integration component is working.
 */

console.log('🧪 Testing Emergency Locator Component...\n');

console.log('📋 What you should see in your ERT dashboard:');
console.log('1. Emergency Locator Access section');
console.log('2. Current User: [your email]');
console.log('3. Access Status: ✗ No Access (initially)');
console.log('4. Authentication: ✗ Not Authenticated (initially)');
console.log('5. Buttons:');
console.log('   - Authenticate with ERT');
console.log('   - Sync Current User');
console.log('   - Test Full Access');
console.log('   - Sync All Users');

console.log('\n🔧 If you don\'t see these elements:');
console.log('1. Hard refresh your browser (Ctrl+F5)');
console.log('2. Clear browser cache');
console.log('3. Restart development server');
console.log('4. Check browser console for errors');

console.log('\n🎯 Next Steps:');
console.log('1. Click "Authenticate with ERT"');
console.log('2. Enter your ERT password when prompted');
console.log('3. Click "Sync Current User"');
console.log('4. Click "Test Full Access"');
console.log('5. You should see the emergency locator iframe');

console.log('\n📞 If it still doesn\'t work:');
console.log('- Check browser console for errors');
console.log('- Verify the component is imported correctly');
console.log('- Make sure all API keys are updated'); 