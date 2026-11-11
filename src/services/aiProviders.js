/**
 * AI Provider Configurations and API Client
 * Supports OpenAI, Anthropic Claude, OpenRouter, Meta (Llama via Groq/OpenRouter), and Ollama (Local AI).
 * Returns content + token usage metrics where provided.
 */

export const PROVIDERS = {
  wayfinder_cloud: {
    id: "wayfinder_cloud",
    name: "Wayfinder Cloud (Subscription)",
    defaultEndpoint: "https://wayfinder-ai-gateway-production-038471e5.up.railway.app",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "claude-3-5-haiku", "gpt-4o"],
    requiresKey: false,
    requiresLicense: true,
    isLocal: false
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    requiresKey: true,
    isLocal: false
  },
  claude: {
    id: "claude",
    name: "Anthropic Claude",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-3-5-haiku-20241022",
    models: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
    requiresKey: true,
    isLocal: false
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
    models: [
      "meta-llama/llama-3.1-8b-instruct:free",
      "meta-llama/llama-3.1-70b-instruct",
      "google/gemini-flash-1.5",
      "anthropic/claude-3.5-sonnet"
    ],
    requiresKey: true,
    isLocal: false
  },
  meta: {
    id: "meta",
    name: "Meta / Muse (Llama API)",
    defaultEndpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.1-8b-instant",
    models: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"],
    requiresKey: true,
    isLocal: false
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Mac Local AI)",
    defaultEndpoint: "http://localhost:11434/api/chat",
    defaultModel: "llama3.2:latest",
    models: ["llama3.2:latest", "mistral:latest", "qwen2.5:latest"],
    requiresKey: false,
    isLocal: true
  },
  chrome_builtin: {
    id: "chrome_builtin",
    name: "Chrome Built-in AI (Gemini Nano on Mac)",
    defaultEndpoint: "chrome://flags/#optimization-guide-on-device-model",
    defaultModel: "gemini-nano",
    models: ["gemini-nano"],
    requiresKey: false,
    isLocal: true
  }
};

