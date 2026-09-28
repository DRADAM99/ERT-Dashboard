export const MAP_CONFIG_DOC = { collection: "systemSettings", id: "mapConfig" };

/** Fallback when mapConfig is unset — matches live locator Tel Aviv defaults. */
export const DEFAULT_MAP_CENTER = {
  lat: 32.0853,
  lng: 34.7818,
  zoom: 12,
};

export const DEFAULT_YISHUV_ZOOM = 14;

export function normalizeMapConfig(data = {}) {
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);
  const zoom = Number(data?.zoom);
  return {
    yishuvName: typeof data?.yishuvName === "string" ? data.yishuvName : "",
    lat: Number.isFinite(lat) ? lat : DEFAULT_MAP_CENTER.lat,
    lng: Number.isFinite(lng) ? lng : DEFAULT_MAP_CENTER.lng,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_MAP_CENTER.zoom,
    geocodedAddress: typeof data?.geocodedAddress === "string" ? data.geocodedAddress : "",
  };
}

/** Same-origin ops map served from public/emergency-map/. */
export function buildEmergencyMapSrc(mapConfig) {
  const cfg = normalizeMapConfig(mapConfig);
  const params = new URLSearchParams({
    lat: String(cfg.lat),
    lng: String(cfg.lng),
    zoom: String(cfg.zoom),
  });
  return `/emergency-map/map.html?${params.toString()}`;
}
