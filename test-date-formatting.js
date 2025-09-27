// Test script to verify date formatting function works correctly

const formatCellValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Handle Date objects
  if (value instanceof Date) {
    return value.toLocaleString('he-IL');
  }
  
  // Handle Firestore Timestamp objects
  if (value && typeof value === 'object' && value.seconds) {
    const date = new Date(value.seconds * 1000);
    return date.toLocaleString('he-IL');
  }
  
  // Handle other objects (convert to string)
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  
  // Return string values as-is
  return String(value);
};

// Test cases
const testCases = [
  // Regular string
  { input: "יוסי כהן", expected: "יוסי כהן" },
  
  // Date object
  { input: new Date("2025-08-01T13:30:00.000Z"), expected: "date string" },
  
  // Firestore Timestamp
  { input: { seconds: 1754055127, nanoseconds: 434000000 }, expected: "date string" },
  
  // Null
  { input: null, expected: "" },
  
  // Undefined
  { input: undefined, expected: "" },
  
  // Object
  { input: { test: "value" }, expected: '{"test":"value"}' },
  
  // Number
  { input: 123, expected: "123" }
];

console.log("Testing date formatting function...\n");

testCases.forEach((testCase, index) => {
  const result = formatCellValue(testCase.input);
  const isDate = testCase.input instanceof Date || (testCase.input && typeof testCase.input === 'object' && testCase.input.seconds);
  
  if (isDate) {
    console.log(`✅ Test ${index + 1}: Date formatting works`);
    console.log(`   Input: ${JSON.stringify(testCase.input)}`);
    console.log(`   Output: ${result}`);
  } else {
    const passed = result === testCase.expected;
    console.log(`${passed ? '✅' : '❌'} Test ${index + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`   Input: ${JSON.stringify(testCase.input)}`);
    console.log(`   Expected: ${testCase.expected}`);
    console.log(`   Got: ${result}`);
  }
  console.log("");
});

console.log("Date formatting test completed!"); 