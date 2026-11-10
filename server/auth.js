/**
 * Wayfinder AI — License & Authentication Engine
 * Manages subscription tiers, license keys, and client authentication.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const LICENSES_FILE = path.join(DATA_DIR, "licenses.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Built-in Subscription Tiers
export const SUBSCRIPTION_TIERS = {
  trial: {
    name: "Free Trial",
    dailyLimit: 25,
    maxTokensPerCall: 2000,
    priceMonthly: 0
  },
  pro: {
    name: "Wayfinder Pro",
    dailyLimit: 1000,
    maxTokensPerCall: 4000,
    priceMonthly: 9.99
  },
  enterprise: {
    name: "Wayfinder Enterprise",
    dailyLimit: 10000,
    maxTokensPerCall: 8000,
    priceMonthly: 79.00
  }
};

/**
 * Load persistent licenses or seed with initial demo/testing keys
 */
function loadLicenses() {
  if (fs.existsSync(LICENSES_FILE)) {
    try {
      const content = fs.readFileSync(LICENSES_FILE, "utf-8");
      return JSON.parse(content);
    } catch (e) {
      console.error("[Wayfinder Auth] Failed to parse licenses.json, using fallback store:", e);
    }
  }

  // Initial seed licenses for local development and automated testing
  const seed = {
    "wf_live_test_pro_key_12345": {
      licenseKey: "wf_live_test_pro_key_12345",
      email: "demo@wayfinderai.com",
      tier: "pro",
      active: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
      stripeCustomerId: "cus_mock_pro_123",
      stripeSubscriptionId: "sub_mock_pro_123"
    },
    "wf_trial_test_key_67890": {
      licenseKey: "wf_trial_test_key_67890",
      email: "trial@wayfinderai.com",
      tier: "trial",
      active: true,
      createdAt: Date.now(),
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      stripeCustomerId: null,
      stripeSubscriptionId: null
    }
  };

  saveLicenses(seed);
  return seed;
}

let licensesStore = loadLicenses();

function saveLicenses(data = licensesStore) {
  try {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Wayfinder Auth] Failed to save licenses.json:", err);
  }
}

/**
 * Generate a cryptographically secure license key
 */
export function generateLicenseKey(tier = "pro") {
  const prefix = tier === "trial" ? "wf_trial_" : "wf_live_";
  const random = crypto.randomBytes(16).toString("hex");
  return `${prefix}${random}`;
}

/**
 * Create a new license key (e.g. from Stripe checkout)
 */
export function createLicense({ email, tier = "pro", durationDays = 30, stripeCustomerId = null, stripeSubscriptionId = null }) {
  const licenseKey = generateLicenseKey(tier);
  const now = Date.now();
  const expiresAt = now + (durationDays * 24 * 60 * 60 * 1000);

  const newLicense = {
    licenseKey,
    email: email ? email.toLowerCase().trim() : "anonymous@user.com",
    tier: SUBSCRIPTION_TIERS[tier] ? tier : "pro",
    active: true,
    createdAt: now,
    expiresAt,
    stripeCustomerId,
    stripeSubscriptionId
  };

  licensesStore[licenseKey] = newLicense;
  saveLicenses();
  return newLicense;
}

/**
 * Validate a client-provided license key or Bearer token
 */
export function validateLicense(rawKey) {
  if (!rawKey || typeof rawKey !== "string") {
    return { valid: false, error: "License key is required." };
  }

  // Clean Bearer prefix if passed from header
  const licenseKey = rawKey.replace(/^Bearer\s+/i, "").trim();

  // Reload store to catch any new Stripe webhooks
  licensesStore = loadLicenses();
  const license = licensesStore[licenseKey];

  if (!license) {
    return { valid: false, error: "Invalid license key. Please check your key or upgrade to Pro." };
  }

  if (!license.active) {
    return { valid: false, error: "This subscription license has been cancelled or revoked." };
  }

  if (license.expiresAt && Date.now() > license.expiresAt) {
    return {
      valid: false,
      expired: true,
      error: "Subscription has expired. Please renew your plan at https://wayfinderai.com/upgrade"
    };
  }

  const tierConfig = SUBSCRIPTION_TIERS[license.tier] || SUBSCRIPTION_TIERS.trial;

  return {
    valid: true,
    licenseKey: license.licenseKey,
    email: license.email,
    tier: license.tier,
    tierName: tierConfig.name,
    dailyLimit: tierConfig.dailyLimit,
    maxTokens: tierConfig.maxTokensPerCall,
    expiresAt: license.expiresAt
  };
}

/**
 * Revoke or cancel a license (e.g. from Stripe cancellation webhook)
 */
export function revokeLicense(licenseKey, reason = "Subscription cancelled") {
  if (licensesStore[licenseKey]) {
    licensesStore[licenseKey].active = false;
    licensesStore[licenseKey].revokedAt = Date.now();
    licensesStore[licenseKey].revokeReason = reason;
    saveLicenses();
    return true;
  }
  return false;
}

/**
 * Find license by Stripe Subscription ID
 */
export function findLicenseBySubscriptionId(subId) {
  licensesStore = loadLicenses();
  for (const key of Object.values(licensesStore)) {
    if (key.stripeSubscriptionId === subId) {
      return key;
    }
  }
  return null;
}

/**
 * Find active license by customer email
 */
export function findLicenseByEmail(email) {
  if (!email || typeof email !== "string") return null;
  const target = email.toLowerCase().trim();
  licensesStore = loadLicenses();
  // Reverse to find the latest active license for this email
  const licenses = Object.values(licensesStore).reverse();
  for (const license of licenses) {
    if (license.email && license.email.toLowerCase().trim() === target && license.active) {
      return license;
    }
  }
  return null;
}
