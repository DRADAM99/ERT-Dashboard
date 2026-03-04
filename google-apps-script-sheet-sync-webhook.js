/**
 * Apps Script webhook sink for Firebase -> Google Sheet eventual sync.
 *
 * Expected POST JSON body:
 * {
 *   "secret": "...optional shared secret...",
 *   "updates": [
 *     {
 *       "residentId": "...",
 *       "status": "כולם בסדר",
 *       "phoneDigits972": "9725XXXXXXXX",
 *       "phoneE164": "+9725XXXXXXXX"
 *     }
 *   ]
 * }
 */

const SHEET_SYNC_CONFIG = {
  SHEET_NAME: "גיליון1",
  SHARED_SECRET: "CHANGE_ME_WITH_SHEET_SYNC_SHARED_SECRET",
  STATUS_HEADERS: ["סטטוס", "status"],
  UPDATED_AT_HEADERS: ["updated at", "Updated at", "updated_at", "עודכן"],
  PHONE_HEADERS: ["טלפון", "phone", "Phone", "טלפון נייד", "מספר טלפון", "טלפון סלולרי"],
};

function doPost(e) {
  try {
    const body = parseJsonBody_(e);
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (SHEET_SYNC_CONFIG.SHARED_SECRET &&
        SHEET_SYNC_CONFIG.SHARED_SECRET !== "CHANGE_ME_WITH_SHEET_SYNC_SHARED_SECRET" &&
        body.secret !== SHEET_SYNC_CONFIG.SHARED_SECRET) {
      return jsonResponse_({
        ok: false,
        error: "Unauthorized",
      });
    }

    if (!updates.length) {
      return jsonResponse_({
        ok: true,
        received: 0,
        applied: 0,
      });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_SYNC_CONFIG.SHEET_NAME);
    if (!sheet) {
      return jsonResponse_({
        ok: false,
        error: `Sheet not found: ${SHEET_SYNC_CONFIG.SHEET_NAME}`,
      });
    }

    const values = sheet.getDataRange().getValues();
    if (!values.length) {
      return jsonResponse_({
        ok: false,
        error: "Sheet is empty",
      });
    }

    const headers = values[0];
    const phoneCol = findHeaderIndex_(headers, SHEET_SYNC_CONFIG.PHONE_HEADERS);
    const statusCol = findHeaderIndex_(headers, SHEET_SYNC_CONFIG.STATUS_HEADERS);
    const updatedAtCol = findHeaderIndex_(headers, SHEET_SYNC_CONFIG.UPDATED_AT_HEADERS);

    if (phoneCol === -1) {
      return jsonResponse_({
        ok: false,
        error: "Phone column not found in sheet headers",
      });
    }

    const phoneToRow = {};
    for (let i = 1; i < values.length; i++) {
      const normalized = normalizeIsraeliPhone_(values[i][phoneCol]);
      if (normalized) {
        phoneToRow[normalized] = i + 1;
      }
    }

    let applied = 0;
    let unmatched = 0;

    updates.forEach((update) => {
      const normalized = normalizeIsraeliPhone_(
          update.phoneDigits972 || update.phoneE164 || update.phone || update["טלפון"] || "",
      );
      if (!normalized || !phoneToRow[normalized]) {
        unmatched++;
        return;
      }

      const rowIndex = phoneToRow[normalized];

      if (statusCol !== -1 && update.status) {
        sheet.getRange(rowIndex, statusCol + 1).setValue(update.status);
      }
      if (updatedAtCol !== -1) {
        sheet.getRange(rowIndex, updatedAtCol + 1).setValue(new Date());
      }

      applied++;
    });

    return jsonResponse_({
      ok: true,
      received: updates.length,
      applied,
      unmatched,
    });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: String(error),
    });
  }
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const content = String(e.postData.contents || "");
  if (!content.trim()) return {};
  try {
    return JSON.parse(content);
  } catch (error) {
    return {};
  }
}

function findHeaderIndex_(headers, candidates) {
  const normalizedHeaders = headers.map((h) => String(h || "").trim().toLowerCase());
  for (let i = 0; i < candidates.length; i++) {
    const idx = normalizedHeaders.indexOf(String(candidates[i]).trim().toLowerCase());
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeIsraeliPhone_(phoneInput) {
  if (!phoneInput) return "";
  let digits = String(phoneInput).replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("972") && digits.length === 12) {
    return /^9725\d{8}$/.test(digits) ? digits : "";
  }
  if (digits.startsWith("0") && digits.length === 10) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("5")) {
    digits = `972${digits}`;
  }
  return /^9725\d{8}$/.test(digits) ? digits : "";
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
}
