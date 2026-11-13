/**
 * Wayfinder AI — Server Security, Header Hardening & Secret Masking Guardrails
 *
 * Guarantees that:
 * 1. Sensitive server API keys (sk-..., whsec_..., rk_live_..., Bearer tokens) are NEVER leaked to clients.
 * 2. Path traversal and probing attacks (.env, .git, licenses.json, etc.) are blocked with 403 Forbidden.
 * 3. HTTP responses carry strict security headers (HSTS, CSP-friendly, X-Content-Type-Options, etc.).
 * 4. Reflected parameters in HTML pages are strictly escaped against XSS.
 */

/**
 * Hardened Security Response Headers
 */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin"
};

/**
 * Detect sensitive, traversal, or exploit probe paths
 * @param {string} pathname
 * @returns {boolean}
 */
export function isProhibitedPath(pathname = "") {
  const clean = pathname.toLowerCase();
  return (
    pathname.includes("..") ||
    clean.includes(".env") ||
    clean.includes(".git") ||
    clean.includes("/server/data") ||
    clean.includes("passwd") ||
    clean.includes("shadow") ||
    clean.includes("id_rsa") ||
    clean.includes("id_ed25519") ||
    clean.includes("node_modules") ||
    clean.includes(".aws") ||
    clean.includes(".ssh") ||
    clean.includes("wp-") ||
    clean.includes(".php") ||
    (clean.endsWith(".json") && !clean.startsWith("/api"))
  );
}

/**
 * Strip any sensitive keys, tokens, or system filepaths from strings
 * @param {string} text
 * @returns {string}
 */
export function sanitizeSensitiveText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    // OpenAI secret keys
    .replace(/sk-[a-zA-Z0-9_\-]{20,}/g, "[REDACTED_API_KEY]")
    // Stripe secret / restricted keys
    .replace(/(?:sk|rk)_(?:live|test)_[a-zA-Z0-9_\-]{20,}/g, "[REDACTED_STRIPE_KEY]")
    // Stripe webhook secrets
    .replace(/whsec_[a-zA-Z0-9_\-]{20,}/g, "[REDACTED_WEBHOOK_SECRET]")
    // Bearer authorization tokens
    .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, "Bearer [REDACTED_TOKEN]")
    // Server filesystem absolute paths (macOS, Linux, container paths)
    .replace(/(?:\/(?:Users|home|app|Volumes|root|etc|var|usr)[a-zA-Z0-9_\.\-\/]*)/g, "[REDACTED_PATH]");
}

/**
 * Escape HTML special characters to prevent reflected XSS
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str = "") {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
