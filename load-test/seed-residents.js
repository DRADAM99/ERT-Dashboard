#!/usr/bin/env node
/**
 * Seed Residents Load Test Data
 *
 * Seeds N synthetic residents into the `residents` Firestore collection using
 * the Firebase Admin SDK (bypasses security rules).
 *
 * Defaults to the local Firestore emulator (FIRESTORE_EMULATOR_HOST).
 * Pass --prod to target the production project (requires ADC / service account).
 *
 * Usage:
 *   node load-test/seed-residents.js [count] [--prod]
 *   node load-test/seed-residents.js 1500
 *   node load-test/seed-residents.js 1500 --prod
 */

import admin from "firebase-admin";

const PROJECT_ID = "emergency-dashboard-a3842";
const EMULATOR_HOST = "127.0.0.1:8080";

// ── Synthetic data pools ─────────────────────────────────────────────────────

const FIRST_NAMES = [
  "יוסי", "שרה", "דנה", "משה", "רחל", "אברהם", "מיכל", "בני", "נועה", "עמית",
  "גיל", "ליאור", "תמר", "יעל", "אורי", "רוני", "מאיה", "אלון", "הדר", "שחר",
  "ניר", "עידו", "לירן", "עינב", "יונתן", "שיר", "אסף", "נטע", "עמי", "ליאת",
  "אדם", "יובל", "נעם", "קרן", "איתי", "ספיר", "גלעד", "תהל", "בר", "מור",
];

const LAST_NAMES = [
  "כהן", "לוי", "מזרחי", "גנץ", "גולדברג", "ברק", "פרץ", "שפירא", "אברמוביץ",
  "חזן", "ביטון", "אזולאי", "מנשה", "סויסה", "בן-דוד", "קציר", "נחמיאס", "שמחון",
  "חדד", "עמר", "דהן", "אבוטבול", "פינקל", "שטרן", "רוזנברג", "גרינברג", "שרעבי",
  "לוקר", "בוחבוט", "אביב", "ממן", "טל", "אסרף", "מרציאנו", "פרידמן", "כץ",
];

const NEIGHBORHOODS = [
  "הרצליה", "נווה שאנן", "קריית אליעזר", "הדר", "בת גלים", "רמת הנשיא",
  "קריית שפרינצק", "נווה דוד", "כרמליה", "העיר העתיקה", "רמת ויז'ניץ",
  "קריית חיים", "נשר", "קריית מוצקין", "טירת הכרמל", "עין גנים",
  "גבעת שאול", "רמות", "ארנונה", "קטמון", "בית הכרם", "מוצא", "פסגת זאב",
  "פלורנטין", "נווה צדק", "לב תל אביב", "יפו", "הצפון הישן", "רמת אביב",
];

const STATUSES = ["כולם בסדר", "זקוקים לסיוע", "לא בטוח", "פצוע", ""];

const NOTES_TEMPLATES = [
  "תושב חדש, צריכים לעקוב אחרי המצב",
  "צריכים עזרה דחופה, משפחה עם ילדים קטנים",
  'חלק מהמשפחה בחו"ל, כרגע רק ההורים בבית',
  "קשישים, צריכים עזרה עם תרופות",
  "משפחה גדולה, 6 ילדים, כולם בסדר",
  "אין מידע על כל בני הבית, צריך לבדוק",
  "אנחנו זקוקים לסיוע, אין חשמל",
  "לא כולם בבית, כולם בסדר",
  "מחכים לאישור פינוי",
  "זקנה לבד, זקוקה לליווי",
  "",
];

// ── Generator ────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePhone(index) {
  const prefixes = ["050", "052", "053", "054", "058"];
  const prefix = pick(prefixes);
  const suffix = String(1000000 + index).padStart(7, "0");
  return `${prefix}-${suffix}`;
}

function generateResident(index, eventId) {
  const now = Date.now();
  const offsetMs = Math.floor(Math.random() * 30 * 24 * 60 * 60 * 1000);
  const timestamp = admin.firestore.Timestamp.fromDate(new Date(now - offsetMs));

  return {
    timestamp,
    סטטוס: pick(STATUSES),
    "שם משפחה": pick(LAST_NAMES),
    "שם פרטי": pick(FIRST_NAMES),
    טלפון: generatePhone(index),
    שכונה: pick(NEIGHBORHOODS),
    בית: String(Math.floor(Math.random() * 999) + 1),
    הערות: pick(NOTES_TEMPLATES),
    event_id: eventId,
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: timestamp,
    source: "load-test-seed",
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 499;

async function seedResidents(count, useEmulator) {
  const mode = useEmulator ? `emulator (${EMULATOR_HOST})` : "production";
  console.log(`\n🌱  Seeding ${count} residents → ${mode}\n`);

  if (useEmulator) {
    process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  }

  admin.initializeApp({ projectId: PROJECT_ID });
  const db = admin.firestore();

  const residentsRef = db.collection("residents");
  const eventId = `load-test-${new Date().toISOString().slice(0, 10)}`;
  const startTime = Date.now();

  let written = 0;

  for (let batchStart = 0; batchStart < count; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, count);
    const batch = db.batch();

    for (let i = batchStart; i < batchEnd; i++) {
      const resident = generateResident(i, eventId);
      const docRef = residentsRef.doc();
      batch.set(docRef, { ...resident, id: docRef.id });
    }

    await batch.commit();
    written += batchEnd - batchStart;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = Math.round((written / count) * 100);
    process.stdout.write(
      `\r  ✅  ${written}/${count} written  (${pct}%)  —  ${elapsed}s elapsed`
    );
  }

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n\n🎉  Done!  Seeded ${written} residents in ${totalSec}s`);
  console.log(`   event_id : ${eventId}`);
  console.log(`   mode     : ${mode}\n`);
}

const args = process.argv.slice(2);
const count = parseInt(args.find((a) => /^\d+$/.test(a)) || "100", 10);
const useEmulator = !args.includes("--prod");

if (isNaN(count) || count < 1) {
  console.error("Usage: node load-test/seed-residents.js <count> [--prod]");
  process.exit(1);
}

seedResidents(count, useEmulator)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Seed failed:", err.message || err);
    process.exit(1);
  });
