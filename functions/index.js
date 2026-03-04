const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// ============================================================================
// EXISTING: Push notification on Firestore document create
// ============================================================================

exports.sendNotificationOnCreate = functions.firestore
    .document("users/{userId}/notifications/{notificationId}")
    .onCreate(async (snapshot, context) => {
      const {userId} = context.params;
      const notificationData = snapshot.data();

      const settingsRef = db.doc(`users/${userId}/notificationSettings/settings`);
      const settingsSnap = await settingsRef.get();
      const settings = settingsSnap.data() || {};

      let isEnabled = true;
      const {type, subType} = notificationData;
      if (type && subType && settings[type] && settings[type][subType]) {
        isEnabled = settings[type][subType].enabled;
      }

      if (!isEnabled) {
        console.log(`Notifications disabled for type: ${type}.${subType}`);
        return null;
      }

      const tokensSnap = await db
          .collection(`users/${userId}/fcmTokens`)
          .get();

      if (tokensSnap.empty) {
        console.log("No FCM tokens for user:", userId);
        return null;
      }

      const tokens = tokensSnap.docs.map((doc) => doc.id);

      const payload = {
        notification: {
          title: "New Notification",
          body: notificationData.message,
        },
        webpush: {
          notification: {
            icon: "/favicon.ico",
          },
          fcm_options: {
            link: notificationData.link || "/",
          },
        },
      };

      try {
        const response = await admin.messaging().sendToDevice(tokens, payload);
        console.log("Successfully sent message:", response);

        response.results.forEach((result, index) => {
          const error = result.error;
          if (error) {
            console.error("Failure sending notification to",
                tokens[index], error);
            if (error.code === "messaging/invalid-registration-token" ||
              error.code === "messaging/registration-token-not-registered") {
              db.collection(`users/${userId}/fcmTokens`)
                  .doc(tokens[index]).delete();
            }
          }
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
      return null;
    });

// ============================================================================
// NEW v7.0: Green Eyes — Firebase-Centered Architecture
// ============================================================================
//
// Cloud Function config (set via Firebase CLI):
//   firebase functions:config:set \
//     twilio.account_sid="ACxxxxxxxxx" \
//     twilio.auth_token="xxxxxxxxx" \
//     twilio.messaging_service_sid="MGxxxxxxxxx" \
//     mode.live.content_sid="HXxxxxxxxxx" \
//     mode.live.sheet_id="xxxxxxxxx" \
//     mode.live.sheet_name="2025" \
//     mode.drill.content_sid="HXxxxxxxxxx" \
//     mode.drill.sheet_id="xxxxxxxxx" \
//     mode.drill.sheet_name="2025"
//
// The Firebase service account email must have Editor access on both
// Google Sheets (live + drill). Find the email in Firebase Console →
// Project Settings → Service Accounts.
// ============================================================================

// Lazy-loaded clients to avoid cold-start overhead when not needed
let twilioClient = null;
let sheetsClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const twilio = require("twilio");
  const config = functions.config().twilio || {};
  if (!config.account_sid || !config.auth_token) {
    throw new Error("Twilio credentials not configured. Run: " +
        "firebase functions:config:set twilio.account_sid=... twilio.auth_token=...");
  }
  twilioClient = twilio(config.account_sid, config.auth_token);
  return twilioClient;
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const {google} = require("googleapis");
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheetsClient = google.sheets({version: "v4", auth});
  return sheetsClient;
}

// ===== HELPERS =====

const PHONE_COLUMNS = [
  "טלפון", "phone", "Phone", "מספר טלפון",
  "טלפון נייד", "מס טלפון", "טלפון סלולרי",
];
const STATUS_COLUMN_NAME = "סטטוס";
const TIMESTAMP_COLUMN_NAME = "updated at";

function normalizePhone(phone) {
  if (!phone) return "";
  let n = phone.toString().replace(/\D/g, "");
  n = n.replace(/^whatsapp/, "");
  if (n.startsWith("0")) n = "972" + n.substring(1);
  if (n.length === 9 && !n.startsWith("972")) n = "972" + n;
  return n;
}

function mapReplyToStatus(reply) {
  if (!reply) return "תגובה התקבלה";
  const text = reply.toString();
  if (/(4|זקוקים|סיוע|help)/i.test(text)) return "זקוקים לסיוע";
  if (/(1|בסדר|הכל בסדר|כולם בסדר|ok|okay|fine|טוב)/i.test(text)) return "כולם בסדר";
  if (/(2|לא בטוח|לא יודע|unsure|unknown|don't know)/i.test(text)) return "לא בטוח";
  return "תגובה התקבלה";
}

function findColumnIndex(headers, names) {
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

function colIndexToLetter(index) {
  let letter = "";
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode(65 + (i % 26)) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}

/**
 * Reads all residents from a Google Sheet.
 * @param {string} sheetId - Google Sheet ID
 * @param {string} sheetName - Tab name
 * @returns {Promise<{headers: string[], residents: Object[]}>}
 */
async function readResidentsFromSheet(sheetId, sheetName) {
  const sheets = await getSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: sheetName,
  });

  const rows = response.data.values || [];
  if (rows.length < 2) return {headers: [], residents: []};

  const headers = rows[0];
  const phoneIdx = findColumnIndex(headers, PHONE_COLUMNS);
  const residents = [];
  let consecutiveEmpty = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const isEmpty = row.every((cell) => !cell || String(cell).trim() === "");
    if (isEmpty) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 5) break;
      continue;
    }
    consecutiveEmpty = 0;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      if (headers[c]) obj[headers[c]] = row[c] || "";
    }
    obj.rowIndex = i + 1; // 1-based sheet row
    obj.normalizedPhone = phoneIdx !== -1 ? normalizePhone(row[phoneIdx]) : "";

    if (obj.normalizedPhone) {
      residents.push(obj);
    }
  }

  return {headers, residents};
}

