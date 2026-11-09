/**
 * Wayfinder AI Background Service Worker
 * Coordinates AI requests, pattern learning, extension state, and content messaging.
 */

import { AIService, PROVIDERS } from "./services/aiProviders.js";
import { PatternLearner } from "./services/patternLearner.js";

// Initialize default settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("wayfinder_settings");
  if (!current.wayfinder_settings) {
    const defaultSettings = {
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
      autoAssist: true // Automatically analyze page when navigation settles
    };
    await chrome.storage.local.set({ wayfinder_settings: defaultSettings });
  }
});

// Message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "REQUEST_PAGE_ASSISTANCE") {
    handlePageAssistance(message.payload, sender.tab?.id)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === "RECORD_PAGE_VISIT") {
    PatternLearner.recordVisit(message.payload)
      .then(res => sendResponse({ success: true, data: res }))
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
});

/**
 * Handle AI guidance request from content script or popup
 */
async function handlePageAssistance(pageContext, tabId) {
  const { wayfinder_settings } = await chrome.storage.local.get("wayfinder_settings");
  if (!wayfinder_settings || !wayfinder_settings.enabled) {
    return { success: false, disabled: true, error: "Wayfinder AI is currently paused/disabled." };
  }

  const providerId = wayfinder_settings.activeProvider || "ollama";
  const apiKey = wayfinder_settings.apiKeys?.[providerId] || "";
  const endpoint = wayfinder_settings.customEndpoints?.[providerId] || PROVIDERS[providerId]?.defaultEndpoint;
  const model = wayfinder_settings.selectedModels?.[providerId] || PROVIDERS[providerId]?.defaultModel;

  // Retrieve user behavioral patterns for personalized context
  const patterns = await PatternLearner.getPatternContext();

  const systemPrompt = `You are Wayfinder AI, an intelligent web navigation co-pilot embedded into the user's browser.
Your mission is to understand the user's current webpage context, their past navigation patterns, and guide them with high-value navigational next steps and page insights.

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
      "note": "Helpful prompt tag displayed directly over this area"
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

Learned User Navigation Patterns & Habits:
- Top Visited Domains: ${patterns.topDomains.join(", ") || "None yet"}
- Discovered Interests: ${patterns.topInterests.join(", ") || "General browsing"}
- Frequent Transitions: ${patterns.frequentWorkflows.join(", ") || "None"}
- Recent 5 Page Trail: ${JSON.stringify(patterns.recentTrail)}

Analyze this page context against the user's navigation trajectory. Provide concise, smart guidance and 1-3 targeted recommendations.`;

  try {
    const aiResponse = await AIService.requestGuidance({
      providerId,
      apiKey,
      endpoint,
      model,
      systemPrompt,
      userPrompt
    });

    return {
      success: true,
      provider: providerId,
      model,
      guidance: aiResponse
    };
  } catch (error) {
    console.error("Wayfinder AI background guidance error:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
