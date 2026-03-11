#!/usr/bin/env node
"use strict";

/**
 * clear-residents.js
 *
 * Deletes all documents in the Firestore `residents` collection and clears
 * system/activeEmergency.  Use this to clean up after a load test.
 *
 * Usage:
 *   node load-test/clear-residents.js
 */

const path = require("path");
const fs   = require("fs");

let admin;
try {
  admin = require(path.join(__dirname, "../functions/node_modules/firebase-admin"));
} catch {
  admin = require("firebase-admin");
}

const PROJECT_ID = "emergency-dashboard-a3842";

function initFirebaseAdmin() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });
    return;
  }
  const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: PROJECT_ID });
    return;
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
}

initFirebaseAdmin();

const db = admin.firestore();

async function deleteCollection(collectionName, batchSize = 400) {
  const collRef = db.collection(collectionName);
  let deleted = 0;

  while (true) {
    const snap = await collRef.limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    deleted += snap.size;
    process.stdout.write(`\r   Deleted ${deleted} residents...`);
  }
  console.log("");
}

async function main() {
  console.log("\n🧹  Clearing load test data...\n");

  process.stdout.write("   Deleting residents collection...");
  await deleteCollection("residents");

  process.stdout.write("   Clearing system/activeEmergency ... ");
  await db.doc("system/activeEmergency").delete();
  console.log("done");

  const phonesFile = path.join(__dirname, "phones.json");
  if (fs.existsSync(phonesFile)) {
    fs.unlinkSync(phonesFile);
    console.log("   Removed phones.json");
  }

  console.log("\n✅  Cleanup complete.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌  Cleanup failed:", err.message);
  process.exit(1);
});
