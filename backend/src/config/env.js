import dotenv from "dotenv";

dotenv.config();

const requiredVariables = ["JWT_SECRET", "DATABASE_URL"];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(
      `Missing required environment variable: ${variable}`
    );
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters.");
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  backendUrl: (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, ""),
  frontendUrl: (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, ""),

  allowedEmailDomains: (
    process.env.ALLOWED_EMAIL_DOMAINS || ""
  )
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),

  // Institutional OIDC / Google Workspace SSO settings
  sso: {
    enabled: Boolean(
      process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET
    ),
    issuer: process.env.OIDC_ISSUER || "https://accounts.google.com",
    clientId: process.env.OIDC_CLIENT_ID || "",
    clientSecret: process.env.OIDC_CLIENT_SECRET || "",
    redirectUri:
      process.env.OIDC_REDIRECT_URI ||
      `${(process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "")}/api/auth/sso/callback`,
    scopes: process.env.OIDC_SCOPES || "openid email profile",
  },

  // FR-08: Gemini AI summaries. The key is optional at startup so the rest of
  // the application keeps working without it; the Gemini service throws a
  // clear error only when a summary is actually requested.
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || "",
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    timeoutMs: Number(process.env.GEMINI_TIMEOUT_MS) || 25000,
    maxInputChars: Number(process.env.GEMINI_MAX_INPUT_CHARS) || 400000,
  },

  redis: {
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    workerConcurrency: Math.max(1, Number(process.env.SUMMARY_WORKER_CONCURRENCY) || 2),
    retryDelayMs: Math.max(250, Number(process.env.SUMMARY_RETRY_DELAY_MS) || 1500),
  },

  // FR-04: Session expiration & idle inactivity tracking
  session: {
    inactivityTimeoutMs:
      Number(process.env.SESSION_INACTIVITY_TIMEOUT_MS) || 30 * 60 * 1000, // 30 minutes of inactivity
    maxAgeMs:
      Number(process.env.SESSION_MAX_AGE_MS) || 8 * 60 * 60 * 1000, // 8 hours absolute max
  },
};