/**
 * Updates a single cell in a Google Sheet.
 */
async function updateSheetCell(sheetId, sheetName, row, colIndex, value) {
  const sheets = await getSheetsClient();
  const colLetter = colIndexToLetter(colIndex);
  const range = `${sheetName}!${colLetter}${row}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: {values: [[value]]},
  });
}

// ============================================================================
// triggerGreenEyes — Firestore onCreate trigger
// ============================================================================
// Triggered when a new document is created in "emergencyEvents/{eventId}".
// Reads residents from the appropriate Google Sheet, populates Firestore,
// and sends WhatsApp messages via Twilio.
// ============================================================================

exports.triggerGreenEyes = functions
    .runWith({timeoutSeconds: 540, memory: "512MB"})
    .firestore.document("emergencyEvents/{eventId}")
    .onCreate(async (snapshot, context) => {
      const eventId = context.params.eventId;
      const eventData = snapshot.data();
      const eventRef = snapshot.ref;

      const mode = eventData.mode || "live";
      console.log(`[GreenEyes] Triggered: ${eventId}, mode: ${mode}`);

      // Resolve config: prefer event data, fall back to functions.config()
      const modeConfig = (functions.config().mode || {})[mode] || {};
      const sheetId = eventData.sheetId || modeConfig.sheet_id;
      const sheetName = eventData.sheetName || modeConfig.sheet_name || "2025";
      const contentSid = eventData.contentSid || modeConfig.content_sid;
      const twilioConfig = functions.config().twilio || {};
      const messagingServiceSid = twilioConfig.messaging_service_sid;

      if (!sheetId || !contentSid || !messagingServiceSid) {
        const missing = [];
        if (!sheetId) missing.push("sheetId");
        if (!contentSid) missing.push("contentSid");
        if (!messagingServiceSid) missing.push("messagingServiceSid");
        console.error(`[GreenEyes] Missing config: ${missing.join(", ")}`);
        await eventRef.update({
          status: "error",
          error: `Missing configuration: ${missing.join(", ")}`,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      }

      // Update status to "reading_sheet"
      await eventRef.update({status: "reading_sheet"});

      // Step 1: Read residents from Google Sheet (fresh pull)
      let headers; let residents;
      try {
        const sheetData = await readResidentsFromSheet(sheetId, sheetName);
        headers = sheetData.headers;
        residents = sheetData.residents;
        console.log(`[GreenEyes] Read ${residents.length} residents from sheet`);
      } catch (err) {
        console.error("[GreenEyes] Sheet read error:", err);
        await eventRef.update({
          status: "error",
          error: `Sheet read failed: ${err.message}`,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      }

      if (residents.length === 0) {
        await eventRef.update({
          status: "error",
          error: "No residents found in sheet",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      }

      // Step 2: Populate Firestore residents collection (batch writes)
      await eventRef.update({
        status: "populating_firestore",
        totalResidents: residents.length,
      });

      const BATCH_SIZE = 450; // Firestore batch limit is 500
      for (let i = 0; i < residents.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = residents.slice(i, i + BATCH_SIZE);

        for (const resident of chunk) {
          const docId = "resident_" + resident.normalizedPhone;
          const ref = db.collection("residents").doc(docId);
          batch.set(ref, {
            ...resident,
            syncedAt: admin.firestore.FieldValue.serverTimestamp(),
            source: "google_sheets",
            mode: mode,
          }, {merge: true});
        }

        await batch.commit();
        console.log(`[GreenEyes] Firestore batch ${Math.floor(i / BATCH_SIZE) + 1} committed`);
      }

      // Step 3: Set system/activeEmergency for webhook lookups
      const statusIdx = headers.indexOf(STATUS_COLUMN_NAME);
      const timestampIdx = headers.indexOf(TIMESTAMP_COLUMN_NAME);

      await db.doc("system/activeEmergency").set({
        mode,
        eventId,
        sheetId,
        sheetName,
        contentSid,
        statusColumnIndex: statusIdx,
        timestampColumnIndex: timestampIdx,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        activatedBy: eventData.triggeredBy || "system",
      });

      // Step 4: Send WhatsApp messages via Twilio
      await eventRef.update({status: "sending_messages"});

      let sentCount = 0;
      let errorCount = 0;
      const errors = [];

      const client = getTwilioClient();

      for (let i = 0; i < residents.length; i++) {
        const resident = residents[i];
        const phone = resident.normalizedPhone;
        if (!phone) continue;

        try {
          await client.messages.create({
            to: `whatsapp:+${phone}`,
            messagingServiceSid: messagingServiceSid,
            contentSid: contentSid,
          });
          sentCount++;

          // Update sheet status to "הודעה נשלחה" if status column exists
          if (statusIdx !== -1) {
            try {
              await updateSheetCell(
                  sheetId, sheetName,
                  resident.rowIndex, statusIdx,
                  "הודעה נשלחה",
              );
            } catch (sheetErr) {
              console.warn(`[GreenEyes] Sheet update failed for row ${resident.rowIndex}:`, sheetErr.message);
            }
          }
        } catch (err) {
          errorCount++;
          errors.push({phone, row: resident.rowIndex, error: err.message});
          console.error(`[GreenEyes] Twilio error for ${phone}:`, err.message);
        }

        // Rate limiting: pause every 10 messages
        if (i > 0 && i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      // Step 5: Update event status to complete
      await eventRef.update({
        status: "completed",
        sentCount,
        errorCount,
        errors: errors.slice(0, 20), // Keep first 20 errors
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[GreenEyes] Complete. Sent: ${sentCount}, Errors: ${errorCount}`);
      return null;
    });

