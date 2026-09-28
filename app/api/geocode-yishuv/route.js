import { NextResponse } from "next/server";

/**
 * Reuses the Google Maps browser key from the live emergency-locator map script.
 * If Geocoding fails with REQUEST_DENIED, enable Geocoding API and allowlist the
 * ERT host (or relax key restrictions for server-side use) in Google Cloud Console.
 */
const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY || "AIzaSyCPukA3O3gdGwIkw2Rsd2tLiTsPWl3a6TU";

async function geocodeYishuv(q) {
  const query = String(q || "").trim();
  if (!query) {
    return NextResponse.json({ error: "חסר שם יישוב" }, { status: 400 });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("region", "il");
  url.searchParams.set("components", "country:IL");
  url.searchParams.set("language", "he");
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return NextResponse.json(
      { error: "שגיאה בפנייה לשירות המיקומים" },
      { status: 502 }
    );
  }

  const data = await response.json();

  if (data.status !== "OK") {
    if (data.status === "ZERO_RESULTS") {
      return NextResponse.json(
        { error: "לא נמצא יישוב בישראל עבור השם שהוזן" },
        { status: 404 }
      );
    }
    const hint =
      data.status === "REQUEST_DENIED"
        ? " — יש לאפשר Geocoding API ולהתאים הגבלות מפתח ב-Google Cloud"
        : "";
    return NextResponse.json(
      {
        error: `חיפוש המיקום נכשל (${data.status})${hint}`,
        status: data.status,
        message: data.error_message || null,
      },
      { status: 502 }
    );
  }

  const best = data.results?.[0];
  const location = best?.geometry?.location;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return NextResponse.json(
      { error: "תוצאת המיקום אינה תקינה" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    lat: location.lat,
    lng: location.lng,
    formattedAddress: best.formatted_address || query,
    placeId: best.place_id || null,
  });
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
