const functions = require("firebase-functions");
const admin = require("firebase-admin");
const twilio = require("twilio");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const runtimeConfig = (() => {
  try {
    return functions.config();
  } catch (error) {
    return {};
  }
})();

const PHONE_FIELDS = [
  "טלפון",
  "phone",
  "Phone",
  "phoneNumber",
  "phone_number",
  "mobile",
  "מספר טלפון",
  "טלפון נייד",
  "טלפון סלולרי",
];

const RESIDENT_SHEET_SYNC_FIELDS = [
  "סטטוס",
  "currentStatus",
  "lastReplyMessage",
  "lastReplyAt",
  "messagePipelineState",
  "twilioDeliveryStatus",
  "messageSentSuccess",
  "updatedAt",
];

function getNestedConfig(path, fallback = "") {
  let current = runtimeConfig;
  for (const segment of path) {
    if (!current || typeof current !== "object") {
      return fallback;
    }
    current = current[segment];
  }
  return current !== undefined && current !== null ? current : fallback;
}

function getConfigValue(envKey, runtimePath, fallback = "") {
  const envValue = process.env[envKey];
  if (envValue !== undefined && envValue !== "") {
    return envValue;
  }
  return getNestedConfig(runtimePath, fallback);
}

function getTwilioConfig() {
  return {
    accountSid: getConfigValue("TWILIO_ACCOUNT_SID", ["twilio", "account_sid"]),
    authToken: getConfigValue("TWILIO_AUTH_TOKEN", ["twilio", "auth_token"]),
    messagingServiceSid: getConfigValue("TWILIO_MESSAGING_SERVICE_SID", ["twilio", "messaging_service_sid"]),
    contentSid: getConfigValue("TWILIO_CONTENT_SID", ["twilio", "content_sid"]),
    fallbackBody: getConfigValue("TWILIO_FALLBACK_BODY", ["twilio", "fallback_body"]),
    statusCallbackUrl: getConfigValue("TWILIO_STATUS_CALLBACK_URL", ["twilio", "status_callback_url"]),
  };
}

function getPipelineSecret() {
  return getConfigValue("APP_SCRIPT_SHARED_SECRET", ["pipeline", "app_script_secret"]);
}

function getSheetSyncConfig() {
  return {
    webhookUrl: getConfigValue("SHEET_SYNC_WEBHOOK_URL", ["sheets", "sync_webhook_url"]),
    sharedSecret: getConfigValue("SHEET_SYNC_SHARED_SECRET", ["sheets", "sync_shared_secret"]),
  };
}

function parseRawPayload(rawValue) {
  if (!rawValue) return {};
  const asString = Buffer.isBuffer(rawValue) ? rawValue.toString("utf8") : String(rawValue);
  if (!asString.trim()) return {};

  try {
    return JSON.parse(asString);
  } catch (jsonError) {
    const parsed = {};
    const params = new URLSearchParams(asString);
    for (const [key, value] of params.entries()) {
      parsed[key] = value;
    }
    return parsed;
  }
}

function parseRequestPayload(req) {
  const payload = {};
  if (req.query && typeof req.query === "object") {
    Object.assign(payload, req.query);
  }
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    Object.assign(payload, req.body);
  } else if (typeof req.body === "string") {
    Object.assign(payload, parseRawPayload(req.body));
  }

  if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
    Object.assign(payload, parseRawPayload(req.rawBody));
  }
  return payload;
}

function isTruthyFlag(value) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function setCorsHeaders(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,X-App-Script-Secret");
}

function verifyPipelineSecret(req, payload) {
  const expectedSecret = getPipelineSecret();
  if (!expectedSecret) return true;
  const providedSecret = req.get("x-app-script-secret") ||
    payload.secret ||
    payload.sharedSecret ||
    "";
  return expectedSecret === providedSecret;
}

function normalizeIsraeliPhone(phoneInput) {
  if (!phoneInput) return null;
  let digits = String(phoneInput).replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("972") && digits.length === 12) {
    return /^9725\d{8}$/.test(digits) ? {
      digits972: digits,
      e164: `+${digits}`,
    } : null;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("5")) {
    digits = `972${digits}`;
  }

  if (!/^9725\d{8}$/.test(digits)) return null;
  return {
    digits972: digits,
    e164: `+${digits}`,
  };
}

function extractResidentPhone(resident) {
  if (!resident || typeof resident !== "object") return null;
  for (const field of PHONE_FIELDS) {
    if (resident[field]) return resident[field];
  }
  return null;
}

