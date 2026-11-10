/**
 * Wayfinder AI — Stripe Billing & Subscription Webhook Handler
 * Automates customer subscription lifecycle, license generation, and revocation.
 */

import crypto from "node:crypto";
import { createLicense, findLicenseBySubscriptionId, revokeLicense } from "./auth.js";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_mock_wayfinder_test_secret";

/**
 * Verify Stripe webhook signature (HMAC-SHA256)
 */
export function verifyStripeSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !STRIPE_WEBHOOK_SECRET) {
    return false;
  }

  try {
    const parts = signatureHeader.split(",");
    let timestamp = "";
    let signature = "";

    for (const part of parts) {
      const [k, v] = part.trim().split("=");
      if (k === "t") timestamp = v;
      if (k === "v1") signature = v;
    }

    if (!timestamp || !signature) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
      .update(signedPayload, "utf8")
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"));
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err);
    return false;
  }
}

/**
 * Handle incoming Stripe Event
 */
export async function handleStripeEvent(event) {
  const type = event?.type;
  const data = event?.data?.object;

  console.log(`[Wayfinder Billing] Processing Stripe event: ${type}`);

  switch (type) {
    // 1. Initial purchase complete -> Generate Pro License Key
    case "checkout.session.completed": {
      const email = data.customer_details?.email || data.customer_email;
      const customerId = data.customer;
      const subscriptionId = data.subscription;

      const license = createLicense({
        email,
        tier: "pro",
        durationDays: 32, // Monthly + 2-day buffer
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId
      });

      console.log(`[Wayfinder Billing] Created Pro License Key for ${email}: ${license.licenseKey}`);
      return { status: "created", licenseKey: license.licenseKey, email };
    }

    // 2. Monthly recurring renewal payment succeeded
    case "invoice.payment_succeeded": {
      const subscriptionId = data.subscription;
      const license = findLicenseBySubscriptionId(subscriptionId);
      if (license) {
        license.active = true;
        license.expiresAt = Date.now() + (32 * 24 * 60 * 60 * 1000); // Extended another 32 days
        console.log(`[Wayfinder Billing] Renewed license ${license.licenseKey} for subscription ${subscriptionId}`);
        return { status: "renewed", licenseKey: license.licenseKey };
      }
      return { status: "ignored_no_license_found" };
    }

    // 3. Subscription cancellation or past due
    case "customer.subscription.deleted": {
      const subscriptionId = data.id;
      const license = findLicenseBySubscriptionId(subscriptionId);
      if (license) {
        revokeLicense(license.licenseKey, "Stripe subscription cancelled");
        console.log(`[Wayfinder Billing] Revoked license ${license.licenseKey} due to cancellation.`);
        return { status: "revoked", licenseKey: license.licenseKey };
      }
      return { status: "ignored_no_license_found" };
    }

    default:
      return { status: "unhandled_event", type };
  }
}
