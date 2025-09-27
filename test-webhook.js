/**
 * Test script for the residents webhook
 * Run this to test if the webhook is working correctly
 */

const testWebhook = async () => {
  const testData = {
    residents: [
      {
        "שם": "יוסי כהן",
        "טלפון": "050-1234567",
        "סטטוס": "כולם בבית וכולם בסדר",
        "כתובת": "רחוב הראשי 123",
        "הערות": "תושב חדש"
      },
      {
        "שם": "שרה מזרחי",
        "טלפון": "052-7654321",
        "סטטוס": "אנחנו זקוקים לסיוע",
        "כתובת": "רחוב המשני 456",
        "הערות": "צריך עזרה דחופה"
      },
      {
        "שם": "בני גנץ",
        "טלפון": "054-9876543",
        "סטטוס": "לא כולם בבית, כולם בסדר",
        "כתובת": "רחוב השלישי 789",
        "הערות": "חלק מהמשפחה בחו\"ל"
      }
    ]
  };

  try {
    console.log('Testing webhook with sample data...');
    
    const response = await fetch('http://localhost:3000/api/sync-residents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Webhook test successful!');
      console.log('Response:', result);
    } else {
      console.log('❌ Webhook test failed!');
      console.log('Status:', response.status);
      console.log('Response:', result);
    }
  } catch (error) {
    console.error('❌ Error testing webhook:', error);
  }
};

// Test GET endpoint
const testGetEndpoint = async () => {
  try {
    console.log('\nTesting GET endpoint...');
    
    const response = await fetch('http://localhost:3000/api/sync-residents');
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ GET endpoint working!');
      console.log('Current residents count:', result.count);
      console.log('Sample residents:', result.residents);
    } else {
      console.log('❌ GET endpoint failed!');
      console.log('Status:', response.status);
      console.log('Response:', result);
    }
  } catch (error) {
    console.error('❌ Error testing GET endpoint:', error);
  }
};

// Run tests
const runTests = async () => {
  console.log('🚀 Starting webhook tests...\n');
  
  await testWebhook();
  await testGetEndpoint();
  
  console.log('\n✨ Tests completed!');
};

// Run tests
runTests(); 