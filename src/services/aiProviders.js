/**
 * AI Provider Configurations and API Client
 * Supports OpenAI, Anthropic Claude, OpenRouter, Meta (Llama via Groq/OpenRouter), and Ollama (Local AI).
 * Returns content + token usage metrics where provided.
 */

export const PROVIDERS = {
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
    name: "Ollama (Local AI)",
    defaultEndpoint: "http://localhost:11434/api/chat",
    defaultModel: "llama3.2:latest",
    models: ["llama3.2:latest", "mistral:latest", "qwen2.5:latest"],
    requiresKey: false,
    isLocal: true
  }
};

export class AIService {
  /**
   * Send navigation guidance query or text selection analysis
   */
  static async requestGuidance({ providerId, apiKey, endpoint, model, systemPrompt, userPrompt, responseFormat = "json" }) {
    const config = PROVIDERS[providerId] || PROVIDERS.openai;
    const activeEndpoint = endpoint || config.defaultEndpoint;
    const activeModel = model || config.defaultModel;

    if (config.requiresKey && !apiKey) {
      throw new Error(`API Key is required for ${config.name}`);
    }

    if (providerId === "ollama") {
      return this._callOllama({ endpoint: activeEndpoint, model: activeModel, systemPrompt, userPrompt, responseFormat });
    } else if (providerId === "claude") {
      return this._callClaude({ endpoint: activeEndpoint, apiKey, model: activeModel, systemPrompt, userPrompt, responseFormat });
    } else {
      // Standard OpenAI-compatible format (OpenAI, OpenRouter, Meta/Groq)
      return this._callOpenAICompatible({ endpoint: activeEndpoint, apiKey, model: activeModel, systemPrompt, userPrompt, providerId, responseFormat });
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
      max_tokens: 600
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
      throw new Error(`AI Provider HTTP Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    const usage = {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    };

    const parsed = responseFormat === "json" ? this._parseJsonResponse(content) : { text: content };
    return { data: parsed, usage };
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
      throw new Error(`Claude HTTP Error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text;
    const usage = {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
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
      const content = data.message?.content;
      const usage = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      };

      const parsed = responseFormat === "json" ? this._parseJsonResponse(content) : { text: content };
      return { data: parsed, usage };
    } catch (err) {
      if (err.message.includes("Failed to fetch") || err.name === "TypeError") {
        throw new Error(`Cannot connect to local Ollama at ${endpoint}. Ensure Ollama is running ('ollama serve') and OLLAMA_ORIGINS="*" is set.`);
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
        } catch (inner) {
          // fallback
        }
      }
      return {
        summary: "Navigational guidance",
        recommendations: [rawText],
        pageGoal: "General navigation",
        suggestedActions: []
      };
    }
  }
}
