#!/usr/bin/env node
"use strict";

/**
 * seed-residents.js
 *
 * Generates N fake Israeli residents and writes them directly to Firestore,
 * then sets system/activeEmergency so the webhook knows there is an active
 * drill (with sheetId = null so NO Google Sheet writes happen during the test).
 *
 * Usage:
 *   node load-test/seed-residents.js [count]
 *   node load-test/seed-residents.js 1500
 *   node load-test/seed-residents.js 5000
 *
 * Auth — three options (tried in order):
 *   1. FIREBASE_SERVICE_ACCOUNT_KEY env var — paste the full JSON as a Cursor Secret (recommended for cloud agents)
 *   2. serviceAccountKey.json file in the workspace root
 *   3. GOOGLE_APPLICATION_CREDENTIALS env var pointing to a key file
 *
 * How to get the service account key:
 *   Firebase Console → Project Settings → Service Accounts → Generate new private key
 */

const path = require("path");
const fs   = require("fs");

// ── Load firebase-admin from the functions folder (already installed) ──────
let admin;
try {
  admin = require(path.join(__dirname, "../functions/node_modules/firebase-admin"));
} catch {
  try {
    admin = require("firebase-admin");
  } catch {
    console.error("❌  firebase-admin not found.");
    console.error("    Run:  cd functions && npm install");
    process.exit(1);
  }
}

const PROJECT_ID = "emergency-dashboard-a3842";

// ── Auth: try three sources in order ──────────────────────────────────────
function initFirebaseAdmin() {
  // Option 1: FIREBASE_SERVICE_ACCOUNT_KEY env var (Cursor Secret — full JSON string)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: PROJECT_ID,
      });
      console.log("   Auth: FIREBASE_SERVICE_ACCOUNT_KEY env var ✓");
      return;
    } catch (e) {
      console.error("❌  FIREBASE_SERVICE_ACCOUNT_KEY is set but failed to parse:", e.message);
      process.exit(1);
    }
  }

  // Option 2: serviceAccountKey.json file in workspace root
  const keyPath = path.join(__dirname, "..", "serviceAccountKey.json");
  if (fs.existsSync(keyPath)) {
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: PROJECT_ID,
      });
      console.log("   Auth: serviceAccountKey.json file ✓");
      return;
    } catch (e) {
      console.error("❌  serviceAccountKey.json found but failed to parse:", e.message);
      process.exit(1);
    }
  }

  // Option 3: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
    console.log("   Auth: Application Default Credentials ✓");
  } catch (err) {
    console.error("❌  No Firebase credentials found. Choose one of:");
    console.error("");
    console.error("   A) Cursor Secret (recommended for cloud agent):");
    console.error("      cursor.com/dashboard → Cloud Agents → Secrets");
    console.error("      Add secret name:  FIREBASE_SERVICE_ACCOUNT_KEY");
    console.error("      Add secret value: <paste the full contents of your service account key JSON>");
    console.error("");
    console.error("   B) File in workspace root:");
    console.error("      Save key as:  /workspace/serviceAccountKey.json");
    console.error("");
    console.error("   Get the key from:");
    console.error("   Firebase Console → Project Settings → Service Accounts → Generate new private key");
    process.exit(1);
  }
}

initFirebaseAdmin();

const db = admin.firestore();

// ── Hebrew fake-data pools ─────────────────────────────────────────────────

const FIRST_NAMES = [
  "דוד", "יוסף", "משה", "אברהם", "יצחק", "יעקב", "שמעון", "אהרן", "ישראל", "שלמה",
  "שרה", "רחל", "לאה", "מרים", "דבורה", "נעמי", "רות", "חנה", "אסתר", "יהודית",
  "בנימין", "אלי", "שמואל", "יהודה", "חיים", "אריה", "ברוך", "רפאל", "עמי", "ניר",
  "אביבה", "ציפורה", "גאולה", "מזל", "שושנה", "תמר", "דינה", "נורית", "ריבה", "זהבה",
  "גלעד", "שי", "אורן", "יובל", "אמיר", "רועי", "תומר", "עידו", "גיא", "עמית",
  "שלומית", "אורה", "גילה", "ברכה", "נחמה", "מיכל", "טלי", "יעל", "אורית", "ענת",
];

const LAST_NAMES = [
  "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "שפירא", "אדלר", "אוחיון",
  "אלבז", "אמסלם", "בן דוד", "בן חיים", "ברגר", "ברקוביץ", "דהן", "זיו", "חדד", "טל",
  "כץ", "מלכה", "סבג", "עמר", "פיינגולד", "צבי", "קפלן", "רוזנברג", "שמש", "תמיר",
  "אנגל", "בר", "גולדברג", "הרצוג", "וייס", "חזן", "טוביה", "כנפי", "לנדאו", "מנדל",
  "נחמני", "סויסה", "עוזיאל", "פינטו", "ציון", "קורן", "ראובן", "שאול", "יונה", "אזולאי",
];