// ============================================================================
// handleTwilioWebhook — HTTP endpoint for Twilio inbound messages
// ============================================================================
// Twilio sends POST with form-encoded: From, Body, To, MessageSid, etc.
// This function:
//   1. Reads the active emergency mode from system/activeEmergency
//   2. Maps the reply text to a status
//   3. Updates the resident doc in Firestore
//   4. Writes the status back to the correct Google Sheet
//   5. Returns a TwiML response
//
// Twilio webhook URL (after deploy):
//   https://us-central1-emergency-dashboard-a3842.cloudfunctions.net/handleTwilioWebhook
// ============================================================================

exports.handleTwilioWebhook = functions
    .runWith({timeoutSeconds: 60, memory: "256MB"})
    .https.onRequest(async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      console.log("[TwilioWebhook] Received inbound message");

      // Parse parameters (Twilio sends application/x-www-form-urlencoded)
      const fromRaw = req.body.From || "";
      const body = req.body.Body || "";

      if (!fromRaw || !body) {
        console.warn("[TwilioWebhook] Missing From or Body");
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }

      const phone = normalizePhone(fromRaw);
      console.log(`[TwilioWebhook] From: ${phone}, Body: ${body}`);

      // Read active emergency config
      const activeSnap = await db.doc("system/activeEmergency").get();
      if (!activeSnap.exists) {
        console.warn("[TwilioWebhook] No active emergency found");
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }

      const active = activeSnap.data();
      const mode = active.mode || "live";
      const sheetId = active.sheetId;
      const sheetName = active.sheetName || "2025";
      const statusColIdx = active.statusColumnIndex;
      const timestampColIdx = active.timestampColumnIndex;

      if (mode === "none") {
        console.warn("[TwilioWebhook] Emergency mode is 'none', ignoring");
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }

      // Map reply to status
      const mappedStatus = mapReplyToStatus(body);
      console.log(`[TwilioWebhook] Mapped status: ${mappedStatus}`);

      // Find and update resident in Firestore
      const residentId = "resident_" + phone;
      const residentRef = db.collection("residents").doc(residentId);
      const residentSnap = await residentRef.get();

      let rowIndex = null;

      if (residentSnap.exists) {
        rowIndex = residentSnap.data().rowIndex;
        await residentRef.update({
          [STATUS_COLUMN_NAME]: mappedStatus,
          lastReply: body,
          lastReplyAt: admin.firestore.FieldValue.serverTimestamp(),
          lastStatusChange: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[TwilioWebhook] Firestore updated: ${residentId}`);
      } else {
        // Fallback: query by normalizedPhone field
        const querySnap = await db.collection("residents")
            .where("normalizedPhone", "==", phone)
            .limit(1)
            .get();

        if (!querySnap.empty) {
          const doc = querySnap.docs[0];
          rowIndex = doc.data().rowIndex;
          await doc.ref.update({
            [STATUS_COLUMN_NAME]: mappedStatus,
            lastReply: body,
            lastReplyAt: admin.firestore.FieldValue.serverTimestamp(),
            lastStatusChange: admin.firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[TwilioWebhook] Firestore updated via query: ${doc.id}`);
        } else {
          console.warn(`[TwilioWebhook] No resident found for phone: ${phone}`);
        }
      }

      // Write back to Google Sheet
      if (sheetId && rowIndex) {
        try {
          // Update status column
          if (statusColIdx !== undefined && statusColIdx !== -1) {
            await updateSheetCell(sheetId, sheetName, rowIndex, statusColIdx, mappedStatus);
            console.log(`[TwilioWebhook] Sheet status updated: row ${rowIndex}`);
          }

          // Update timestamp column
          if (timestampColIdx !== undefined && timestampColIdx !== -1) {
            await updateSheetCell(
                sheetId, sheetName,
                rowIndex, timestampColIdx,
                new Date().toISOString(),
            );
          }
        } catch (sheetErr) {
          console.error("[TwilioWebhook] Sheet write-back error:", sheetErr.message);
        }
      }

      // Return empty TwiML (no auto-reply message)
      res.status(200).type("text/xml").send("<Response></Response>");
    });
