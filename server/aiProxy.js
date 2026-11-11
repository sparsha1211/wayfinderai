/**
 * Wayfinder AI — Server-Side AI Gateway Proxy
 * Holds private server API keys, executes LLM inference, and isolates credentials from clients.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read OpenAI Key from Environment, or fallback to local test config
function resolveServerApiKey() {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-")) {
    return process.env.OPENAI_API_KEY;
  }

  // Check local test config file if present in dev environment
  const localConfigPath = path.resolve(__dirname, "../tests/test.config.local.json");
  if (fs.existsSync(localConfigPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(localConfigPath, "utf-8"));
      if (cfg.apiKey && cfg.apiKey.startsWith("sk-")) {
        return cfg.apiKey;
      }
    } catch (e) {}
  }

  return "";
}

const SERVER_OPENAI_KEY = resolveServerApiKey();
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/**
 * Execute AI Page Assistance Request via Server-Side OpenAI Gateway
 */
export async function executeGuidanceProxy({
  systemPrompt,
  userPrompt,
  responseFormat = "json",
  model = DEFAULT_MODEL,
  maxTokens = 2500
}) {
  const apiKey = SERVER_OPENAI_KEY || resolveServerApiKey();

  // If no server key is configured in dev environment, return structured mock response
  if (!apiKey) {
    console.warn("[Wayfinder AI Gateway] No server OPENAI_API_KEY found, using mock gateway response.");
    return generateMockGuidanceResponse();
  }

  let finalSystemPrompt = systemPrompt || "You are Wayfinder AI, an intelligent web navigation assistant. Return valid JSON.";
  let finalUserPrompt = userPrompt || "Analyze this webpage and return guidance in JSON.";

  // OpenAI strictly requires the word 'json' in messages when response_format: { type: 'json_object' } is enabled
  if (responseFormat === "json") {
    if (!finalSystemPrompt.toLowerCase().includes("json")) {
      finalSystemPrompt += "\n\nImportant: You must respond in valid JSON format.";
    }
  }

  const payload = {
    model: model || DEFAULT_MODEL,
    messages: [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: finalUserPrompt }
    ],
    temperature: 0.2,
    max_tokens: maxTokens
  };

  if (responseFormat === "json") {
    payload.response_format = { type: "json_object" };
  }

  const startTime = Date.now();
  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const errorBody = await response.text();
    let errMessage = `OpenAI API returned status ${response.status}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) errMessage = parsed.error.message;
    } catch (e) {}
    throw new Error(errMessage);
  }

  const result = await response.json();
  const rawText = result.choices?.[0]?.message?.content || "";

  let parsedData = rawText;
  if (responseFormat === "json") {
    try {
      parsedData = JSON.parse(rawText);
    } catch (e) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error("Invalid JSON structure returned by LLM gateway.");
      }
    }
  }

  const usage = {
    promptTokens: result.usage?.prompt_tokens || 0,
    completionTokens: result.usage?.completion_tokens || 0,
    totalTokens: result.usage?.total_tokens || 0
  };

  return {
    success: true,
    data: parsedData,
    usage,
    durationMs,
    provider: "wayfinder_cloud",
    model: result.model || model
  };
}

/**
 * Execute Chat / Text Copilot Request via Server-Side OpenAI Gateway
 */
export async function executeChatProxy({
  systemPrompt,
  userPrompt,
  model = DEFAULT_MODEL,
  maxTokens = 1500
}) {
  const apiKey = SERVER_OPENAI_KEY || resolveServerApiKey();

  if (!apiKey) {
    return {
      success: true,
      text: "👋 [Wayfinder Cloud Demo] Server key not configured. Please add OPENAI_API_KEY in your server/.env file.",
      usage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
      provider: "wayfinder_cloud",
      model: "mock-gateway"
    };
  }

  const payload = {
    model: model || DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: maxTokens
  };

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errMessage = `OpenAI API returned status ${response.status}`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) errMessage = parsed.error.message;
    } catch (e) {}
    throw new Error(errMessage);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content || "";

  return {
    success: true,
    text,
    usage: {
      promptTokens: result.usage?.prompt_tokens || 0,
      completionTokens: result.usage?.completion_tokens || 0,
      totalTokens: result.usage?.total_tokens || 0
    },
    provider: "wayfinder_cloud",
    model: result.model || model
  };
}

function generateMockGuidanceResponse() {
  return {
    success: true,
    data: {
      summary: "Wayfinder Cloud successfully connected to your page context.",
      inferredIntent: "Active browser navigation",
      pageGoal: "Explore available actions and page details",
      copilotThinking: "Evaluating on-page elements to guide the user securely via Wayfinder Cloud.",
      proactiveInsights: [
        "Wayfinder Cloud has securely proxied your request without leaking private keys to the browser."
      ],
      recommendations: [
        "Review interactive options on this page.",
        "Use Cmd+I to open in-page AI Copilot anytime."
      ],
      suggestedActions: [
        { label: "View Navigation Items", type: "highlight", targetHint: "button, a", explanation: "Explore key page links" }
      ],
      domHighlights: [
        { note: "Wayfinder Cloud Active", textHint: "button" }
      ]
    },
    usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
    durationMs: 150,
    provider: "wayfinder_cloud",
    model: "cloud-proxy"
  };
}
