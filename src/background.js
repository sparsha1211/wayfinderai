/**
 * Wayfinder AI Background Service Worker
 * Coordinates AI requests, metrics tracking, developer debugging logs, pattern learning, and DOM communication.
 */

import { AIService, PROVIDERS } from "./services/aiProviders.js";
import { PatternLearner } from "./services/patternLearner.js";
import { WebResearcher } from "./services/webResearcher.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  activeProvider: "ollama",
  licenseKey: "wf_live_test_pro_key_12345", // Wayfinder Cloud subscription license key
  apiKeys: {
    openai: "",
    claude: "",
    openrouter: "",
    meta: "",
    wayfinder_cloud: "wf_live_test_pro_key_12345"
  },
  customEndpoints: {
    ollama: "http://localhost:11434/api/chat",
    wayfinder_cloud: "https://wayfinder-ai-gateway-production-038471e5.up.railway.app"
  },
  selectedModels: {
    wayfinder_cloud: "gpt-4o-mini",
    openai: "gpt-4o-mini",
    claude: "claude-3-5-haiku-20241022",
    openrouter: "meta-llama/llama-3.1-8b-instruct:free",
    meta: "llama-3.1-8b-instant",
    ollama: "llama3.2:latest"
  },
  domMarkersEnabled: true, // In-page DOM purple markers
  learnPatterns: true,     // User navigation habit learning
  debugMode: false         // Developer debug mode (request/response inspector)
};

const DEFAULT_METRICS = {
  totalCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  totalLatencyMs: 0,
  sensitivePagesShielded: 0,
  lastCallTimestamp: null,
  providerBreakdown: {}
};

const PROVIDER_RATES = {
  wayfinder_cloud: { promptRate: 0, completionRate: 0 },                       // Subscription included
  openai: { promptRate: 0.15 / 1000000, completionRate: 0.60 / 1000000 },      // $0.15 / $0.60 per 1M (gpt-4o-mini)
  claude: { promptRate: 0.80 / 1000000, completionRate: 4.00 / 1000000 },      // $0.80 / $4.00 per 1M (Haiku 3.5)
  openrouter: { promptRate: 0.05 / 1000000, completionRate: 0.08 / 1000000 },  // ~$0.05 / $0.08 per 1M
  meta: { promptRate: 0.05 / 1000000, completionRate: 0.08 / 1000000 },        // ~$0.05 / $0.08 per 1M
  ollama: { promptRate: 0, completionRate: 0 },                                // Free / Local
  chrome_builtin: { promptRate: 0, completionRate: 0 }                         // Free / Local
};

const MAX_DEBUG_LOGS = 30;

// Initialize default settings & metrics on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["wayfinder_settings", "wayfinder_metrics", "wayfinder_debug_logs"]);
  if (!current.wayfinder_settings) {
    await chrome.storage.local.set({ wayfinder_settings: DEFAULT_SETTINGS });
  }
  if (!current.wayfinder_metrics) {
    await chrome.storage.local.set({ wayfinder_metrics: DEFAULT_METRICS });
  }
  if (!current.wayfinder_debug_logs) {
    await chrome.storage.local.set({ wayfinder_debug_logs: [] });
  }
});

