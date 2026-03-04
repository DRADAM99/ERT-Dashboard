/**
 * Apps Script bridge: trigger Firebase Cloud Function campaign.
 *
 * This script keeps your current UI integration intact:
 * - /exec?triggerGreenInEyes=1
 * - /exec?triggerWhatsappOverList=1
 *
 * Instead of routing outbound traffic itself, it forwards a single
 * trigger request to Firebase Cloud Functions.
 */

const PIPELINE_CONFIG = {
  TRIGGER_URL: "https://REGION-PROJECT_ID.cloudfunctions.net/triggerGreenEyesCampaign",
  ABORT_URL: "", // Optional: add abort endpoint URL if you implement one.
  SHARED_SECRET: "CHANGE_ME_WITH_APP_SCRIPT_SHARED_SECRET",
};

function doPost(e) {
  return routeRequest_(e);
}

function doGet(e) {
  return routeRequest_(e);
}

function routeRequest_(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  if (params.triggerGreenInEyes === "1" || params.triggerWhatsappOverList === "1") {
    return triggerCampaign_(params);
  }

  if (params.triggerAbortSend === "1") {
    return triggerAbort_(params);
  }

  if (params.clearSystem === "1") {
    return jsonResponse_({
      ok: true,
      message: "clearSystem is no longer handled in Apps Script router.",
    });
  }

  return jsonResponse_({
    ok: true,
    message: "Firebase trigger bridge is running.",
  });
}

function triggerCampaign_(params) {
  if (!PIPELINE_CONFIG.TRIGGER_URL || PIPELINE_CONFIG.TRIGGER_URL.indexOf("REGION-PROJECT_ID") !== -1) {
    return jsonResponse_({
      ok: false,
      error: "Missing PIPELINE_CONFIG.TRIGGER_URL",
    });
  }

  const payload = {
    source: "apps_script_trigger",
    campaignType: "green_eyes",
    eventId: params.eventId || params.event_id || "",
    requestedBy: params.requestedBy || Session.getEffectiveUser().getEmail() || "apps_script",
    limit: params.limit || "",
    dryRun: params.dryRun === "1" || String(params.dryRun).toLowerCase() === "true",
  };

  try {
    const response = UrlFetchApp.fetch(PIPELINE_CONFIG.TRIGGER_URL, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: {
        "x-app-script-secret": PIPELINE_CONFIG.SHARED_SECRET,
      },
      payload: JSON.stringify(payload),
    });

    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    return jsonResponse_({
      ok: statusCode >= 200 && statusCode < 300,
      statusCode,
      response: tryParseJson_(responseText),
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error),
    });
  }
}

function triggerAbort_(params) {
  if (!PIPELINE_CONFIG.ABORT_URL) {
    return jsonResponse_({
      ok: false,
      error: "Abort endpoint is not configured (PIPELINE_CONFIG.ABORT_URL).",
    });
  }

  const payload = {
    source: "apps_script_trigger",
    campaignId: params.campaignId || "",
    reason: params.reason || "manual_abort",
  };

  try {
    const response = UrlFetchApp.fetch(PIPELINE_CONFIG.ABORT_URL, {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      headers: {
        "x-app-script-secret": PIPELINE_CONFIG.SHARED_SECRET,
      },
      payload: JSON.stringify(payload),
    });

    return jsonResponse_({
      ok: response.getResponseCode() >= 200 && response.getResponseCode() < 300,
      statusCode: response.getResponseCode(),
      response: tryParseJson_(response.getContentText()),
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error),
    });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
}

function tryParseJson_(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}
