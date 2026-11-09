/**
 * Wayfinder AI Background Service Worker
 * Coordinates AI requests, metrics tracking, developer debugging logs, pattern learning, and DOM communication.
 */

import { AIService, PROVIDERS } from "./services/aiProviders.js";
import { PatternLearner } from "./services/patternLearner.js";

const DEFAULT_SETTINGS = {
  enabled: true,
  activeProvider: "ollama",
  apiKeys: {
    openai: "",
    claude: "",
    openrouter: "",
    meta: ""
  },
  customEndpoints: {
    ollama: "http://localhost:11434/api/chat"
  },
  selectedModels: {
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
  lastCallTimestamp: null,
  providerBreakdown: {}
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
async function recordMetrics(providerId, usage) {
  const data = await chrome.storage.local.get("wayfinder_metrics");
  const metrics = data.wayfinder_metrics || { ...DEFAULT_METRICS };

  metrics.totalCalls = (metrics.totalCalls || 0) + 1;
  metrics.promptTokens = (metrics.promptTokens || 0) + (usage?.promptTokens || 0);
  metrics.completionTokens = (metrics.completionTokens || 0) + (usage?.completionTokens || 0);
  metrics.totalTokens = (metrics.totalTokens || 0) + (usage?.totalTokens || 0);
  metrics.lastCallTimestamp = Date.now();

  metrics.providerBreakdown = metrics.providerBreakdown || {};
  metrics.providerBreakdown[providerId] = (metrics.providerBreakdown[providerId] || 0) + 1;

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

  if (message.type === "RESET_METRICS") {
    chrome.storage.local.set({ wayfinder_metrics: DEFAULT_METRICS })
      .then(() => sendResponse({ success: true }))
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
    await recordMetrics(providerId, result.usage);

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
  const apiKey = wayfinder_settings.apiKeys?.[providerId] || "";
  const endpoint = wayfinder_settings.customEndpoints?.[providerId] || PROVIDERS[providerId]?.defaultEndpoint;
  const model = wayfinder_settings.selectedModels?.[providerId] || PROVIDERS[providerId]?.defaultModel;

  let patterns = { topDomains: [], topInterests: [], frequentWorkflows: [], recentTrail: [] };
  if (wayfinder_settings.learnPatterns !== false) {
    patterns = await PatternLearner.getPatternContext();
  }

  const systemPrompt = `You are Wayfinder AI, an intelligent web navigation & product copilot embedded in the browser.
Your mission is to understand the webpage context (including e-commerce product pages like Amazon, BestBuy, eBay, Walmart, documentation, SaaS tools, and articles), and guide the user with high-value navigational advice, critical product insights, and element annotations.

Special Domain Instructions:
- If this is an E-COMMERCE page (e.g. Amazon, Walmart, BestBuy): Evaluate the product thoroughly. In your summary and recommendations, highlight price/value caveats, suggest if it can be found cheaper elsewhere or on alternative sites (or price tracker tools like CamelCamelCamel/Keepa), flag review rating anomalies or key specifications, and annotate buy/review/price elements.
- If this is a DOCS/TECH page: Emphasize quickstarts, code samples, API tables, and versions.
- If this is GENERAL CONTENT: Summarize core takeaway and primary action items.

You MUST respond strictly with valid JSON conforming to this schema:
{
  "summary": "1-2 sentence executive summary of this page's purpose, status, or product overview",
  "pageGoal": "Inferred goal user likely has on this page (e.g. 'Evaluating Sony Headphones Deal', 'Researching API docs')",
  "recommendations": [
    "Concrete, high-value navigation or decision tip (e.g., 'Check price history on CamelCamelCamel or alternative seller before checkout')",
    "Secondary hint or shortcut relevant to their goal"
  ],
  "suggestedActions": [
    {
      "label": "Action title (e.g., 'Inspect Customer Reviews & Ratings' or 'Compare Price Tables')",
      "type": "click" | "navigate" | "highlight",
      "targetHint": "CSS selector or text hint of element to click/view",
      "explanation": "Why this action is helpful"
    }
  ],
  "domHighlights": [
    {
      "selector": "CSS selector if detectable, or generic tag hint",
      "note": "Helpful prompt tag displayed directly over this area",
      "textHint": "Exact or partial text matching the interesting element"
    }
  ]
}`;

  const userPrompt = `Current Page Details:
- Title: ${pageContext.title || "Untitled"}
- URL: ${pageContext.url}
- Domain: ${pageContext.domain}
- Headings: ${JSON.stringify(pageContext.headings || [])}
- Meta Description: ${pageContext.metaDescription || "N/A"}
- Interactive Form / Action Elements: ${JSON.stringify(pageContext.actionElements || [])}
- Condensed Body Text Snippet: ${pageContext.condensedText || ""}

Learned User Navigation Patterns:
- Top Visited Domains: ${patterns.topDomains.join(", ") || "None"}
- Discovered Interests: ${patterns.topInterests.join(", ") || "General browsing"}

Analyze this page context. Identify 2-4 interesting items on the DOM (buttons, links, headings) and provide clear navigation guidance.`;

  const startTime = Date.now();

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
    await recordMetrics(providerId, usage);

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
      response: guidance
    });

    return {
      success: true,
      provider: providerId,
      model,
      guidance,
      usage,
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

    return { success: false, error: error.message };
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
  const apiKey = wayfinder_settings.apiKeys?.[providerId] || "";
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
    await recordMetrics(providerId, usage);

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
  const apiKey = wayfinder_settings.apiKeys?.[providerId] || "";
  const endpoint = wayfinder_settings.customEndpoints?.[providerId] || PROVIDERS[providerId]?.defaultEndpoint;
  const model = wayfinder_settings.selectedModels?.[providerId] || PROVIDERS[providerId]?.defaultModel;

  const systemPrompt = `You are Wayfinder AI Copilot, a brilliant, interactive in-page browser assistant.
You are directly embedded on this page with the user.
Your role:
- Answer questions accurately using the provided page context, title, metadata, interactive elements, and any selected text or product data.
- E-COMMERCE INTELLIGENCE (Amazon, Walmart, BestBuy, eBay, etc.): If the user is viewing a product or asking about price/value, provide honest, critical insights: evaluate whether it's a good deal, recommend checking price tracker tools (like CamelCamelCamel, Keepa, Google Shopping), warn about potential counterfeit risks or inflated MSRP, summarize common user sentiment, and suggest cheaper or higher-rated alternatives if applicable.
- Keep responses concise, direct, and well-structured using markdown bullets and bold highlights.
- If the user asks about an element or action on the page, tell them clearly where to look or what to click.`;

  let historyContext = "";
  if (Array.isArray(chatHistory) && chatHistory.length > 0) {
    historyContext = "\n\nPrevious Conversation:\n" + chatHistory.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join("\n");
  }

  const userPrompt = `Current Page Information:
- Page Title: ${pageContext?.title || "Untitled"}
- URL: ${pageContext?.url || "N/A"}
- Domain: ${pageContext?.domain || "N/A"}
${pageContext?.productInfo ? `- Detected Product Data: ${JSON.stringify(pageContext.productInfo)}` : ""}
${selectedText ? `- User Highlighted / Selected Element: """${selectedText}"""` : ""}
- Key Headings: ${JSON.stringify(pageContext?.headings || [])}
- Condensed Page Text: ${pageContext?.condensedText ? pageContext.condensedText.slice(0, 1500) : "N/A"}
${historyContext}

User Question:
"${query}"`;

  const startTime = Date.now();

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
    await recordMetrics(providerId, usage);

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
