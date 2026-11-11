/**
 * Wayfinder AI — Production Middle Server & Subscription Gateway
 * Runs locally or on Railway / Render / Fly.io / AWS.
 */

import http from "node:http";
import crypto from "node:crypto";
import { validateLicense, createLicense, findLicenseByEmail, findLicenseByDeviceId, SUBSCRIPTION_TIERS } from "./auth.js";
import { checkRateLimit, getUsageStatus } from "./rateLimiter.js";
import { executeGuidanceProxy, executeChatProxy } from "./aiProxy.js";
import { handleStripeEvent, verifyStripeSignature } from "./stripeWebhook.js";

const PORT = process.env.PORT || 3000;

/**
 * Standard CORS and JSON Headers for Chrome Extension clients
 */
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendHtml(res, statusCode, html) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/**
 * Parse JSON body from incoming HTTP request
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB safety limit
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Authenticate incoming request via Authorization: Bearer <license_key>
 */
function authenticateClient(req) {
  const authHeader = req.headers["authorization"] || "";
  const authResult = validateLicense(authHeader);
  return authResult;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Handle preflight OPTIONS
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  try {
    // 1. Health check & Root gateway status
    if (req.method === "GET" && (pathname === "/" || pathname === "/api/v1/health")) {
      return sendJson(res, 200, {
        status: "ok",
        service: "Wayfinder AI Gateway",
        version: "1.0.0",
        message: "Wayfinder AI Cloud Gateway is online and ready.",
        endpoints: {
          health: "/api/v1/health",
          checkoutSuccess: "/checkout/success",
          authVerify: "/api/v1/auth/verify",
          authTrial: "/api/v1/auth/trial",
          authLookup: "/api/v1/auth/lookup",
          stripeWebhook: "/api/v1/webhooks/stripe"
        },
        timestamp: Date.now()
      });
    }

    // 2. Verify License Key
    if (req.method === "POST" && pathname === "/api/v1/auth/verify") {
      const body = await parseBody(req);
      const licenseKey = body.licenseKey || req.headers["authorization"];
      const validation = validateLicense(licenseKey);

      if (!validation.valid) {
        return sendJson(res, 401, { success: false, error: validation.error });
      }

      const usage = getUsageStatus(validation.licenseKey, validation.dailyLimit);
      return sendJson(res, 200, {
        success: true,
        licenseKey: validation.licenseKey,
        tier: validation.tier,
        tierName: validation.tierName,
        email: validation.email,
        expiresAt: validation.expiresAt,
        quota: {
          dailyLimit: validation.dailyLimit,
          remaining: usage.remaining,
          used: usage.used
        }
      });
    }

    // 3. Issue Free Trial License (With Reinstall Anti-Abuse Tracking)
    if (req.method === "POST" && pathname === "/api/v1/auth/trial") {
      const body = await parseBody(req);
      const clientIp = req.socket.remoteAddress || "127.0.0.1";
      const deviceId = body.deviceId || `ip_${crypto.createHash("sha256").update(clientIp).digest("hex").slice(0, 16)}`;

      // Check if this deviceId has already received a trial (prevents reinstall quota abuse)
      const existingLicense = findLicenseByDeviceId(deviceId);
      if (existingLicense) {
        const usage = getUsageStatus(existingLicense.licenseKey, SUBSCRIPTION_TIERS.trial.dailyLimit);
        return sendJson(res, 200, {
          success: true,
          reconnected: true,
          message: "Welcome back! Existing trial restored.",
          licenseKey: existingLicense.licenseKey,
          tier: existingLicense.tier,
          expiresAt: existingLicense.expiresAt,
          dailyLimit: SUBSCRIPTION_TIERS.trial.dailyLimit,
          quota: {
            dailyLimit: SUBSCRIPTION_TIERS.trial.dailyLimit,
            remaining: usage.remaining,
            used: usage.used
          }
        });
      }

      const email = body.email || `trial_${Date.now()}@wayfinderai.com`;
      const license = createLicense({ email, tier: "trial", durationDays: 7, deviceId });

      return sendJson(res, 200, {
        success: true,
        reconnected: false,
        message: "Free trial activated! 25 queries per day for 7 days.",
        licenseKey: license.licenseKey,
        tier: "trial",
        expiresAt: license.expiresAt,
        dailyLimit: SUBSCRIPTION_TIERS.trial.dailyLimit,
        quota: {
          dailyLimit: SUBSCRIPTION_TIERS.trial.dailyLimit,
          remaining: SUBSCRIPTION_TIERS.trial.dailyLimit,
          used: 0
        }
      });
    }

    // 3b. Lookup License by Email (For user retrieval)
    if (req.method === "POST" && pathname === "/api/v1/auth/lookup") {
      const body = await parseBody(req);
      const email = body.email;
      if (!email) {
        return sendJson(res, 400, { success: false, error: "Email is required." });
      }
      const license = findLicenseByEmail(email);
      if (!license) {
        return sendJson(res, 404, { success: false, error: "No active license found for this email address." });
      }
      return sendJson(res, 200, {
        success: true,
        licenseKey: license.licenseKey,
        tier: license.tier,
        expiresAt: license.expiresAt
      });
    }

    // 3c. Customer Checkout Success & License Display Web Page
    if (req.method === "GET" && (pathname === "/checkout/success" || pathname === "/success")) {
      const email = url.searchParams.get("email") || "";
      const license = email ? findLicenseByEmail(email) : null;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wayfinder AI — Subscription Activated</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; max-width: 520px; width: 100%; padding: 36px 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); text-align: center; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: rgba(99,102,241,0.15); border: 1px solid #6366f1; color: #a5b4fc; border-radius: 999px; font-size: 13px; font-weight: 600; margin-bottom: 20px; }
    h1 { font-size: 26px; font-weight: 700; margin-bottom: 8px; color: #ffffff; }
    p.subtitle { color: #94a3b8; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    .key-box { background: #090d16; border: 1px dashed #475569; border-radius: 10px; padding: 16px; margin-bottom: 24px; }
    .key-code { font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 15px; color: #38bdf8; word-break: break-all; letter-spacing: 0.5px; }
    .copy-btn { margin-top: 12px; background: #4f46e5; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; cursor: pointer; transition: background 0.15s; }
    .copy-btn:hover { background: #4338ca; }
    .steps { text-align: left; background: #0f172a; border-radius: 10px; padding: 18px 20px; margin-top: 24px; font-size: 13px; line-height: 1.6; color: #cbd5e1; }
    .steps ol { padding-left: 20px; }
    .steps li { margin-bottom: 6px; }
    .lookup-form { display: flex; gap: 8px; margin-top: 14px; }
    .lookup-input { flex: 1; padding: 10px 14px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: white; font-size: 14px; }
    .lookup-btn { background: #334155; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    .lookup-btn:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">✨ Payment Verified • Wayfinder Pro Active</div>
    <h1>Welcome to Wayfinder AI</h1>
    <p class="subtitle">Your subscription is now live. Use your secret license key below to activate unlimited proactive web intelligence in your browser.</p>

    ${license ? `
    <div class="key-box">
      <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 6px;">Your Pro License Key</div>
      <div class="key-code" id="licenseKey">${license.licenseKey}</div>
      <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('licenseKey').innerText); this.innerText='✓ Copied to Clipboard!';">📋 Copy License Key</button>
    </div>
    ` : `
    <div class="key-box">
      <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 8px;">Enter the email you used at Stripe Checkout to reveal your key:</div>
      <form class="lookup-form" method="GET" action="/checkout/success">
        <input class="lookup-input" type="email" name="email" placeholder="you@domain.com" required value="${email}">
        <button class="lookup-btn" type="submit">Find Key</button>
      </form>
      ${email ? `<div style="color: #f87171; font-size: 12px; margin-top: 8px;">No active license found for "${email}". If payment just processed, please wait a few seconds and try again.</div>` : ''}
    </div>
    `}

    <div class="steps">
      <strong style="color: #ffffff; display: block; margin-bottom: 6px;">How to activate in your Chrome Extension:</strong>
      <ol>
        <li>Click the <strong>Wayfinder AI</strong> icon in your Chrome toolbar.</li>
        <li>Select <strong>Wayfinder Cloud (Subscription)</strong> from the AI Provider list.</li>
        <li>Paste your license key above and click <strong>Save</strong>.</li>
      </ol>
    </div>
  </div>
</body>
</html>`;
      return sendHtml(res, 200, html);
    }

    // 4. Secure AI Page Guidance Proxy
    if (req.method === "POST" && pathname === "/api/v1/ai/guidance") {
      const auth = authenticateClient(req);
      if (!auth.valid) {
        return sendJson(res, 401, { success: false, error: auth.error });
      }

      const clientIp = req.socket.remoteAddress || "127.0.0.1";
      const limit = checkRateLimit(auth.licenseKey, auth.dailyLimit, clientIp);
      if (!limit.allowed) {
        return sendJson(res, 429, {
          success: false,
          error: limit.error,
          quotaRemaining: 0,
          resetInSeconds: limit.resetInSeconds
        });
      }

      const body = await parseBody(req);
      const { systemPrompt, userPrompt, responseFormat, model } = body;

      const proxyResult = await executeGuidanceProxy({
        systemPrompt,
        userPrompt,
        responseFormat: responseFormat || "json",
        model,
        maxTokens: auth.maxTokens
      });

      return sendJson(res, 200, {
        success: true,
        guidance: proxyResult.data,
        usage: proxyResult.usage,
        quotaRemaining: limit.remaining,
        provider: "wayfinder_cloud",
        model: proxyResult.model
      });
    }

    // 5. Secure Interactive Chat Copilot Proxy
    if (req.method === "POST" && pathname === "/api/v1/ai/chat") {
      const auth = authenticateClient(req);
      if (!auth.valid) {
        return sendJson(res, 401, { success: false, error: auth.error });
      }

      const clientIp = req.socket.remoteAddress || "127.0.0.1";
      const limit = checkRateLimit(auth.licenseKey, auth.dailyLimit, clientIp);
      if (!limit.allowed) {
        return sendJson(res, 429, {
          success: false,
          error: limit.error,
          quotaRemaining: 0,
          resetInSeconds: limit.resetInSeconds
        });
      }

      const body = await parseBody(req);
      const { systemPrompt, userPrompt, model } = body;

      const chatResult = await executeChatProxy({
        systemPrompt,
        userPrompt,
        model,
        maxTokens: auth.maxTokens
      });

      return sendJson(res, 200, {
        success: true,
        answer: chatResult.text,
        usage: chatResult.usage,
        quotaRemaining: limit.remaining,
        provider: "wayfinder_cloud",
        model: chatResult.model
      });
    }

    // 6. Secure Text Selection Copilot Proxy
    if (req.method === "POST" && pathname === "/api/v1/ai/analyze-text") {
      const auth = authenticateClient(req);
      if (!auth.valid) {
        return sendJson(res, 401, { success: false, error: auth.error });
      }

      const clientIp = req.socket.remoteAddress || "127.0.0.1";
      const limit = checkRateLimit(auth.licenseKey, auth.dailyLimit, clientIp);
      if (!limit.allowed) {
        return sendJson(res, 429, {
          success: false,
          error: limit.error,
          quotaRemaining: 0,
          resetInSeconds: limit.resetInSeconds
        });
      }

      const body = await parseBody(req);
      const { systemPrompt, userPrompt, model } = body;

      const chatResult = await executeChatProxy({
        systemPrompt,
        userPrompt,
        model,
        maxTokens: 1000
      });

      return sendJson(res, 200, {
        success: true,
        analysis: chatResult.text,
        usage: chatResult.usage,
        quotaRemaining: limit.remaining,
        provider: "wayfinder_cloud",
        model: chatResult.model
      });
    }

    // 7. Stripe Billing Webhook
    if (req.method === "POST" && pathname === "/api/v1/webhooks/stripe") {
      const sig = req.headers["stripe-signature"];
      let rawBody = "";
      req.on("data", chunk => { rawBody += chunk; });
      req.on("end", async () => {
        // If testing without signature header, allow in non-production
        const isVerified = verifyStripeSignature(rawBody, sig);
        let event = null;
        try {
          event = JSON.parse(rawBody);
        } catch (e) {
          return sendJson(res, 400, { error: "Invalid JSON" });
        }

        if (!isVerified && process.env.NODE_ENV === "production") {
          return sendJson(res, 400, { error: "Invalid Stripe signature" });
        }

        const webhookResult = await handleStripeEvent(event);
        return sendJson(res, 200, { received: true, ...webhookResult });
      });
      return;
    }

    // 404 Catch-All
    return sendJson(res, 404, { error: "Route not found", path: pathname });
  } catch (error) {
    console.error("[Wayfinder Server Error]", error);
    return sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

export function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[Wayfinder AI Gateway] Running at http://localhost:${port}`);
      resolve(server);
    });
  });
}

export function stopServer() {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

// Auto-start if invoked directly via `node server/index.js`
if (process.argv[1] && process.argv[1].endsWith("index.js")) {
  startServer(PORT);
}

export { server };
