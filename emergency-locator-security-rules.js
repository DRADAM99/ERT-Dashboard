// Firebase Security Rules for Emergency Locator Project
// Project ID: emergency-locator-585a5

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    
    // ────────────────
    // Helper Functions
    // ────────────────
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

    // ────────────────
    // ERT Users Collection (for access control)
    // ────────────────
    match /ert_users/{userId} {
      // Allow read/write by the user themselves or admins
      allow read, write: if isAuthenticated() && 
        (request.auth.uid == userId || isERTAdmin());
    }

    // ────────────────
    // Emergency Locations Collection
    // ────────────────
    match /emergency_locations/{locationId} {
      // Allow read for all ERT users
      allow read: if isERTUser();
      
      // Allow create/update for authenticated ERT users with valid data
      allow create, update: if isERTUser() && isValidLocation() &&
        request.resource.data.userId == request.auth.uid;
      
      // Allow delete only by the creator or admins
      allow delete: if isERTUser() && 
        (resource.data.userId == request.auth.uid || isERTAdmin());
    }

    // ────────────────
    // Emergency Events Collection
    // ────────────────
    match /emergency_events/{eventId} {
      // Allow read for all ERT users
      allow read: if isERTUser();
      
      // Allow create for authenticated ERT users
      allow create: if isERTUser() &&
        request.resource.data.createdBy == request.auth.uid &&
        request.resource.data.timestamp is timestamp;
      
      // Allow update only by the creator or admins
      allow update: if isERTUser() && 
        (resource.data.createdBy == request.auth.uid || isERTAdmin());
      
      // Allow delete only by the creator or admins
      allow delete: if isERTUser() && 
        (resource.data.createdBy == request.auth.uid || isERTAdmin());
    }

    // ────────────────
    // User Sessions Collection
    // ────────────────
    match /user_sessions/{sessionId} {
      // Allow read for the user themselves or admins
      allow read: if isERTUser() && 
        (resource.data.userId == request.auth.uid || isERTAdmin());
      
      // Allow create/update for authenticated users
      allow create, update: if isERTUser() &&
        request.resource.data.userId == request.auth.uid;
      
      // Allow delete by the user themselves or admins
      allow delete: if isERTUser() && 
        (resource.data.userId == request.auth.uid || isERTAdmin());
    }

    // ────────────────
    // Allow access to any collection for ERT users (for flexibility)
    // ────────────────
    match /{document=**} {
      allow read: if isERTUser();
      allow write: if isERTUser();
    }
  }
} 