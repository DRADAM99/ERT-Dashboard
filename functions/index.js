const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

// ============================================================================
// Firestore logging helper — writes to greenEyesLog collection
// Visible in Firebase Console → Firestore → greenEyesLog
// ============================================================================
async function fsLog(eventId, level, message, data) {
  try {
    await db.collection("greenEyesLog").add({
      eventId: eventId || "system",
      level: level || "info", // "info" | "warn" | "error"
      message,
      data: data || null,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[fsLog] Failed to write log:", e.message);
  }
}

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
const REPLY_COLUMN_NAME = "תגובה";

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

/**
 * Batch-updates multiple cells in one Sheets API call.
 * updates: [{rowIndex, colIndex, value}, ...]
 */
async function batchUpdateSheetCells(sheetId, sheetName, updates) {
  if (!updates || updates.length === 0) return;
  const sheets = await getSheetsClient();
  const data = updates.map(({rowIndex, colIndex, value}) => ({
    range: `${sheetName}!${colIndexToLetter(colIndex)}${rowIndex}`,
    values: [[value]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {valueInputOption: "USER_ENTERED", data},
  });
}

/** Returns current Israel time as "DD.MM.YYYY HH:MM" */
function israelTime() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p = {};
  fmt.formatToParts(now).forEach(({type, value}) => { p[type] = value; });
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

/**
 * Appends a single log row to the "Script Log" tab in a Google Sheet.
 * Columns: זמן | אירוע | טלפון | תגובה | סטטוס | הערות
 * Never throws — errors are swallowed so logging never blocks the main flow.
 */
async function appendSheetLog(sheetId, {event, phone, body, status, notes}) {
  if (!sheetId) return;
  try {
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "Script Logs!A:F",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[israelTime(), event || "", phone || "", body || "", status || "", notes || ""]],
      },
    });
  } catch (err) {
    console.error("[SheetLog] Failed to append:", err.message);
  }
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
      await fsLog(eventId, "info", `Triggered — mode: ${mode}`);

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
        await fsLog(eventId, "error", `Missing config: ${missing.join(", ")}`);
        await eventRef.update({
          status: "error",
          error: `Missing configuration: ${missing.join(", ")}`,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      }

      // Update status to "reading_sheet"
      await eventRef.update({status: "reading_sheet"});
      await fsLog(eventId, "info", `Reading sheet: ${sheetId} / ${sheetName}`);

      // Step 1: Read residents from Google Sheet (fresh pull)
      let headers; let residents;
      try {
        const sheetData = await readResidentsFromSheet(sheetId, sheetName);
        headers = sheetData.headers;
        residents = sheetData.residents;
        console.log(`[GreenEyes] Read ${residents.length} residents from sheet`);
        await fsLog(eventId, "info", `Read ${residents.length} residents from sheet`);
      } catch (err) {
        console.error("[GreenEyes] Sheet read error:", err);
        await fsLog(eventId, "error", `Sheet read failed: ${err.message}`);
        await eventRef.update({
          status: "error",
          error: `Sheet read failed: ${err.message}`,
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return null;
      }

      if (residents.length === 0) {
        await fsLog(eventId, "warn", "No residents found in sheet");
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
      const replyIdx = headers.indexOf(REPLY_COLUMN_NAME);

      await db.doc("system/activeEmergency").set({
        mode,
        eventId,
        sheetId,
        sheetName,
        contentSid,
        statusColumnIndex: statusIdx,
        timestampColumnIndex: timestampIdx,
        replyColumnIndex: replyIdx,
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        activatedBy: eventData.triggeredBy || "system",
      });

      // Step 4: Send WhatsApp messages in parallel batches
      await eventRef.update({status: "sending_messages"});

      let sentCount = 0;
      let errorCount = 0;
      const errors = [];
      const sheetUpdates = []; // Collected for one batch write at the end
      const sendTime = israelTime();

      const client = getTwilioClient();
      const validResidents = residents.filter((r) => r.normalizedPhone);

      // Send 15 messages concurrently; pause 300ms between batches
      const SEND_BATCH_SIZE = 15;
      for (let i = 0; i < validResidents.length; i += SEND_BATCH_SIZE) {
        const batch = validResidents.slice(i, i + SEND_BATCH_SIZE);

        await Promise.all(batch.map(async (resident) => {
          const phone = resident.normalizedPhone;
          try {
            await client.messages.create({
              to: `whatsapp:+${phone}`,
              messagingServiceSid: messagingServiceSid,
              contentSid: contentSid,
            });
            sentCount++;
            // Collect sheet updates (status + send timestamp)
            if (statusIdx !== -1) {
              sheetUpdates.push({rowIndex: resident.rowIndex, colIndex: statusIdx, value: "הודעה נשלחה"});
            }
            if (timestampIdx !== -1) {
              sheetUpdates.push({rowIndex: resident.rowIndex, colIndex: timestampIdx, value: sendTime});
            }
          } catch (err) {
            errorCount++;
            errors.push({phone, row: resident.rowIndex, error: err.message});
            console.error(`[GreenEyes] Twilio error for ${phone}:`, err.message);
            await fsLog(eventId, "error", `Twilio error for +${phone}: ${err.message}`);
          }
        }));

        // Brief pause between batches to stay within Twilio rate limits
        if (i + SEND_BATCH_SIZE < validResidents.length) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }

      await fsLog(eventId, "info", `Sending done — sent: ${sentCount}, errors: ${errorCount}`);

      // Step 5: Batch-update sheet (one API call for all rows)
      if (sheetUpdates.length > 0) {
        try {
          await batchUpdateSheetCells(sheetId, sheetName, sheetUpdates);
          console.log(`[GreenEyes] Sheet batch-updated: ${sheetUpdates.length} cells`);
          await fsLog(eventId, "info", `Sheet batch-updated: ${sheetUpdates.length} cells`);
        } catch (sheetErr) {
          console.error("[GreenEyes] Sheet batch update error:", sheetErr.message);
          await fsLog(eventId, "error", `Sheet batch update failed: ${sheetErr.message}`);
        }
      }

      // Step 6: Update event status to complete
      await eventRef.update({
        status: "completed",
        sentCount,
        errorCount,
        errors: errors.slice(0, 20),
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`[GreenEyes] Complete. Sent: ${sentCount}, Errors: ${errorCount}`);
      await fsLog(eventId, "info", `Complete — sent: ${sentCount}, errors: ${errorCount}`, {sentCount, errorCount});
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
    .runWith({timeoutSeconds: 60, memory: "256MB", maxInstances: 100})
    .https.onRequest(async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
      }

      console.log("[TwilioWebhook] Received inbound message");

      // Debug: log full request details so we can see exactly what Studio sends
      console.log("[TwilioWebhook] Content-Type:", req.headers["content-type"]);
      console.log("[TwilioWebhook] Raw body keys:", JSON.stringify(Object.keys(req.body || {})));
      console.log("[TwilioWebhook] Raw body:", JSON.stringify(req.body));

      // Accept both form-encoded (Twilio direct) and JSON (Studio HTTP Request)
      // Also try lowercase field names as fallback
      const fromRaw = req.body.From || req.body.from || "";
      const body = req.body.Body || req.body.body || "";

      await fsLog(null, "info", `Webhook received — From: ${fromRaw}, Body: ${body}`);

      if (!fromRaw || !body) {
        console.warn("[TwilioWebhook] Missing From or Body");
        console.warn("[TwilioWebhook] Full body was:", JSON.stringify(req.body));
        await fsLog(null, "warn", `Webhook missing From or Body — body keys: ${JSON.stringify(Object.keys(req.body || {}))}`);
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }

      const phone = normalizePhone(fromRaw);
      console.log(`[TwilioWebhook] From: ${phone}, Body: ${body}`);

      // Read active emergency config
      const activeSnap = await db.doc("system/activeEmergency").get();
      if (!activeSnap.exists) {
        console.warn("[TwilioWebhook] No active emergency found");
        await fsLog(null, "warn", `No active emergency — reply from +${phone} ignored`);
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }

      const active = activeSnap.data();
      const mode = active.mode || "live";
      const activeEventId = active.eventId || null;
      const sheetId = active.sheetId;
      const sheetName = active.sheetName || "2025";
      const statusColIdx = active.statusColumnIndex;
      const timestampColIdx = active.timestampColumnIndex;
      const replyColIdx = active.replyColumnIndex;

      if (mode === "none") {
        console.warn("[TwilioWebhook] Emergency mode is 'none', ignoring");
        await fsLog(activeEventId, "warn", `Mode is 'none' — reply from +${phone} ignored`);
        res.status(200).type("text/xml").send("<Response></Response>");
        return;
      }

      // Map reply to status
      const mappedStatus = mapReplyToStatus(body);
      console.log(`[TwilioWebhook] Mapped status: ${mappedStatus}`);
      await fsLog(activeEventId, "info", `Reply from +${phone}: "${body}" → ${mappedStatus}`);

      // Find and update resident in Firestore
      const residentId = "resident_" + phone;
      const residentRef = db.collection("residents").doc(residentId);
      const residentSnap = await residentRef.get();

      let rowIndex = null;
      let residentFound = false;

      if (residentSnap.exists) {
        rowIndex = residentSnap.data().rowIndex;
        await residentRef.update({
          [STATUS_COLUMN_NAME]: mappedStatus,
          lastReply: body,
          lastReplyAt: admin.firestore.FieldValue.serverTimestamp(),
          lastStatusChange: admin.firestore.FieldValue.serverTimestamp(),
        });
        residentFound = true;
        console.log(`[TwilioWebhook] Firestore updated: ${residentId}`);
        await fsLog(activeEventId, "info", `Firestore updated: ${residentId} → ${mappedStatus}`);
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
          residentFound = true;
          console.log(`[TwilioWebhook] Firestore updated via query: ${doc.id}`);
          await fsLog(activeEventId, "info", `Firestore updated (query): ${doc.id} → ${mappedStatus}`);
        } else {
          console.warn(`[TwilioWebhook] No resident found for phone: ${phone}`);
          await fsLog(activeEventId, "warn", `No resident found for +${phone}`);
        }
      }

      // ─── GOOGLE SHEET UPDATES (completed before responding) ──────────────
      // Single batch call keeps total time ~5-6s, within Studio's 25s timeout.
      // res.send() is at the very end so Firebase doesn't terminate early.
      if (!residentFound) {
        await appendSheetLog(sheetId, {
          event: "⚠️ תושב לא נמצא",
          phone,
          body,
          status: mappedStatus,
          notes: `טלפון ${phone} לא קיים ב-Firestore`,
        });
      } else if (sheetId && rowIndex) {
        try {
          const sheetUpdates = [];
          if (statusColIdx !== undefined && statusColIdx !== -1) {
            sheetUpdates.push({rowIndex, colIndex: statusColIdx, value: mappedStatus});
          }
          if (replyColIdx !== undefined && replyColIdx !== -1) {
            sheetUpdates.push({rowIndex, colIndex: replyColIdx, value: body});
          }
          if (timestampColIdx !== undefined && timestampColIdx !== -1) {
            sheetUpdates.push({rowIndex, colIndex: timestampColIdx, value: israelTime()});
          }
          if (sheetUpdates.length > 0) {
            await batchUpdateSheetCells(sheetId, sheetName, sheetUpdates);
            console.log(`[TwilioWebhook] Sheet batch-updated: row ${rowIndex} → ${mappedStatus}`);
            await fsLog(activeEventId, "info", `Sheet row ${rowIndex} batch-updated → ${mappedStatus}`);
          }

          await appendSheetLog(sheetId, {
            event: "✅ תגובה עודכנה",
            phone,
            body,
            status: mappedStatus,
            notes: `שורה ${rowIndex} — Firebase + גיליון עודכנו`,
          });
        } catch (sheetErr) {
          console.error("[TwilioWebhook] Sheet write-back error:", sheetErr.message);
          await fsLog(activeEventId, "error", `Sheet write-back failed: ${sheetErr.message}`);
          await appendSheetLog(sheetId, {
            event: "❌ שגיאת עדכון גיליון",
            phone,
            body,
            status: mappedStatus,
            notes: sheetErr.message,
          });
        }
      } else if (sheetId && !rowIndex) {
        await appendSheetLog(sheetId, {
          event: "✅ Firebase עודכן",
          phone,
          body,
          status: mappedStatus,
          notes: "rowIndex חסר — גיליון לא עודכן",
        });
      }

      // ─── RESPOND TO STUDIO ────────────────────────────────────────────────
      res.status(200).type("text/xml").send("<Response></Response>");
    });
