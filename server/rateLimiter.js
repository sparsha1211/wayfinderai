/**
 * Wayfinder AI — Sliding-Window Rate Limiter & Quota Engine
 * Enforces per-license and per-IP daily call limits to prevent API abuse.
 */

// In-memory request counters: { [key]: { count: number, resetAt: number, history: number[] } }
const usageStore = new Map();

/**
 * Clean up stale usage records every hour
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of usageStore.entries()) {
    if (now > data.resetAt) {
      usageStore.delete(key);
    }
  }
}, 60 * 60 * 1000).unref();

/**
 * Check and record an incoming request against the license limit
 * @param {string} licenseKey - The validated license key
 * @param {number} dailyLimit - Allowed calls per 24 hours
 * @param {string} ip - Client IP address as fallback
 * @returns {{ allowed: boolean, remaining: number, limit: number, resetInSeconds: number, error?: string }}
 */
export function checkRateLimit(licenseKey, dailyLimit = 25, ip = "127.0.0.1") {
  const now = Date.now();
  const trackingKey = licenseKey || `ip_${ip}`;

  let record = usageStore.get(trackingKey);

  // Initialize or reset if 24 hours have passed
  if (!record || now > record.resetAt) {
    const nextReset = now + (24 * 60 * 60 * 1000);
    record = {
      count: 0,
      resetAt: nextReset
    };
    usageStore.set(trackingKey, record);
  }

  // Check if limit reached
  if (record.count >= dailyLimit) {
    const resetInSeconds = Math.max(1, Math.round((record.resetAt - now) / 1000));
    const hours = Math.ceil(resetInSeconds / 3600);
    return {
      allowed: false,
      remaining: 0,
      limit: dailyLimit,
      resetInSeconds,
      error: `Daily limit of ${dailyLimit} free queries reached today. Quota resets in ${hours} hour${hours > 1 ? 's' : ''}. Upgrade to Wayfinder Pro for 1,000 queries/day at https://wayfinder-ai-gateway-production-038471e5.up.railway.app/checkout/success`
    };
  }

  // Increment usage
  record.count += 1;
  const remaining = Math.max(0, dailyLimit - record.count);
  const resetInSeconds = Math.max(1, Math.round((record.resetAt - now) / 1000));

  return {
    allowed: true,
    remaining,
    limit: dailyLimit,
    resetInSeconds
  };
}

/**
 * Inspect usage status without incrementing (e.g. for status/health checks)
 */
export function getUsageStatus(licenseKey, dailyLimit = 25) {
  const now = Date.now();
  const record = usageStore.get(licenseKey);

  if (!record || now > record.resetAt) {
    return {
      used: 0,
      remaining: dailyLimit,
      limit: dailyLimit,
      resetInSeconds: 86400
    };
  }

  const used = record.count;
  const remaining = Math.max(0, dailyLimit - used);
  const resetInSeconds = Math.max(1, Math.round((record.resetAt - now) / 1000));

  return {
    used,
    remaining,
    limit: dailyLimit,
    resetInSeconds
  };
}

/**
 * Reset quota for testing or admin override
 */
export function resetQuota(licenseKey) {
  usageStore.delete(licenseKey);
}
