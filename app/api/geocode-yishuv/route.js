import { NextResponse } from "next/server";

/**
 * OpenStreetMap Nominatim geocoding for Israeli יישוב names (Hebrew).
 * Prefer countrycodes=il; if empty (e.g. settlements OSM tags outside IL),
 * retry with a bounded viewbox over Israel and adjacent areas.
 * Nominatim usage policy requires a valid identifying User-Agent.
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  "ERT-Dashboard/1.0 (emergency response ops map; contact: ert-dashboard)";

/** Rough Israel + Judea/Samaria / Golan coverage (left,bottom,right,top). */
const ISRAEL_AREA_VIEWBOX = "34.15,29.45,35.95,33.45";

async function nominatimSearch(query, extraParams = {}) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "he");
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": NOMINATIM_USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const err = new Error(`Nominatim HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const results = await response.json();
  return Array.isArray(results) ? results : [];
}

function pickBest(results) {
  const best = results[0];
  if (!best) return null;
  const lat = Number(best.lat);
  const lng = Number(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    formattedAddress: best.display_name || "",
    placeId: best.place_id != null ? String(best.place_id) : null,
  };
}

async function geocodeYishuv(q) {
  const query = String(q || "").trim();
  if (!query) {
    return NextResponse.json({ error: "חסר שם יישוב" }, { status: 400 });
  }

  try {
    let results = await nominatimSearch(query, { countrycodes: "il" });
    if (!results.length) {
      // OSM often tags West Bank settlements outside country=IL
      results = await nominatimSearch(query, {
        viewbox: ISRAEL_AREA_VIEWBOX,
        bounded: "1",
      });
    }

    const match = pickBest(results);
    if (!match) {
      return NextResponse.json(
        { error: "לא נמצא יישוב בישראל עבור השם שהוזן" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...match,
      formattedAddress: match.formattedAddress || query,
    });
  } catch (err) {
    console.error("Nominatim geocode failed", err);
    return NextResponse.json(
      { error: "שגיאה בפנייה לשירות המיקומים" },
      { status: 502 }
    );
  }
}

export async function GET(req) {
  try {
    const q = req.nextUrl.searchParams.get("q");
    return await geocodeYishuv(q);
  } catch (err) {
    console.error("geocode-yishuv GET failed", err);
    return NextResponse.json({ error: "שגיאה פנימית באימות מיקום" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = body.q ?? body.query ?? body.yishuvName;
    return await geocodeYishuv(q);
  } catch (err) {
    console.error("geocode-yishuv POST failed", err);
    return NextResponse.json({ error: "שגיאה פנימית באימות מיקום" }, { status: 500 });
  }
}
