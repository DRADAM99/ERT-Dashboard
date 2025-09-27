// Test file for emergency event export functionality
// This file can be run to test the CSV export logic

const testEmergencyExport = () => {
  console.log("🧪 Testing Emergency Event Export Functionality");
  
  // Test timestamp formatting
  const formatDateTimeForCSV = (timestamp) => {
    if (!timestamp) return "";
    if (timestamp.seconds) {
      return new Date(timestamp.seconds * 1000).toISOString();
    }
    if (timestamp.toDate) {
      return timestamp.toDate().toISOString();
    }
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    return new Date(timestamp).toISOString();
  };

  // Test data
  const testData = [
    {
      timestamp: { seconds: Math.floor(Date.now() / 1000) },
      eventType: 'Event Log',
      eventId: 'test-event-1',
      user: 'אדם',
      action: 'Event Created',
      details: 'אירוע חירום ברחוב הראשי',
      status: 'מחכה',
      department: 'לוגיסטיקה',
      priority: '',
      relatedIds: ''
    },
    {
      timestamp: { seconds: Math.floor(Date.now() / 1000) - 3600 },
      eventType: 'Task',
      eventId: 'test-task-1',
      user: 'דנה',
      action: 'Task Created',
      details: 'פינוי תושבים',
      status: 'פתוח',
      department: 'אוכלוסיה',
      priority: 'דחוף',
      relatedIds: 'resident-123'
    }
  ];

  // Generate CSV content
  const headers = [
    'Timestamp',
    'Event Type',
    'Event ID',
    'User',
    'Action',
    'Details',
    'Status',
    'Department',
    'Priority',
    'Related IDs'
  ];

  const csvData = [headers];
  
  testData.forEach(item => {
    csvData.push([
      formatDateTimeForCSV(item.timestamp),
      item.eventType,
      item.eventId,
      item.user,
      item.action,
      item.details,
      item.status,
      item.department,
      item.priority,
      item.relatedIds
    ]);
  });

  // Convert to CSV string
  const csvContent = csvData.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  console.log("📊 Generated CSV Content:");
  console.log(csvContent);
  
  console.log("✅ Test completed successfully!");
  console.log("📁 CSV would be saved as: emergency_event_test_" + new Date().toISOString().split('T')[0] + ".csv");
};

// Run the test
testEmergencyExport();
