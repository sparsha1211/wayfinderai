/**
 * Wayfinder AI — Production Middle Server & Subscription Gateway
 * Runs locally or on Railway / Render / Fly.io / AWS.
 */

import http from "node:http";
import { validateLicense, createLicense, SUBSCRIPTION_TIERS } from "./auth.js";
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
    // 1. Health check
    if (req.method === "GET" && pathname === "/api/v1/health") {
      return sendJson(res, 200, {
        status: "ok",
        service: "Wayfinder AI Gateway",
        version: "1.0.0",
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

    // 3. Issue Free Trial License
    if (req.method === "POST" && pathname === "/api/v1/auth/trial") {
      const body = await parseBody(req);
      const email = body.email || `trial_${Date.now()}@wayfinderai.com`;
      const license = createLicense({ email, tier: "trial", durationDays: 7 });

      return sendJson(res, 200, {
        success: true,
        message: "Free trial activated! 25 queries per day for 7 days.",
        licenseKey: license.licenseKey,
        tier: "trial",
        expiresAt: license.expiresAt,
        dailyLimit: SUBSCRIPTION_TIERS.trial.dailyLimit
      });
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
