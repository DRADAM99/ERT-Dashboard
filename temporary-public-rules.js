// Temporary Public Access Rules for Emergency Locator
// WARNING: This allows public access - only use for testing!

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // TEMPORARY - ALLOWS PUBLIC ACCESS
    }
  }
} 