export class AIService {
  /**
   * Test connection to provider with given key / endpoint / model
   */
  static async testConnection({ providerId, apiKey, endpoint, model }) {
    const config = PROVIDERS[providerId] || PROVIDERS.openai;
    const activeEndpoint = endpoint || config.defaultEndpoint;
    const activeModel = model || config.defaultModel;

    if (providerId === "wayfinder_cloud") {
      const verifyUrl = `${activeEndpoint.replace(/\/+$/, "")}/api/v1/auth/verify`;
      try {
        const res = await fetch(verifyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseKey: apiKey })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to verify license with Wayfinder Cloud");
        }
        return {
          success: true,
          provider: "wayfinder_cloud",
          model: activeModel,
          reply: `✓ Subscription Active: ${data.tierName || data.tier} (Remaining: ${data.quota?.remaining ?? "N/A"}/${data.quota?.dailyLimit ?? "N/A"})`,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        };
      } catch (err) {
        throw new Error(`Wayfinder Cloud Error: ${err.message}`);
      }
    }

    if (config.requiresKey && !apiKey) {
      throw new Error(`API key is required to test ${config.name}.`);
    }

    const testPrompt = "Ping. Reply with strictly: pong";
    const res = await this.requestGuidance({
      providerId,
      apiKey,
      endpoint: activeEndpoint,
      model: activeModel,
      systemPrompt: "You are a connectivity tester.",
      userPrompt: testPrompt,
      responseFormat: "text"
    });

    return {
      success: true,
      provider: providerId,
      model: activeModel,
      reply: res.data?.text || "Connected successfully!",
      usage: res.usage
    };
  }

  /**
   * Send navigation guidance query or text selection analysis
   */
  static async requestGuidance({ providerId, apiKey, endpoint, model, systemPrompt, userPrompt, responseFormat = "json" }) {
    const config = PROVIDERS[providerId] || PROVIDERS.openai;
    const activeEndpoint = endpoint || config.defaultEndpoint;
    const activeModel = model || config.defaultModel;

    if (providerId === "wayfinder_cloud") {
      return this._callWayfinderCloud({ endpoint: activeEndpoint, licenseKey: apiKey, model: activeModel, systemPrompt, userPrompt, responseFormat });
    }

    if (config.requiresKey && !apiKey) {
      throw new Error(`API Key is required for ${config.name}. Please enter your key in the extension popup.`);
    }

    if (providerId === "ollama") {
      return this._callOllama({ endpoint: activeEndpoint, model: activeModel, systemPrompt, userPrompt, responseFormat });
    } else if (providerId === "chrome_builtin") {
      return this._callChromeBuiltinAI({ systemPrompt, userPrompt, responseFormat });
    } else if (providerId === "claude") {
      return this._callClaude({ endpoint: activeEndpoint, apiKey, model: activeModel, systemPrompt, userPrompt, responseFormat });
    } else {
      return this._callOpenAICompatible({ endpoint: activeEndpoint, apiKey, model: activeModel, systemPrompt, userPrompt, providerId, responseFormat });
    }
  }

  static async _callWayfinderCloud({ endpoint, licenseKey, model, systemPrompt, userPrompt, responseFormat }) {
    const actionPath = responseFormat === "json" ? "guidance" : "chat";
    const url = `${endpoint.replace(/\/+$/, "")}/api/v1/ai/${actionPath}`;

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${licenseKey || ""}`
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        systemPrompt,
        userPrompt,
        responseFormat,
        model
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (res.status === 401) {
        throw new Error("Invalid or expired Wayfinder Cloud license key. Please check your key in Settings.");
      }
      if (res.status === 429) {
        throw new Error(data.error || "Daily AI quota reached. Upgrade to Pro at wayfinderai.com/upgrade");
      }
      throw new Error(data.error || `Wayfinder Cloud error (${res.status})`);
    }

    if (responseFormat === "json") {
      return {
        data: data.guidance,
        usage: data.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      };
    } else {
      return {
        data: { text: data.answer || data.analysis || "" },
        usage: data.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      };
    }
  }

  static async _callOpenAICompatible({ endpoint, apiKey, model, systemPrompt, userPrompt, providerId, responseFormat }) {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    if (providerId === "openrouter") {
      headers["HTTP-Referer"] = "chrome-extension://wayfinder-ai";
      headers["X-Title"] = "Wayfinder AI Chrome Extension";
    }

    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 1200
    };

    if (responseFormat === "json") {
      payload.response_format = { type: "json_object" };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch (e) {}
      throw new Error(`(${res.status}) ${msg}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    let promptTokens = data.usage?.prompt_tokens || 0;
    let completionTokens = data.usage?.completion_tokens || 0;
    if (!promptTokens) {
      promptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    }
    if (!completionTokens) {
      completionTokens = Math.ceil(content.length / 4);
    }

    const usage = {
      promptTokens,
      completionTokens,
      totalTokens: data.usage?.total_tokens || (promptTokens + completionTokens)
    };

    const parsed = responseFormat === "json" ? this._parseJsonResponse(content) : { text: content };
    return { data: parsed, usage };
  }

  static async _callChromeBuiltinAI({ systemPrompt, userPrompt, responseFormat }) {
    // Check if Chrome's Prompt API (Gemini Nano) is available in window or service worker context
    const aiApi = (typeof globalThis !== "undefined" && globalThis.ai) ||
                  (typeof window !== "undefined" && (window.ai || window.modelExecutionService)) ||
                  (typeof self !== "undefined" && (self.ai || self.modelExecutionService)) || null;

    if (!aiApi || (!aiApi.languageModel && !aiApi.createTextSession)) {
      throw new Error("Chrome Built-in AI (Gemini Nano) is not enabled on this browser. Enable it in chrome://flags/#optimization-guide-on-device-model and chrome://flags/#prompt-api-for-gemini-nano");
    }

    try {
      let session;
      if (aiApi.languageModel) {
        const capabilities = await aiApi.languageModel.capabilities?.();
        if (capabilities && capabilities.available === "no") {
          throw new Error("Gemini Nano model is not downloaded or supported on this device. Visit chrome://components to download 'Optimization Guide On Device Model'.");
        }
        session = await aiApi.languageModel.create({
          systemPrompt: systemPrompt || undefined
        });
      } else {
        session = await aiApi.createTextSession();
      }

      const fullPrompt = `${systemPrompt}\n\nTask: ${userPrompt}`;
      const responseText = await session.prompt(fullPrompt);

      const promptTokens = Math.ceil(fullPrompt.length / 4);
      const completionTokens = Math.ceil(responseText.length / 4);

      const usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      };

      const parsed = responseFormat === "json" ? this._parseJsonResponse(responseText) : { text: responseText };
      return { data: parsed, usage };
    } catch (err) {
      throw new Error(`Chrome Built-in AI Error: ${err.message}`);
    }
  }

  static async _callClaude({ endpoint, apiKey, model, systemPrompt, userPrompt, responseFormat }) {
    const headers = {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "dangerously-allow-browser": "true"
    };

    const payload = {
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 600,
      temperature: 0.2
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch (e) {}
      throw new Error(`(${res.status}) ${msg}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text || "";
    const promptTokens = data.usage?.input_tokens || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    const completionTokens = data.usage?.output_tokens || Math.ceil(content.length / 4);

    const usage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };

    const parsed = responseFormat === "json" ? this._parseJsonResponse(content) : { text: content };
    return { data: parsed, usage };
  }

  static async _callOllama({ endpoint, model, systemPrompt, userPrompt, responseFormat }) {
    const payload = {
      model,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    if (responseFormat === "json") {
      payload.format = "json";
    }

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama Error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const content = data.message?.content || "";
      
      const promptTokens = data.prompt_eval_count || Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const completionTokens = data.eval_count || Math.ceil(content.length / 4);

      const usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      };

      const parsed = responseFormat === "json" ? this._parseJsonResponse(content) : { text: content };
      return { data: parsed, usage };
    } catch (err) {
      if (err.message.includes("Failed to fetch") || err.name === "TypeError") {
        throw new Error(`Cannot connect to local Ollama at ${endpoint}. Make sure Ollama is running ('ollama serve') or switch to OpenAI/Claude/OpenRouter in the extension popup.`);
      }
      throw err;
    }
  }

  static _parseJsonResponse(rawText) {
    if (!rawText) return null;
    try {
      return JSON.parse(rawText);
    } catch (e) {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (inner) {}
      }
      return {
        summary: "Navigational guidance",
        recommendations: [rawText],
        pageGoal: "General navigation",
        suggestedActions: [],
        domHighlights: []
      };
    }
  }
}
