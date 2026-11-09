/**
 * Wayfinder AI Background Service Worker
 * Coordinates AI requests, metrics tracking, pattern learning, and DOM communication.
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
  domMarkersEnabled: true, // Setting to update HTML DOM with purple markers on interesting items
  learnPatterns: true      // Setting to track user workflows locally
};

const DEFAULT_METRICS = {
  totalCalls: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  lastCallTimestamp: null,
  providerBreakdown: {}
};

// Initialize default settings & metrics on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["wayfinder_settings", "wayfinder_metrics"]);
  if (!current.wayfinder_settings) {
    await chrome.storage.local.set({ wayfinder_settings: DEFAULT_SETTINGS });
  }
  if (!current.wayfinder_metrics) {
    await chrome.storage.local.set({ wayfinder_metrics: DEFAULT_METRICS });
  }
});

// Update metrics helper
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

// Message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PAGE_ASSISTANCE") {
    handlePageAssistance(message.payload, sender.tab?.id)
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

  // Pattern context if enabled
  let patterns = { topDomains: [], topInterests: [], frequentWorkflows: [], recentTrail: [] };
  if (wayfinder_settings.learnPatterns !== false) {
    patterns = await PatternLearner.getPatternContext();
  }

  const systemPrompt = `You are Wayfinder AI, an intelligent web navigation co-pilot embedded into the user's browser.
Your mission is to understand the user's current webpage context, their navigation habits, and guide them with high-value navigational next steps and page insights.

You MUST respond strictly with valid JSON conforming to this schema:
{
  "summary": "1-2 sentence executive summary of this page's purpose and status",
  "pageGoal": "Inferred goal user likely has on this page (e.g. checkout, reading docs, comparing prices)",
  "recommendations": [
    "Concrete navigation tip or key element they should focus on",
    "Secondary hint or shortcut relevant to their goal"
  ],
  "suggestedActions": [
    {
      "label": "Action title (e.g., 'View Pricing Table' or 'Jump to API Docs')",
      "type": "click" | "navigate" | "highlight",
      "targetHint": "CSS selector or text hint of element to click/view (e.g. 'a[href*=\"pricing\"]' or text keyword)",
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

    await recordMetrics(providerId, usage);

    return {
      success: true,
      provider: providerId,
      model,
      guidance,
      usage,
      domMarkersEnabled: wayfinder_settings.domMarkersEnabled !== false
    };
  } catch (error) {
    console.error("Wayfinder AI guidance error:", error);
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

    await recordMetrics(providerId, usage);

    return {
      success: true,
      provider: providerId,
      model,
      analysis: data.text || "No analysis generated.",
      usage
    };
  } catch (error) {
    console.error("Wayfinder AI selection analysis error:", error);
    return { success: false, error: error.message };
  }
}
