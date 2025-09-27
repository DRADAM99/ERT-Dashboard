rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper Functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function isERTUser() {
      return isAuthenticated() && 
        exists(/databases/$(database)/documents/ert_users/$(request.auth.uid));
    }

    function isERTAdmin() {
      return isAuthenticated() && 
        exists(/databases/$(database)/documents/ert_users/$(request.auth.uid)) &&
        get(/databases/$(database)/documents/ert_users/$(request.auth.uid)).data.role == 'admin';
    }

    function isValidLocation() {
      return request.resource.data.latitude is number &&
             request.resource.data.longitude is number &&
             request.resource.data.timestamp is timestamp &&
             request.resource.data.userId is string;
    }

    // ERT Users Collection (for access control)
    match /ert_users/{userId} {
      allow read, write: if isAuthenticated() && 
        (request.auth.uid == userId || isERTAdmin());
    }

    // Emergency Locations Collection
    match /emergency_locations/{locationId} {
      allow read: if isERTUser();
      
      allow create, update: if isERTUser() && isValidLocation() &&
        request.resource.data.userId == request.auth.uid;
      
      allow delete: if isERTUser() && 
        (resource.data.userId == request.auth.uid || isERTAdmin());
    }

    // Emergency Events Collection
    match /emergency_events/{eventId} {
      allow read: if isERTUser();
      
      allow create: if isERTUser() &&
        request.resource.data.createdBy == request.auth.uid &&
        request.resource.data.timestamp is timestamp;
      
      allow update: if isERTUser() && 
        (resource.data.createdBy == request.auth.uid || isERTAdmin());
      
      allow delete: if isERTUser() && 
        (resource.data.createdBy == request.auth.uid || isERTAdmin());
    }

    // User Sessions Collection
    match /user_sessions/{sessionId} {
      allow read: if isERTUser() && 
        (resource.data.userId == request.auth.uid || isERTAdmin());
      
      allow create, update: if isERTUser() &&
        request.resource.data.userId == request.auth.uid;
      
      allow delete: if isERTUser() && 
        (resource.data.userId == request.auth.uid || isERTAdmin());
    }

    // Allow access to any collection for ERT users (for flexibility)
    match /{document=**} {
      allow read: if isERTUser();
      allow write: if isERTUser();
    }
  }
} 