function mapInboundReplyToStatus(replyText) {
  const text = String(replyText || "").toLowerCase();
  if (/(4|זקוקים|סיוע|help|urgent)/i.test(text)) return "זקוקים לסיוע";
  if (/(1|בסדר|הכל בסדר|כולם בסדר|ok|okay|fine|טוב)/i.test(text)) return "כולם בסדר";
  if (/(2|לא בטוח|לא יודע|unsure|unknown|don't know)/i.test(text)) return "לא בטוח";
  return "תגובה התקבלה";
}

function mapTwilioDeliveryState(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "delivered") return "delivered";
  if (normalized === "read") return "read";
  if (normalized === "failed" || normalized === "undelivered") return "failed";
  if (normalized === "sent" || normalized === "queued" || normalized === "accepted" || normalized === "scheduled") {
    return "sent_to_twilio";
  }
  return "unknown";
}

function toSafeError(error) {
  return {
    message: error && error.message ? error.message : String(error),
    code: error && error.code ? error.code : "",
  };
}

function hasRelevantResidentChange(beforeData, afterData) {
  if (!beforeData) return true;
  return RESIDENT_SHEET_SYNC_FIELDS.some((field) => {
    const beforeValue = beforeData[field] === undefined ? null : beforeData[field];
    const afterValue = afterData[field] === undefined ? null : afterData[field];
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
}

function buildSheetSyncPayload(residentId, residentData) {
  const phone = normalizeIsraeliPhone(extractResidentPhone(residentData));
  return {
    residentId,
    status: residentData["סטטוס"] || residentData.currentStatus || "",
    firstName: residentData["שם פרטי"] || "",
    lastName: residentData["שם משפחה"] || "",
    phoneDigits972: phone ? phone.digits972 : "",
    phoneE164: phone ? phone.e164 : "",
    sourceUpdatedAt: new Date().toISOString(),
  };
}

function createTwilioClient() {
  const config = getTwilioConfig();
  const missing = [];
  if (!config.accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!config.authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!config.messagingServiceSid) missing.push("TWILIO_MESSAGING_SERVICE_SID");
  if (!config.contentSid && !config.fallbackBody) {
    missing.push("TWILIO_CONTENT_SID or TWILIO_FALLBACK_BODY");
  }

  if (missing.length) {
    const error = new Error(`Missing Twilio configuration: ${missing.join(", ")}`);
    error.code = "CONFIG_MISSING";
    throw error;
  }

  return {
    client: twilio(config.accountSid, config.authToken),
    config,
  };
}

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

      const tokensSnap = await db.collection(`users/${userId}/fcmTokens`).get();

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
          if (!error) return;
          console.error("Failure sending notification to", tokens[index], error);
          if (error.code === "messaging/invalid-registration-token" ||
              error.code === "messaging/registration-token-not-registered") {
            db.collection(`users/${userId}/fcmTokens`).doc(tokens[index]).delete();
          }
        });
      } catch (error) {
        console.error("Error sending message:", error);
      }
      return null;
    });

