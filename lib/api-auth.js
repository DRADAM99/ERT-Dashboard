const AUTH_HEADER = "authorization";
const API_KEY_HEADER = "x-api-key";
const WEBHOOK_SECRET_ENV = "API_WEBHOOK_SECRET";

function getBearerToken(authHeader) {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

export function validateApiSecret(request) {
  const configuredSecret = process.env[WEBHOOK_SECRET_ENV];
  const isProduction = process.env.NODE_ENV === "production";

  if (!configuredSecret) {
    if (isProduction) {
      return {
        ok: false,
        status: 500,
        body: {
          error: "Server auth misconfiguration",
          details: `${WEBHOOK_SECRET_ENV} is missing`,
        },
      };
    }

    // Do not block local/dev workflows when the secret isn't configured.
    return { ok: true, bypassedInDev: true };
  }

  const apiKey = request.headers.get(API_KEY_HEADER);
  const bearerToken = getBearerToken(request.headers.get(AUTH_HEADER));
  const providedSecret = apiKey || bearerToken;

  if (!providedSecret || providedSecret !== configuredSecret) {
    return {
      ok: false,
      status: 401,
      body: { error: "Unauthorized" },
    };
  }

  return { ok: true };
}

export function getApiAuthHeaders() {
  return "Content-Type, Authorization, X-API-Key";
}