// Record Metrics Helper
async function recordMetrics(providerId, usage, durationMs = 0) {
  const data = await chrome.storage.local.get("wayfinder_metrics");
  const metrics = data.wayfinder_metrics || { ...DEFAULT_METRICS };

  const rate = PROVIDER_RATES[providerId] || { promptRate: 0.15 / 1000000, completionRate: 0.60 / 1000000 };
  const pTokens = usage?.promptTokens || 0;
  const cTokens = usage?.completionTokens || 0;
  const callCost = (pTokens * rate.promptRate) + (cTokens * rate.completionRate);

  metrics.totalCalls = (metrics.totalCalls || 0) + 1;
  metrics.promptTokens = (metrics.promptTokens || 0) + pTokens;
  metrics.completionTokens = (metrics.completionTokens || 0) + cTokens;
  metrics.totalTokens = (metrics.totalTokens || 0) + (usage?.totalTokens || (pTokens + cTokens));
  metrics.estimatedCostUsd = (metrics.estimatedCostUsd || 0) + callCost;
  if (durationMs > 0) {
    metrics.totalLatencyMs = (metrics.totalLatencyMs || 0) + durationMs;
  }
  metrics.lastCallTimestamp = Date.now();

  metrics.providerBreakdown = metrics.providerBreakdown || {};
  if (!metrics.providerBreakdown[providerId]) {
    metrics.providerBreakdown[providerId] = { calls: 0, tokens: 0, cost: 0 };
  } else if (typeof metrics.providerBreakdown[providerId] === "number") {
    metrics.providerBreakdown[providerId] = { calls: metrics.providerBreakdown[providerId], tokens: 0, cost: 0 };
  }
  metrics.providerBreakdown[providerId].calls += 1;
  metrics.providerBreakdown[providerId].tokens += (usage?.totalTokens || (pTokens + cTokens));
  metrics.providerBreakdown[providerId].cost = (metrics.providerBreakdown[providerId].cost || 0) + callCost;

  await chrome.storage.local.set({ wayfinder_metrics: metrics });
  return metrics;
}

// Log Developer Debug Entry
async function logDebugEntry(entry) {
  const { wayfinder_debug_logs = [] } = await chrome.storage.local.get("wayfinder_debug_logs");
  const newLog = {
    id: "log_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    timestamp: Date.now(),
    ...entry
  };
  const updatedLogs = [newLog, ...wayfinder_debug_logs].slice(0, MAX_DEBUG_LOGS);
  await chrome.storage.local.set({ wayfinder_debug_logs: updatedLogs });
}