exports.triggerGreenEyesCampaign = functions
    .runWith({timeoutSeconds: 540, memory: "1GB"})
    .https.onRequest(async (req, res) => {
      setCorsHeaders(res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "GET" && req.method !== "POST") {
        res.status(405).json({ok: false, error: "Method not allowed"});
        return;
      }

      const payload = parseRequestPayload(req);
      if (!verifyPipelineSecret(req, payload)) {
        res.status(401).json({ok: false, error: "Unauthorized"});
        return;
      }

      try {
        const eventId = payload.eventId || payload.event_id || "";
        const dryRun = isTruthyFlag(payload.dryRun || payload.dry_run);
        const limitValue = Number(payload.limit || 0);
        const targetLimit = Number.isFinite(limitValue) && limitValue > 0 ? Math.floor(limitValue) : null;
        const campaignType = payload.campaignType || "green_eyes";
        const requestedContentSid = payload.contentSid || payload.content_sid || "";

        const twilioConfig = getTwilioConfig();
        const contentSid = requestedContentSid || twilioConfig.contentSid || "";
        if (!contentSid && !twilioConfig.fallbackBody) {
          res.status(500).json({
            ok: false,
            error: "Missing TWILIO_CONTENT_SID or TWILIO_FALLBACK_BODY",
          });
          return;
        }

        let residentQuery = db.collection("residents");
        if (eventId) {
          residentQuery = residentQuery.where("event_id", "==", eventId);
        }
        const residentsSnapshot = await residentQuery.get();

        const candidates = [];
        let skippedNoPhone = 0;
        residentsSnapshot.forEach((doc) => {
          const residentData = doc.data();
          const normalizedPhone = normalizeIsraeliPhone(extractResidentPhone(residentData));
          if (!normalizedPhone) {
            skippedNoPhone++;
            return;
          }
          candidates.push({
            residentId: doc.id,
            residentData,
            normalizedPhone,
          });
        });

        const finalCandidates = targetLimit ? candidates.slice(0, targetLimit) : candidates;
        if (dryRun) {
          res.status(200).json({
            ok: true,
            dryRun: true,
            totalResidents: residentsSnapshot.size,
            eligibleResidents: candidates.length,
            queuedResidents: finalCandidates.length,
            skippedNoPhone,
          });
          return;
        }

        const campaignRef = db.collection("messageCampaigns").doc();
        await campaignRef.set({
          campaignType,
          eventId: eventId || null,
          state: "queueing",
          createdAt: FieldValue.serverTimestamp(),
          requestedBy: payload.requestedBy || "apps_script",
          metadata: {
            source: payload.source || "apps_script_trigger",
            requestedContentSid: contentSid || null,
          },
        }, {merge: true});

        let batch = db.batch();
        let writesInBatch = 0;
        let queuedCount = 0;

        for (const candidate of finalCandidates) {
          const queueRef = db.collection("twilioOutboundQueue").doc();
          batch.set(queueRef, {
            campaignId: campaignRef.id,
            campaignType,
            eventId: eventId || null,
            residentId: candidate.residentId,
            residentName: `${candidate.residentData["שם פרטי"] || ""} ${candidate.residentData["שם משפחה"] || ""}`.trim(),
            phoneDigits972: candidate.normalizedPhone.digits972,
            phoneE164: candidate.normalizedPhone.e164,
            contentSid: contentSid || null,
            contentVariables: payload.contentVariables || {},
            state: "queued",
            attempts: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: "campaign_trigger",
            statusCallbackUrl: twilioConfig.statusCallbackUrl || null,
          });
          writesInBatch++;
          queuedCount++;

          if (writesInBatch >= 450) {
            await batch.commit();
            batch = db.batch();
            writesInBatch = 0;
          }
        }

        if (writesInBatch > 0) {
          await batch.commit();
        }

        await campaignRef.set({
          state: "queued",
          totalResidents: residentsSnapshot.size,
          eligibleResidents: candidates.length,
          queuedResidents: queuedCount,
          skippedNoPhone,
          queueCompletedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        res.status(200).json({
          ok: true,
          campaignId: campaignRef.id,
          totalResidents: residentsSnapshot.size,
          eligibleResidents: candidates.length,
          queuedResidents: queuedCount,
          skippedNoPhone,
        });
      } catch (error) {
        console.error("triggerGreenEyesCampaign failed", error);
        res.status(500).json({
          ok: false,
          error: toSafeError(error).message,
        });
      }
    });

exports.processOutboundQueue = functions
    .runWith({timeoutSeconds: 120, memory: "512MB", maxInstances: 200})
    .firestore.document("twilioOutboundQueue/{messageId}")
    .onCreate(async (snapshot) => {
      const messageData = snapshot.data() || {};
      if (messageData.state !== "queued") return null;

      try {
        const {client, config} = createTwilioClient();
        const requestPayload = {
          to: `whatsapp:${messageData.phoneE164}`,
          messagingServiceSid: messageData.messagingServiceSid || config.messagingServiceSid,
        };
        const effectiveContentSid = messageData.contentSid || config.contentSid;
        if (effectiveContentSid) {
          requestPayload.contentSid = effectiveContentSid;
          if (messageData.contentVariables && Object.keys(messageData.contentVariables).length > 0) {
            requestPayload.contentVariables = JSON.stringify(messageData.contentVariables);
          }
        } else {
          requestPayload.body = config.fallbackBody;
        }

        const statusCallbackUrl = messageData.statusCallbackUrl || config.statusCallbackUrl;
        if (statusCallbackUrl) {
          requestPayload.statusCallback = statusCallbackUrl;
        }

        const twilioResponse = await client.messages.create(requestPayload);
        await snapshot.ref.set({
          state: "sent_to_twilio",
          twilioMessageSid: twilioResponse.sid,
          twilioInitialStatus: twilioResponse.status || "queued",
          sentToTwilioAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          attempts: FieldValue.increment(1),
        }, {merge: true});

        if (messageData.residentId) {
          await db.collection("residents").doc(messageData.residentId).set({
            lastCampaignId: messageData.campaignId || null,
            lastOutboundQueueId: snapshot.id,
            lastTwilioMessageSid: twilioResponse.sid,
            messagePipelineState: "sent_to_twilio",
            messageSentAt: FieldValue.serverTimestamp(),
            messageSentSuccess: true,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }

        if (messageData.campaignId) {
          await db.collection("messageCampaigns").doc(messageData.campaignId).set({
            processedCount: FieldValue.increment(1),
            sentToTwilioCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      } catch (error) {
        console.error("processOutboundQueue failed", snapshot.id, error);
        await snapshot.ref.set({
          state: "failed",
          lastError: toSafeError(error),
          updatedAt: FieldValue.serverTimestamp(),
          attempts: FieldValue.increment(1),
        }, {merge: true});

        if (messageData.residentId) {
          await db.collection("residents").doc(messageData.residentId).set({
            messagePipelineState: "failed",
            messageSentSuccess: false,
            messageSentError: toSafeError(error).message,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }

        if (messageData.campaignId) {
          await db.collection("messageCampaigns").doc(messageData.campaignId).set({
            processedCount: FieldValue.increment(1),
            failedToSendCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      }

      return null;
    });

exports.twilioStatusWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const payload = parseRequestPayload(req);
    const messageSid = payload.MessageSid || payload.SmsSid || payload.messageSid;
    const messageStatus = payload.MessageStatus || payload.SmsStatus || payload.status || "";

    if (!messageSid) {
      res.status(200).send("OK");
      return;
    }

    const queueSnapshot = await db.collection("twilioOutboundQueue")
        .where("twilioMessageSid", "==", messageSid)
        .limit(1)
        .get();

    if (queueSnapshot.empty) {
      await db.collection("twilioStatusUnmatched").add({
        messageSid,
        messageStatus: messageStatus || "",
        payload,
        createdAt: FieldValue.serverTimestamp(),
      });
      res.status(200).send("OK");
      return;
    }

    const queueDoc = queueSnapshot.docs[0];
    const queueData = queueDoc.data();
    const deliveryState = mapTwilioDeliveryState(messageStatus);

    await queueDoc.ref.set({
      twilioDeliveryStatus: messageStatus,
      twilioDeliveryState: deliveryState,
      twilioStatusPayload: payload,
      twilioStatusUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      state: deliveryState === "unknown" ? queueData.state : deliveryState,
    }, {merge: true});

    if (queueData.residentId) {
      const residentUpdate = {
        twilioDeliveryStatus: messageStatus,
        twilioDeliveryState: deliveryState,
        twilioStatusUpdatedAt: FieldValue.serverTimestamp(),
        messagePipelineState: deliveryState,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (deliveryState === "failed") {
        residentUpdate.messageSentSuccess = false;
      }
      await db.collection("residents").doc(queueData.residentId).set(residentUpdate, {merge: true});
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("twilioStatusWebhook failed", error);
    res.status(500).send("ERROR");
  }
});

exports.twilioInboundWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const payload = parseRequestPayload(req);
    const from = payload.From || payload.from || "";
    const body = payload.Body || payload.body || "";
    const normalizedPhone = normalizeIsraeliPhone(from);

    if (!normalizedPhone || !body) {
      res.status(200).type("text/xml").send("<Response></Response>");
      return;
    }

    let residentId = null;
    const indexDoc = await db.collection("residentPhoneIndex")
        .doc(normalizedPhone.digits972)
        .get();
    if (indexDoc.exists) {
      const indexData = indexDoc.data() || {};
      residentId = indexData.primaryResidentId || ((indexData.residentIds || [])[0] || null);
    }

    if (!residentId) {
      await db.collection("twilioInboundUnmatched").add({
        from,
        normalizedPhone: normalizedPhone.digits972,
        body,
        payload,
        createdAt: FieldValue.serverTimestamp(),
      });
      res.status(200).type("text/xml").send("<Response></Response>");
      return;
    }

    const mappedStatus = mapInboundReplyToStatus(body);
    await db.collection("residents").doc(residentId).set({
      "סטטוס": mappedStatus,
      currentStatus: mappedStatus,
      lastReplyMessage: body,
      lastReplyAt: FieldValue.serverTimestamp(),
      replyReceived: true,
      messagePipelineState: "reply_received",
      statusHistory: FieldValue.arrayUnion({
        source: "twilio_inbound",
        replyMessage: body,
        mappedStatus,
        timestamp: new Date().toISOString(),
      }),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

    await db.collection("twilioInboundLogs").add({
      residentId,
      from,
      normalizedPhone: normalizedPhone.digits972,
      body,
      mappedStatus,
      payload,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(200).type("text/xml").send("<Response></Response>");
  } catch (error) {
    console.error("twilioInboundWebhook failed", error);
    res.status(500).type("text/xml").send("<Response></Response>");
  }
});

exports.upsertResidentPhoneIndex = functions.firestore
    .document("residents/{residentId}")
    .onWrite(async (change, context) => {
      const residentId = context.params.residentId;
      const beforeData = change.before.exists ? change.before.data() : null;
      const afterData = change.after.exists ? change.after.data() : null;
      const oldNormalized = normalizeIsraeliPhone(extractResidentPhone(beforeData));
      const newNormalized = normalizeIsraeliPhone(extractResidentPhone(afterData));
      const writes = [];

      if (oldNormalized && (!newNormalized ||
          oldNormalized.digits972 !== newNormalized.digits972)) {
        writes.push(db.collection("residentPhoneIndex")
            .doc(oldNormalized.digits972)
            .set({
              residentIds: FieldValue.arrayRemove(residentId),
              updatedAt: FieldValue.serverTimestamp(),
            }, {merge: true}));
      }

      if (newNormalized) {
        writes.push(db.collection("residentPhoneIndex")
            .doc(newNormalized.digits972)
            .set({
              primaryResidentId: residentId,
              residentIds: FieldValue.arrayUnion(residentId),
              phoneE164: newNormalized.e164,
              updatedAt: FieldValue.serverTimestamp(),
            }, {merge: true}));

        if (change.after.exists &&
            (afterData.phoneNormalized !== newNormalized.digits972 ||
              afterData.phoneE164 !== newNormalized.e164)) {
          writes.push(change.after.ref.set({
            phoneNormalized: newNormalized.digits972,
            phoneE164: newNormalized.e164,
          }, {merge: true}));
        }
      } else if (change.after.exists &&
          (afterData.phoneNormalized || afterData.phoneE164)) {
        writes.push(change.after.ref.set({
          phoneNormalized: FieldValue.delete(),
          phoneE164: FieldValue.delete(),
        }, {merge: true}));
      }

      if (!writes.length) return null;
      await Promise.all(writes);
      return null;
    });

exports.enqueueResidentSheetSync = functions.firestore
    .document("residents/{residentId}")
    .onWrite(async (change, context) => {
      if (!change.after.exists) return null;
      const afterData = change.after.data() || {};
      const beforeData = change.before.exists ? change.before.data() : null;

      if (!hasRelevantResidentChange(beforeData, afterData)) return null;

      const payload = buildSheetSyncPayload(context.params.residentId, afterData);
      await db.collection("residentSheetSyncQueue").add({
        state: "pending",
        attempts: 0,
        residentId: context.params.residentId,
        payload,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return null;
    });

async function markSheetQueueFailure(docs, errorMessage) {
  const batch = db.batch();
  docs.forEach((doc) => {
    batch.set(doc.ref, {
      state: "pending",
      attempts: FieldValue.increment(1),
      lastError: String(errorMessage || "unknown error"),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  await batch.commit();
}

exports.flushResidentSheetSyncQueue = functions
    .runWith({timeoutSeconds: 540, memory: "512MB"})
    .pubsub.schedule("every 2 minutes")
    .timeZone("Asia/Jerusalem")
    .onRun(async () => {
      const {webhookUrl, sharedSecret} = getSheetSyncConfig();
      if (!webhookUrl) {
        console.log("SHEET_SYNC_WEBHOOK_URL is missing; skipping queue flush");
        return null;
      }

      const queueSnapshot = await db.collection("residentSheetSyncQueue")
          .where("state", "==", "pending")
          .limit(100)
          .get();

      if (queueSnapshot.empty) {
        return null;
      }

      const docs = queueSnapshot.docs;
      const updates = docs.map((doc) => {
        const data = doc.data();
        return {
          queueId: doc.id,
          ...data.payload,
        };
      });

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            secret: sharedSecret || "",
            updates,
          }),
        });

        if (!response.ok) {
          const responseText = await response.text();
          await markSheetQueueFailure(docs, `HTTP ${response.status}: ${responseText}`);
          return null;
        }

        const batch = db.batch();
        docs.forEach((doc) => {
          batch.set(doc.ref, {
            state: "synced",
            syncedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        });
        await batch.commit();
      } catch (error) {
        await markSheetQueueFailure(docs, toSafeError(error).message);
      }

      return null;
    });

