/**
 * Operational limits — single source of truth for the entire project.
 *
 * Imported by:
 *   functions/api/jobs/subscribe.js  — MAX_SUBSCRIBERS, EMAIL_MAX_LENGTH, RESEND_TIMEOUT_MS
 *   functions/api/jobs/verify.js     — VERIFY_EXPIRY_SECONDS
 *   job-digest.js                    — MAX_SUBSCRIBERS, MAX_JOBS_PER_EMAIL,
 *                                      JOB_RETENTION_DAYS, RESEND_TIMEOUT_MS,
 *                                      GITHUB_FETCH_TIMEOUT_MS
 *
 * See also functions/lib/rate-limit.js for per-endpoint request rate limits.
 */

// ── Resend free-tier quota ───────────────────────────────────────────────────
export const RESEND_DAILY_LIMIT      = 100;
export const EST_DAILY_VERIFICATIONS = 10;   // buffer reserved for verification emails
export const MAX_SUBSCRIBERS         = RESEND_DAILY_LIMIT - EST_DAILY_VERIFICATIONS; // 90

// ── Email content ────────────────────────────────────────────────────────────
export const MAX_JOBS_PER_EMAIL = 50;   // rows shown per section in digest
export const EMAIL_MAX_LENGTH   = 254;  // RFC 5321

// ── Network timeouts (ms) ────────────────────────────────────────────────────
export const RESEND_TIMEOUT_MS       =  8_000;
export const GITHUB_FETCH_TIMEOUT_MS = 30_000;

// ── Data retention ───────────────────────────────────────────────────────────
export const JOB_RETENTION_DAYS    = 120;
export const VERIFY_EXPIRY_SECONDS = 86_400; // 24 hours