// Message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PAGE_ASSISTANCE") {
    handlePageAssistance(message.payload, sender.tab?.id)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "TEST_PROVIDER_CONNECTION") {
    handleTestConnection(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "ANALYZE_SELECTED_TEXT") {
    handleSelectedTextAnalysis(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CHAT_WITH_PAGE_CONTEXT") {
    handleChatWithPageContext(message.payload)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "RECORD_PAGE_VISIT") {
    chrome.storage.local.get("wayfinder_settings").then(({ wayfinder_settings = {} }) => {
      if (wayfinder_settings.learnPatterns !== false) {
        PatternLearner.recordVisit(message.payload)
          .then(res => sendResponse({ success: true, data: res }))
          .catch(err => sendResponse({ success: false, error: err.message }));
      } else {
        sendResponse({ success: true, skipped: true });
      }
    });
    return true;
  }

  if (message.type === "GET_DEBUG_LOGS") {
    chrome.storage.local.get("wayfinder_debug_logs").then(({ wayfinder_debug_logs = [] }) => {
      sendResponse({ success: true, logs: wayfinder_debug_logs });
    });
    return true;
  }

  if (message.type === "CLEAR_DEBUG_LOGS") {
    chrome.storage.local.set({ wayfinder_debug_logs: [] })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "GET_PATTERNS_CONTEXT") {
    PatternLearner.getPatternContext()
      .then(patterns => sendResponse({ success: true, patterns }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "CLEAR_HISTORY") {
    PatternLearner.clearLearningData()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "RECORD_SHIELDED_PAGE") {
    (async () => {
      const data = await chrome.storage.local.get("wayfinder_metrics");
      const metrics = data.wayfinder_metrics || { ...DEFAULT_METRICS };
      metrics.sensitivePagesShielded = (metrics.sensitivePagesShielded || 0) + 1;
      await chrome.storage.local.set({ wayfinder_metrics: metrics });
      sendResponse({ success: true, count: metrics.sensitivePagesShielded });
    })().catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "RESET_METRICS") {
    chrome.storage.local.set({ wayfinder_metrics: DEFAULT_METRICS })
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === "VERIFY_SUBSCRIPTION_LICENSE") {
    const { licenseKey, endpoint = "https://wayfinder-ai-gateway-production-038471e5.up.railway.app" } = message.payload || {};
    fetch(`${endpoint.replace(/\/+$/, "")}/api/v1/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey })
    })
      .then(r => r.json())
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Handle testing connection to a selected AI provider
 */
async function handleTestConnection({ providerId, apiKey, endpoint, model }) {
  const startTime = Date.now();
  try {
    const result = await AIService.testConnection({ providerId, apiKey, endpoint, model });
    const durationMs = Date.now() - startTime;
    await recordMetrics(providerId, result.usage, durationMs);

    await logDebugEntry({
      type: "TEST_CONNECTION",
      status: "SUCCESS",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      usage: result.usage,
      response: result.reply
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logDebugEntry({
      type: "TEST_CONNECTION",
      status: "ERROR",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Handle in-page navigation assistance
 */
async function handlePageAssistance(pageContext) {
  const { wayfinder_settings } = await chrome.storage.local.get("wayfinder_settings");
  if (!wayfinder_settings || !wayfinder_settings.enabled) {
    return { success: false, disabled: true, error: "Wayfinder AI is currently paused/disabled." };
  }

  const providerId = wayfinder_settings.activeProvider || "ollama";
  const apiKey = providerId === "wayfinder_cloud"
    ? (wayfinder_settings.licenseKey || wayfinder_settings.apiKeys?.wayfinder_cloud || "")
    : (wayfinder_settings.apiKeys?.[providerId] || "");
  const endpoint = wayfinder_settings.customEndpoints?.[providerId] || PROVIDERS[providerId]?.defaultEndpoint;
  const model = wayfinder_settings.selectedModels?.[providerId] || PROVIDERS[providerId]?.defaultModel;

  let patterns = { topDomains: [], topInterests: [], frequentWorkflows: [], recentTrail: [] };
  if (wayfinder_settings.learnPatterns !== false) {
    patterns = await PatternLearner.getPatternContext();
  }

  // Autonomous background research: link peeking & market competitor comparison
  const research = await WebResearcher.gatherAutonomousContext(pageContext);

  const systemPrompt = `You are Wayfinder AI, an autonomous, universally intelligent browser copilot.
Your mission is to understand ANY webpage the user visits—whether they are booking flights (e.g. Skyscanner, Google Flights), reserving accommodations/stays (e.g. Airbnb, Booking.com), shopping online, reading tech documentation, comparing SaaS tools, searching real estate, or general research.

NEVER rely on hardcoded domain assumptions. Autonomously deduce:
1. WHAT IS THE USER TRYING TO DO?
   Analyze page context, title, semantic entities, forms, buttons, and URLs to infer the user's immediate goal (e.g., "Booking roundtrip flight from JFK to LHR", "Vetting a vacation rental in Rome", "Evaluating Sony XM5 headphones deal", "Researching Stripe API webhooks").

2. CRITICAL COGNITIVE REASONING ("HOW CAN I ACTIVELY HELP THEM?"):
   Think deeply about what a smart user in this situation cares about that is NOT immediately obvious:
   - For Travel & Flights: Hidden baggage fees, layover risks, alternative airports, price volatility (book now vs wait).
   - For Accommodations & Stays: Hidden cleaning/service fees, neighborhood transit & safety, strict cancellation deadlines, host review gotchas.
   - For Products & Shopping: Value vs competitors, recurring defect patterns in customer reviews, return window & warranty legitimacy.
   - For Tech & Documentation: Missing prerequisites, version mismatches, breaking changes.
   - For General Browsing: Core takeaways, hidden catches, and logical next steps.

3. AUTONOMOUS DOM ANNOTATIONS & ACTION PLAN:
   - Identify 2-5 key interactive elements or sections on the page to annotate with purple callout boxes.
   - Provide concrete suggested actions and high-value proactive advice.

You MUST respond strictly with valid JSON conforming to this schema:
{
  "summary": "1-2 sentence executive summary of this page's purpose, status, or current state",
  "inferredIntent": "Concise description of the user's primary objective (e.g. 'Comparing flight deals from JFK to LHR', 'Booking Rome holiday apartment')",
  "pageGoal": "Precise inferred goal the user has right now",
  "copilotThinking": "1-2 sentence internal thought breakdown of what the user is weighing and how you actively help them make the best decision",
  "proactiveInsights": [
    "High-value insight or caveat tailored specifically to this task (e.g., baggage fees, neighborhood transit, price trends, cancellation traps)"
  ],
  "recommendations": [
    "Concrete, high-value navigation or decision tip",
    "Secondary hint or shortcut relevant to their goal"
  ],
  "suggestedActions": [
    {
      "label": "Action title",
      "type": "click" | "navigate" | "highlight",
      "targetHint": "CSS selector or text hint of element to click/view",
      "explanation": "Why this action is helpful"
    }
  ],
  "domHighlights": [
    {
      "selector": "CSS selector if detectable, or generic tag hint",
      "note": "Concise high-value insight displayed directly in purple badge (e.g. 'Compare with alternative airlines', 'Check cancellation deadline', 'Verify cleaning fee breakdown')",
      "textHint": "Exact or partial text matching the interesting element"
    }
  ]
}`;

  const semanticEntityStr = (pageContext.semanticEntity || pageContext.productInfo) ? `
- Detected Semantic Entity / Main Subject:
  * Name: ${pageContext.semanticEntity?.name || pageContext.productInfo?.productName || "N/A"}
  * Pricing / Fare / Rate: ${pageContext.semanticEntity?.price || pageContext.productInfo?.price || "N/A"}
  * Rating: ${pageContext.semanticEntity?.rating || pageContext.productInfo?.rating || "N/A"}
  * Reviews / Details: ${pageContext.semanticEntity?.reviewsCount || pageContext.productInfo?.reviewsCount || "N/A"}
  * Location / Route: ${pageContext.semanticEntity?.location || "N/A"}
  * Dates / Timeline: ${pageContext.semanticEntity?.dates || "N/A"}` : "";

  const userPrompt = `Current Page Details:
- Title: ${pageContext.title || "Untitled"}
- URL: ${pageContext.url}
- Domain: ${pageContext.domain}
- Headings: ${JSON.stringify(pageContext.headings || [])}
- Meta Description: ${pageContext.metaDescription || "N/A"}${semanticEntityStr}
- Interactive Form / Action Elements: ${JSON.stringify(pageContext.actionElements || [])}
- Condensed Body Text Snippet: ${pageContext.condensedText || ""}

Autonomous Background Web Research & Link Peek Context:
${research.formattedSummary}

Learned User Navigation Patterns:
- Top Visited Domains: ${patterns.topDomains.join(", ") || "None"}
- Discovered Interests: ${patterns.topInterests.join(", ") || "General browsing"}

Think carefully about what the user is trying to accomplish and how you can proactively help them. Identify 2-4 interesting items on the DOM (buttons, links, headings) and provide clear navigation guidance.`;

  const startTime = Date.now();
  console.log(`[Wayfinder Service Worker] Requesting page assistance for ${pageContext?.url} via ${providerId} (${model})`);

  try {
    const { data: guidance, usage } = await AIService.requestGuidance({
      providerId,
      apiKey,
      endpoint,
      model,
      systemPrompt,
      userPrompt,
      responseFormat: "json"
    });

    const durationMs = Date.now() - startTime;
    await recordMetrics(providerId, usage, durationMs);

    // Save debug log if debug mode enabled or recent
    await logDebugEntry({
      type: "PAGE_NAVIGATION_ANALYSIS",
      status: "SUCCESS",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      usage,
      page: {
        title: pageContext.title,
        url: pageContext.url,
        domain: pageContext.domain
      },
      request: {
        systemPrompt,
        userPrompt
      },
      response: guidance,
      research
    });

    return {
      success: true,
      provider: providerId,
      model,
      guidance,
      research,
      usage,
      prompts: {
        systemPrompt,
        userPrompt
      },
      domMarkersEnabled: wayfinder_settings.domMarkersEnabled !== false
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("Wayfinder AI guidance error:", error);

    await logDebugEntry({
      type: "PAGE_NAVIGATION_ANALYSIS",
      status: "ERROR",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      error: error.message,
      page: {
        title: pageContext.title,
        url: pageContext.url,
        domain: pageContext.domain
      },
      request: {
        systemPrompt,
        userPrompt
      }
    });

    return {
      success: false,
      error: error.message,
      prompts: {
        systemPrompt,
        userPrompt
      }
    };
  }
}

/**
 * Handle on-page selected text analysis
 */
async function handleSelectedTextAnalysis({ selectedText, pageUrl, pageTitle }) {
  const { wayfinder_settings } = await chrome.storage.local.get("wayfinder_settings");
  if (!wayfinder_settings || !wayfinder_settings.enabled) {
    return { success: false, disabled: true, error: "Wayfinder AI is currently paused/disabled." };
  }

  const providerId = wayfinder_settings.activeProvider || "ollama";
  const apiKey = providerId === "wayfinder_cloud"
    ? (wayfinder_settings.licenseKey || wayfinder_settings.apiKeys?.wayfinder_cloud || "")
    : (wayfinder_settings.apiKeys?.[providerId] || "");
  const endpoint = wayfinder_settings.customEndpoints?.[providerId] || PROVIDERS[providerId]?.defaultEndpoint;
  const model = wayfinder_settings.selectedModels?.[providerId] || PROVIDERS[providerId]?.defaultModel;

  const systemPrompt = `You are Wayfinder AI, an in-page reading & navigation copilot.
The user highlighted a section of text on a webpage.
Provide a clear, high-density analysis:
1. Quick Explanation / TL;DR (1-2 sentences)
2. Key takeaway or relevant action for navigation / decision-making
Keep formatting clean with bullet points and bold highlights. Keep response under 120 words.`;

  const userPrompt = `Page: ${pageTitle} (${pageUrl})\nSelected Text:\n"""\n${selectedText}\n"""`;
  const startTime = Date.now();
  console.log(`[Wayfinder Service Worker] Requesting text analysis for ${pageUrl} via ${providerId} (${model})`);

  try {
    const { data, usage } = await AIService.requestGuidance({
      providerId,
      apiKey,
      endpoint,
      model,
      systemPrompt,
      userPrompt,
      responseFormat: "text"
    });

    const durationMs = Date.now() - startTime;
    await recordMetrics(providerId, usage, durationMs);

    await logDebugEntry({
      type: "TEXT_SELECTION_ANALYSIS",
      status: "SUCCESS",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      usage,
      page: { title: pageTitle, url: pageUrl },
      request: { selectedText, systemPrompt, userPrompt },
      response: data.text
    });

    return {
      success: true,
      provider: providerId,
      model,
      analysis: data.text || "No analysis generated.",
      usage
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("Wayfinder AI selection analysis error:", error);

    await logDebugEntry({
      type: "TEXT_SELECTION_ANALYSIS",
      status: "ERROR",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      error: error.message,
      page: { title: pageTitle, url: pageUrl },
      request: { selectedText, systemPrompt, userPrompt }
    });

    return { success: false, error: error.message };
  }
}

/**
 * Handle interactive in-page chat with page & element context (Cmd+I)
 */
async function handleChatWithPageContext({ query, pageContext = {}, selectedText = "", chatHistory = [] }) {
  const { wayfinder_settings } = await chrome.storage.local.get("wayfinder_settings");
  if (!wayfinder_settings || !wayfinder_settings.enabled) {
    return { success: false, disabled: true, error: "Wayfinder AI is currently paused/disabled." };
  }

  const providerId = wayfinder_settings.activeProvider || "ollama";
  const apiKey = providerId === "wayfinder_cloud"
    ? (wayfinder_settings.licenseKey || wayfinder_settings.apiKeys?.wayfinder_cloud || "")
    : (wayfinder_settings.apiKeys?.[providerId] || "");
  const endpoint = wayfinder_settings.customEndpoints?.[providerId] || PROVIDERS[providerId]?.defaultEndpoint;
  const model = wayfinder_settings.selectedModels?.[providerId] || PROVIDERS[providerId]?.defaultModel;

  const systemPrompt = `You are Wayfinder AI Copilot, a brilliant, interactive in-page browser assistant.
You are directly embedded on this page with the user.
Your role:
- Autonomously deduce what the user is trying to accomplish on this page (booking flights, reserving stays/hotels, evaluating products, reading tech documentation, comparing SaaS tools, job searching, etc.).
- Proactively think about what hidden information, tradeoffs, or advice will genuinely help them (e.g. baggage fees, cancellation policies, neighborhood safety, price comparisons, defect patterns in reviews, documentation prerequisites).
- Keep responses concise, direct, and well-structured using markdown bullets and bold highlights.
- If the user asks about an element or action on the page, tell them clearly where to look or what to click.`;

  let historyContext = "";
  if (Array.isArray(chatHistory) && chatHistory.length > 0) {
    historyContext = "\n\nPrevious Conversation:\n" + chatHistory.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");
  }

  let researchContext = "";
  if (pageContext) {
    const research = await WebResearcher.gatherAutonomousContext(pageContext);
    if (research && research.formattedSummary && research.formattedSummary !== "None found within time window.") {
      researchContext = `\nAutonomous Background Research (Competitors & Link Intelligence):\n${research.formattedSummary}\n`;
    }
  }

  const userPrompt = `Current Page Information:
- Page Title: ${pageContext?.title || "Untitled"}
- URL: ${pageContext?.url || "N/A"}
- Domain: ${pageContext?.domain || "N/A"}
${pageContext?.productInfo ? `- Detected Product Data: ${JSON.stringify(pageContext.productInfo)}` : ""}
${selectedText ? `- User Highlighted / Selected Element: """${selectedText}"""` : ""}
- Key Headings: ${JSON.stringify(pageContext?.headings || [])}
- Condensed Page Text: ${pageContext?.condensedText ? pageContext.condensedText.slice(0, 1500) : "N/A"}${researchContext}
${historyContext}

User Question:
"${query}"`;

  const startTime = Date.now();
  console.log(`[Wayfinder Service Worker] Requesting chat copilot for ${pageContext?.url} via ${providerId} (${model})`);

  try {
    const { data, usage } = await AIService.requestGuidance({
      providerId,
      apiKey,
      endpoint,
      model,
      systemPrompt,
      userPrompt,
      responseFormat: "text"
    });

    const durationMs = Date.now() - startTime;
    await recordMetrics(providerId, usage, durationMs);

    await logDebugEntry({
      type: "CHAT_WITH_PAGE_CONTEXT",
      status: "SUCCESS",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      usage,
      page: { title: pageContext?.title, url: pageContext?.url },
      request: { query, selectedText, systemPrompt, userPrompt },
      response: data.text
    });

    return {
      success: true,
      provider: providerId,
      model,
      answer: data.text || "I was unable to generate a response for this query.",
      usage
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("Wayfinder AI chat error:", error);

    await logDebugEntry({
      type: "CHAT_WITH_PAGE_CONTEXT",
      status: "ERROR",
      provider: providerId,
      model,
      endpoint,
      durationMs,
      error: error.message,
      page: { title: pageContext?.title, url: pageContext?.url },
      request: { query, selectedText, systemPrompt, userPrompt }
    });

    return { success: false, error: error.message };
  }
}