const NEIGHBORHOODS = [
  "כרמל", "נווה שאנן", "עיר תחתית", "רמות", "בת גלים", "כרמליה",
  "מרכז הכרמל", "נאות פרס", "קריית ים", "קריית ביאליק", "קריית אתא",
  "קריית חיים", "רמת שאול", "הדר", "אחוזה", "רמת ויצמן", "נווה דוד",
];

const STREETS = [
  "הרצל", "בן גוריון", "העצמאות", "הנשיא", "אלנבי", "ויצמן",
  "הגליל", "ירושלים", "תל אביב", "הבנים", "הגפן", "הדקל",
  "הכרמל", "הנביאים", "הפרחים", "הרימון", "הזית", "הדגן",
];

// ── Resident generator ─────────────────────────────────────────────────────

function generateResidents(count) {
  const residents = [];
  for (let i = 0; i < count; i++) {
    // Pad to 6 digits: 000001 → 001500 (avoids leading-zero ambiguity)
    const seq          = String(i + 1).padStart(6, "0");
    const normalizedPhone = `972501${seq}`;
    const rawPhone        = `0501${seq}`;

    residents.push({
      "שם פרטי":  FIRST_NAMES[i % FIRST_NAMES.length],
      "שם משפחה": LAST_NAMES[i  % LAST_NAMES.length],
      "טלפון":    rawPhone,
      "שכונה":    NEIGHBORHOODS[i % NEIGHBORHOODS.length],
      "כתובת":    `רחוב ${STREETS[i % STREETS.length]} ${(i % 150) + 1}`,
      "סטטוס":    "",
      "תגובה":    "",
      "updated at": "",
      normalizedPhone,
      rowIndex: i + 2,     // row 1 = header in a hypothetical sheet
      source:   "load_test",
      mode:     "drill",
    });
  }
  return residents;
}

// ── Firestore batch-write ──────────────────────────────────────────────────

async function seedFirestore(residents) {
  const BATCH_SIZE = 400; // safely under Firestore's 500-op limit
  let written = 0;

  for (let i = 0; i < residents.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = residents.slice(i, i + BATCH_SIZE);

    for (const r of chunk) {
      const ref = db.collection("residents").doc("resident_" + r.normalizedPhone);
      batch.set(ref, {
        ...r,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    written += chunk.length;
    process.stdout.write(`\r   Firestore: ${written}/${residents.length} written`);
  }
  console.log(""); // newline after progress
}

// ── Set system/activeEmergency ─────────────────────────────────────────────
// sheetId is intentionally null → handleTwilioWebhook skips all sheet writes,
// so the load test only stresses Firestore (which is what we're measuring).

async function setActiveEmergency(eventId) {
  await db.doc("system/activeEmergency").set({
    mode:                 "drill",
    eventId,
    sheetId:              null,   // no sheet writes during load test
    sheetName:            null,
    statusColumnIndex:    -1,
    timestampColumnIndex: -1,
    replyColumnIndex:     -1,
    activatedAt:          admin.firestore.FieldValue.serverTimestamp(),
    activatedBy:          "load-test-seed",
    isLoadTest:           true,
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const count   = parseInt(process.argv[2] || "1500", 10);
  const eventId = `load-test-${Date.now()}`;

  console.log(`\n🌱  Seeding ${count} fake residents into Firestore...`);
  console.log(`   Project: ${PROJECT_ID}`);
  console.log(`   Event ID: ${eventId}\n`);

  const residents = generateResidents(count);

  // Save phone list so run-load-test.js can pick it up without any DB reads
  const phonesPath = path.join(__dirname, "phones.json");
  fs.writeFileSync(phonesPath, JSON.stringify(residents.map((r) => r.normalizedPhone), null, 2));
  console.log(`   Saved ${count} phone numbers → load-test/phones.json`);

  await seedFirestore(residents);

  process.stdout.write("   Setting system/activeEmergency ... ");
  await setActiveEmergency(eventId);
  console.log("done");

  console.log(`\n✅  Seed complete — ${count} residents ready.`);
  console.log("   Next step:  node load-test/run-load-test.js\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌  Seed failed:", err.message);
  if (err.code === "PERMISSION_DENIED" || err.message.includes("credential")) {
    console.error("\n   Missing credentials. Get a service account key:");
    console.error("   Firebase Console → Project Settings → Service Accounts → Generate new private key");
    console.error("   Save as:  /workspace/serviceAccountKey.json");
  }
  process.exit(1);
});
