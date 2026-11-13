/**
 * Wayfinder AI — Sophisticated Multi-Tier Memory & Context Engine
 *
 * Architecture:
 * 1. Long-Term Memory: Enduring user bio, identity, communication preferences, invariant rules.
 * 2. Project Memory: Active project context, tech stacks, architectural decisions, conventions.
 * 3. Working Context: Ephemeral session context, recent objectives, active tasks (with recency decay).
 * 4. Domain & Tool Knowledge: Specific facts, gotchas, workflows bound to domains or tools.
 *
 * Capabilities:
 * - Hybrid Retrieval: Lexical (BM25/TF-IDF) + Domain Affinity + Project Match + Importance + Recency Decay.
 * - Dynamic Token Budget Optimizer: Guarantees essential directives without overflowing LLM context.
 * - Import / Export: Imports from ChatGPT (custom instructions, conversations.json, bullet memories)
 *   and Claude (project knowledge, system prompt, markdown); exports to clean JSON or Claude/ChatGPT Markdown.
 */

const MEMORY_STORAGE_KEY = "wayfinder_memory_store";
const CONFIG_STORAGE_KEY = "wayfinder_memory_config";

// In-memory fallback for Node.js test environments or when chrome.storage is unavailable
let _inMemoryStore = null;
let _inMemoryConfig = null;

export const MEMORY_TYPES = {
  LONG_TERM: "long_term",
  PROJECT: "project",
  WORKING_CONTEXT: "working_context",
  KNOWLEDGE: "knowledge"
};

const DEFAULT_CONFIG = {
  activeProject: "Wayfinder AI",
  defaultTokenBudget: 1000,
  weights: {
    lexical: 1.5,
    domain: 2.0,
    project: 2.2,
    importance: 1.2,
    recency: 0.8
  },
  quotas: {
    long_term: 0.25,     // 25% of token budget
    project: 0.40,       // 40% of token budget
    knowledge: 0.20,     // 20% of token budget
    working_context: 0.15 // 15% of token budget
  }
};

const DEFAULT_STARTER_MEMORIES = [
  {
    id: "mem_starter_bio",
    type: MEMORY_TYPES.LONG_TERM,
    title: "Senior Full-Stack Developer Profile",
    content: "Senior software engineer with expertise in TypeScript, Node.js, modern web standards, and cloud deployments. Prefers concise, direct answers, bulleted tradeoffs, and production-ready code with zero fluff.",
    category: "bio",
    project: "Global",
    tags: ["typescript", "nodejs", "concise", "senior", "engineering"],
    domains: [],
    importance: 5,
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 30,
    accessCount: 1,
    lastAccessedAt: Date.now(),
    source: "default"
  },
  {
    id: "mem_starter_project",
    type: MEMORY_TYPES.PROJECT,
    title: "Wayfinder AI Project Overview",
    content: "Wayfinder AI is an autonomous, context-aware Chrome Extension and cloud gateway. Uses Vanilla JS frontend, Chrome Extension Manifest V3, Node.js server gateway deployed on Railway, and Stripe for subscriptions. Enforces high-density in-page navigation assistance.",
    category: "architecture",
    project: "Wayfinder AI",
    tags: ["wayfinder", "chrome-extension", "railway", "stripe", "manifest-v3", "architecture"],
    domains: ["github.com", "railway.app", "stripe.com"],
    importance: 5,
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 14,
    accessCount: 1,
    lastAccessedAt: Date.now(),
    source: "default"
  },
  {
    id: "mem_starter_railway_knowledge",
    type: MEMORY_TYPES.KNOWLEDGE,
    title: "Railway Deployment & Secret Protocol",
    content: "All cloud secrets (OPENAI_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) are stored strictly in Railway environment variables. The server gateway isolates keys from client extensions and masks all error messages against credential leakage.",
    category: "gotcha",
    project: "Wayfinder AI",
    tags: ["railway", "security", "secrets", "api-key", "deployment"],
    domains: ["railway.app", "github.com"],
    importance: 4,
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 86400000 * 7,
    accessCount: 1,
    lastAccessedAt: Date.now(),
    source: "default"
  }
];

export class MemoryManager {
  /**
   * Helper: Get raw storage wrapper (Chrome Storage or in-memory fallback)
   */
  static async _getRawStorage() {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get([MEMORY_STORAGE_KEY, CONFIG_STORAGE_KEY]);
      return {
        store: data[MEMORY_STORAGE_KEY] || null,
        config: data[CONFIG_STORAGE_KEY] || null
      };
    }
    return {
      store: _inMemoryStore,
      config: _inMemoryConfig
    };
  }

  /**
   * Helper: Save raw storage wrapper
   */
  static async _saveRawStorage(store, config) {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const payload = {};
      if (store !== undefined) payload[MEMORY_STORAGE_KEY] = store;
      if (config !== undefined) payload[CONFIG_STORAGE_KEY] = config;
      await chrome.storage.local.set(payload);
    } else {
      if (store !== undefined) _inMemoryStore = store;
      if (config !== undefined) _inMemoryConfig = config;
    }
  }

  /**
   * Initialize or retrieve entire memory store
   * @returns {Promise<{ long_term: Array, project: Array, working_context: Array, knowledge: Array }>}
   */
  static async getStore() {
    const { store } = await this._getRawStorage();
    if (!store) {
      const initialStore = {
        [MEMORY_TYPES.LONG_TERM]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.LONG_TERM),
        [MEMORY_TYPES.PROJECT]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.PROJECT),
        [MEMORY_TYPES.WORKING_CONTEXT]: [],
        [MEMORY_TYPES.KNOWLEDGE]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.KNOWLEDGE)
      };
      await this._saveRawStorage(initialStore, DEFAULT_CONFIG);
      return initialStore;
    }

    // Ensure all 4 partition keys exist
    for (const type of Object.values(MEMORY_TYPES)) {
      if (!Array.isArray(store[type])) {
        store[type] = [];
      }
    }
    return store;
  }

  /**
   * Get memory configuration
   */
  static async getConfig() {
    const { config } = await this._getRawStorage();
    return config ? { ...DEFAULT_CONFIG, ...config } : { ...DEFAULT_CONFIG };
  }

  /**
   * Update memory configuration (e.g. activeProject, defaultTokenBudget)
   */
  static async updateConfig(patch) {
    const current = await this.getConfig();
    const updated = { ...current, ...patch };
    await this._saveRawStorage(undefined, updated);
    return updated;
  }

  /**
   * Add a new memory entry
   */
  static async addMemory({
    type = MEMORY_TYPES.LONG_TERM,
    title,
    content,
    category = "general",
    project = "Global",
    tags = [],
    domains = [],
    importance = 3,
    source = "manual"
  }) {
    if (!content || !content.trim()) {
      throw new Error("Memory content cannot be empty.");
    }

    const store = await this.getStore();
    const validatedType = Object.values(MEMORY_TYPES).includes(type) ? type : MEMORY_TYPES.LONG_TERM;

    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const newMemory = {
      id,
      type: validatedType,
      title: title ? title.trim() : content.trim().slice(0, 40) + "...",
      content: content.trim(),
      category: category.trim().toLowerCase(),
      project: project ? project.trim() : "Global",
      tags: Array.isArray(tags) ? tags.map(t => t.trim().toLowerCase()).filter(Boolean) : [],
      domains: Array.isArray(domains) ? domains.map(d => d.trim().toLowerCase()).filter(Boolean) : [],
      importance: Math.min(5, Math.max(1, Number(importance) || 3)),
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      source
    };

    store[validatedType].unshift(newMemory);
    await this._saveRawStorage(store, undefined);
    return newMemory;
  }

  /**
   * Update an existing memory
   */
  static async updateMemory(id, patch = {}) {
    const store = await this.getStore();
    let found = null;

    for (const type of Object.values(MEMORY_TYPES)) {
      const idx = store[type].findIndex(m => m.id === id);
      if (idx !== -1) {
        // If type changed, move it to the new partition
        const targetType = patch.type && Object.values(MEMORY_TYPES).includes(patch.type)
          ? patch.type
          : type;

        const updated = {
          ...store[type][idx],
          ...patch,
          id, // immutable id
          updatedAt: Date.now()
        };

        if (targetType === type) {
          store[type][idx] = updated;
        } else {
          store[type].splice(idx, 1);
          store[targetType].unshift(updated);
        }

        found = updated;
        break;
      }
    }

    if (!found) {
      throw new Error(`Memory with ID "${id}" not found.`);
    }

    await this._saveRawStorage(store, undefined);
    return found;
  }

  /**
   * Delete a memory entry by ID
   */
  static async deleteMemory(id) {
    const store = await this.getStore();
    let deleted = false;

    for (const type of Object.values(MEMORY_TYPES)) {
      const initialLen = store[type].length;
      store[type] = store[type].filter(m => m.id !== id);
      if (store[type].length < initialLen) {
        deleted = true;
      }
    }

    if (deleted) {
      await this._saveRawStorage(store, undefined);
    }
    return deleted;
  }

  /**
   * Retrieve all memories, optionally filtered
   */
  static async listMemories({ type, project, tag, search } = {}) {
    const store = await this.getStore();
    let results = [];

    const typesToInspect = type && store[type] ? [type] : Object.values(MEMORY_TYPES);
    for (const t of typesToInspect) {
      results.push(...store[t]);
    }

    if (project && project !== "All") {
      const pLower = project.toLowerCase();
      results = results.filter(m => m.project.toLowerCase() === pLower || m.project.toLowerCase() === "global");
    }

    if (tag) {
      const tLower = tag.toLowerCase();
      results = results.filter(m => m.tags.includes(tLower));
    }

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags.some(t => t.includes(q))
      );
    }

    // Sort by importance DESC, then updatedAt DESC
    return results.sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt);
  }

  /**
   * Record a short-term working context item (e.g. current task, active product comparison)
   */
  static async recordWorkingContext(content, { title = "Active Context", tags = [], project = null } = {}) {
    const config = await this.getConfig();
    const activeProject = project || config.activeProject || "Global";

    return this.addMemory({
      type: MEMORY_TYPES.WORKING_CONTEXT,
      title,
      content,
      category: "session",
      project: activeProject,
      tags: [...tags, "working_context"],
      importance: 4,
      source: "auto_working_context"
    });
  }

  /**
   * Estimate token count of a string (~4 chars per token for English text)
   */
  static estimateTokens(text = "") {
    if (!text || typeof text !== "string") return 0;
    return Math.max(1, Math.ceil(text.length / 3.8));
  }

  /**
   * Hybrid Relevance Scoring Algorithm
   * Scores an individual memory against the active user query, page context, active project, and domain.
   */
  static _scoreMemory(memory, { queryTokens, domain, activeProject, weights }) {
    const now = Date.now();

    // 1. Lexical / Keyword BM25-like Score
    let lexicalHits = 0;
    const memoryTokens = new Set([
      ...this._tokenize(memory.title),
      ...this._tokenize(memory.content),
      ...memory.tags
    ]);

    for (const qTok of queryTokens) {
      if (memoryTokens.has(qTok)) {
        lexicalHits += 1;
      }
    }
    // Saturation curve
    const lexicalScore = queryTokens.size > 0 ? (lexicalHits / (lexicalHits + 1.2)) : 0.2;

    // 2. Domain Affinity Score
    let domainScore = 0;
    if (domain) {
      const cleanDomain = domain.toLowerCase().replace(/^www\./, "");
      if (memory.domains?.some(d => cleanDomain.includes(d) || d.includes(cleanDomain))) {
        domainScore = 1.0;
      } else if (memory.content.toLowerCase().includes(cleanDomain)) {
        domainScore = 0.6;
      }
    }

    // 3. Project Affinity Score
    let projectScore = 0;
    if (memory.type === MEMORY_TYPES.PROJECT || memory.project) {
      const memProject = (memory.project || "").toLowerCase();
      const targetProject = (activeProject || "").toLowerCase();
      if (memProject === "global") {
        projectScore = 0.5;
      } else if (targetProject && (memProject.includes(targetProject) || targetProject.includes(memProject))) {
        projectScore = 1.0;
      }
    }

    // 4. Importance Weight (normalized 1-5 to 0.2 - 1.0)
    const importanceScore = (memory.importance || 3) / 5;

    // 5. Recency Decay
    let recencyScore = 1.0;
    const ageHours = Math.max(0, (now - memory.updatedAt) / (1000 * 60 * 60));

    if (memory.type === MEMORY_TYPES.WORKING_CONTEXT) {
      // Fast exponential decay for working context (half-life of 6 hours)
      recencyScore = Math.exp(-0.693 * (ageHours / 6));
    } else if (memory.type === MEMORY_TYPES.LONG_TERM) {
      // Zero decay for core long-term directives
      recencyScore = 1.0;
    } else {
      // Gentle decay for project and domain knowledge (half-life of 720 hours / 30 days)
      recencyScore = Math.exp(-0.693 * (ageHours / 720));
    }

    // Composite Weighted Score
    const totalScore =
      (weights.lexical * lexicalScore) +
      (weights.domain * domainScore) +
      (weights.project * projectScore) +
      (weights.importance * importanceScore) +
      (weights.recency * recencyScore);

    return {
      totalScore,
      breakdown: {
        lexicalScore,
        domainScore,
        projectScore,
        importanceScore,
        recencyScore
      }
    };
  }

  /**
   * Tokenize text into normalized unique keywords (strips stop words)
   */
  static _tokenize(text = "") {
    if (!text || typeof text !== "string") return new Set();
    const STOP_WORDS = new Set([
      "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
      "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
      "by", "can", "did", "do", "does", "doing", "don", "down", "during", "each", "few", "for",
      "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself",
      "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
      "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
      "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "s", "same", "she",
      "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
      "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
      "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
      "why", "will", "with", "you", "your", "yours", "yourself", "yourselves"
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    return new Set(words);
  }

  /**
   * Hybrid Context Retrieval & Token Budget Optimizer
   *
   * @param {Object} options
   * @param {string} options.query - Active user prompt or search query
   * @param {Object} options.pageContext - URL, title, domain, condensedText of current page
   * @param {number} options.maxTokens - Max tokens allocated for memory block (defaults to config)
   * @param {string} options.activeProject - Active project override (defaults to config)
   * @returns {Promise<{ formattedPrompt: string, selectedMemories: Array, tokenStats: Object }>}
   */
  static async retrieveContext({
    query = "",
    pageContext = {},
    maxTokens = null,
    activeProject = null
  } = {}) {
    const store = await this.getStore();
    const config = await this.getConfig();

    const targetProject = activeProject || config.activeProject || "Wayfinder AI";
    const tokenBudget = maxTokens || config.defaultTokenBudget || 1000;
    const weights = config.weights;
    const quotas = config.quotas;

    const domain = pageContext?.domain || "";
    const pageTitle = pageContext?.title || "";
    const pageSnippet = (pageContext?.condensedText || "").slice(0, 500);

    // Build unified query token set from user prompt + page context
    const fullSearchText = `${query} ${pageTitle} ${domain} ${pageSnippet}`;
    const queryTokens = this._tokenize(fullSearchText);

    // 1. Score all candidates in each partition
    const scoredByType = {};
    for (const type of Object.values(MEMORY_TYPES)) {
      scoredByType[type] = store[type].map(mem => {
        const { totalScore, breakdown } = this._scoreMemory(mem, {
          queryTokens,
          domain,
          activeProject: targetProject,
          weights
        });
        const estTokens = this.estimateTokens(mem.content) + this.estimateTokens(mem.title) + 12;
        return {
          memory: mem,
          score: totalScore,
          breakdown,
          tokens: estTokens
        };
      }).sort((a, b) => b.score - a.score);
    }

    // 2. Budget Allocation across buckets
    const bucketBudgets = {
      [MEMORY_TYPES.LONG_TERM]: Math.round(tokenBudget * quotas.long_term),
      [MEMORY_TYPES.PROJECT]: Math.round(tokenBudget * quotas.project),
      [MEMORY_TYPES.KNOWLEDGE]: Math.round(tokenBudget * quotas.knowledge),
      [MEMORY_TYPES.WORKING_CONTEXT]: Math.round(tokenBudget * quotas.working_context)
    };

    const selected = [];
    let tokensUsed = 0;
    const unusedByBucket = {};

    // First Pass: Fill each bucket up to its quota with highest scoring memories
    for (const type of Object.values(MEMORY_TYPES)) {
      let bucketTokens = 0;
      const budget = bucketBudgets[type];

      for (const item of scoredByType[type]) {
        // High-importance (5) long_term items are prioritized
        const isPriority = item.memory.type === MEMORY_TYPES.LONG_TERM && item.memory.importance >= 5;
        if (bucketTokens + item.tokens <= budget || (isPriority && bucketTokens + item.tokens <= budget * 1.5)) {
          selected.push(item);
          bucketTokens += item.tokens;
          tokensUsed += item.tokens;
          item.selected = true;
        }
      }
      unusedByBucket[type] = Math.max(0, budget - bucketTokens);
    }

    // Second Pass: Spillover - distribute remaining unused tokens to best remaining candidates
    let remainingBudget = tokenBudget - tokensUsed;
    if (remainingBudget > 40) {
      const remainingCandidates = [];
      for (const type of Object.values(MEMORY_TYPES)) {
        for (const item of scoredByType[type]) {
          if (!item.selected) {
            remainingCandidates.push(item);
          }
        }
      }

      // Sort remaining by raw score
      remainingCandidates.sort((a, b) => b.score - a.score);

      for (const item of remainingCandidates) {
        if (tokensUsed + item.tokens <= tokenBudget) {
          selected.push(item);
          tokensUsed += item.tokens;
          item.selected = true;
        }
      }
    }

    // Update accessCount and lastAccessedAt for selected memories (in background)
    this._markAccessed(selected.map(s => s.memory.id)).catch(() => {});

    // 3. Format into structured LLM Context Block
    const formattedPrompt = this._formatPromptBlock(selected, targetProject);

    return {
      formattedPrompt,
      selectedMemories: selected.map(s => ({
        id: s.memory.id,
        type: s.memory.type,
        title: s.memory.title,
        content: s.memory.content,
        score: Math.round(s.score * 100) / 100,
        tokens: s.tokens,
        project: s.memory.project
      })),
      tokenStats: {
        budget: tokenBudget,
        used: tokensUsed,
        free: Math.max(0, tokenBudget - tokensUsed),
        itemCount: selected.length
      }
    };
  }

  /**
   * Format selected memories into an authoritative XML/Markdown block for LLM system prompts
   */
  static _formatPromptBlock(selectedItems, activeProject) {
    if (!selectedItems || selectedItems.length === 0) {
      return "";
    }

    const byType = {
      [MEMORY_TYPES.LONG_TERM]: [],
      [MEMORY_TYPES.PROJECT]: [],
      [MEMORY_TYPES.KNOWLEDGE]: [],
      [MEMORY_TYPES.WORKING_CONTEXT]: []
    };

    for (const item of selectedItems) {
      byType[item.memory.type].push(item.memory);
    }

    const lines = [
      "<user_memory_and_context>",
      "<!-- The following context is retrieved from user's persistent memory and project records. Adhere strictly to these preferences, project constraints, and domain gotchas. -->"
    ];

    if (byType[MEMORY_TYPES.LONG_TERM].length > 0) {
      lines.push("\n## Core User Directives & Preferences:");
      for (const m of byType[MEMORY_TYPES.LONG_TERM]) {
        lines.push(`- **${m.title}**: ${m.content}`);
      }
    }

    if (byType[MEMORY_TYPES.PROJECT].length > 0) {
      lines.push(`\n## Active Project Memory [${activeProject}]:`);
      for (const m of byType[MEMORY_TYPES.PROJECT]) {
        lines.push(`- **${m.title}**: ${m.content}`);
      }
    }

    if (byType[MEMORY_TYPES.KNOWLEDGE].length > 0) {
      lines.push("\n## Relevant Domain & Tool Knowledge:");
      for (const m of byType[MEMORY_TYPES.KNOWLEDGE]) {
        lines.push(`- **${m.title}**${m.domains?.length ? ` (${m.domains.join(", ")})` : ""}: ${m.content}`);
      }
    }

    if (byType[MEMORY_TYPES.WORKING_CONTEXT].length > 0) {
      lines.push("\n## Recent Working Context & Focus:");
      for (const m of byType[MEMORY_TYPES.WORKING_CONTEXT]) {
        lines.push(`- ${m.content}`);
      }
    }

    lines.push("</user_memory_and_context>");
    return lines.join("\n");
  }

  /**
   * Update memory access metrics
   */
  static async _markAccessed(ids) {
    if (!ids || ids.length === 0) return;
    const store = await this.getStore();
    const idSet = new Set(ids);
    const now = Date.now();

    for (const type of Object.values(MEMORY_TYPES)) {
      for (const mem of store[type]) {
        if (idSet.has(mem.id)) {
          mem.accessCount = (mem.accessCount || 0) + 1;
          mem.lastAccessedAt = now;
        }
      }
    }
    await this._saveRawStorage(store, undefined);
  }

  // ==========================================
  // IMPORT ENGINE: CHATGPT & CLAUDE PARSERS
  // ==========================================

  /**
   * Import memories from ChatGPT
   * Accepts:
   * 1. ChatGPT raw memory bullet list / Custom Instructions text
   * 2. Exported ChatGPT `conversations.json` structure
   */
  static async importFromChatGPT(rawInput, { defaultProject = "Imported ChatGPT" } = {}) {
    if (!rawInput) throw new Error("No ChatGPT data provided.");
    const store = await this.getStore();
    const imported = [];

    // Case A: JSON format (conversations.json or custom instructions JSON)
    if (typeof rawInput === "object" || (typeof rawInput === "string" && rawInput.trim().startsWith("{") || rawInput.trim().startsWith("["))) {
      let data = rawInput;
      if (typeof rawInput === "string") {
        try {
          data = JSON.parse(rawInput);
        } catch (e) {
          // Fall back to text parsing if invalid JSON
          data = null;
        }
      }

      if (data) {
        // Handle ChatGPT Custom Instructions export
        if (data.user_instructions || data.about_user || data.response_instructions) {
          if (data.about_user || data.user_instructions) {
            const mem = await this.addMemory({
              type: MEMORY_TYPES.LONG_TERM,
              title: "ChatGPT Profile: About User",
              content: data.about_user || data.user_instructions,
              category: "bio",
              project: "Global",
              tags: ["chatgpt", "profile", "user-directive"],
              importance: 5,
              source: "chatgpt_import"
            });
            imported.push(mem);
          }
          if (data.response_instructions) {
            const mem = await this.addMemory({
              type: MEMORY_TYPES.LONG_TERM,
              title: "ChatGPT Directives: Response Style",
              content: data.response_instructions,
              category: "preference",
              project: "Global",
              tags: ["chatgpt", "response-style", "communication"],
              importance: 4,
              source: "chatgpt_import"
            });
            imported.push(mem);
          }
          return { success: true, count: imported.length, imported };
        }

        // Handle array of conversations / memory items
        if (Array.isArray(data)) {
          for (const item of data.slice(0, 20)) { // parse top 20 conversations / topics
            const title = item.title || "Untitled Conversation";
            // Extract first user query or system summary
            let summaryText = "";
            if (item.mapping) {
              const nodes = Object.values(item.mapping);
              const userMsgs = nodes
                .map(n => n.message)
                .filter(m => m && m.author?.role === "user" && m.content?.parts?.[0])
                .map(m => m.content.parts[0]);
              if (userMsgs.length > 0) {
                summaryText = userMsgs.slice(0, 3).join("\n").slice(0, 500);
              }
            }

            if (summaryText) {
              const mem = await this.addMemory({
                type: MEMORY_TYPES.PROJECT,
                title: `ChatGPT Topic: ${title}`,
                content: summaryText,
                category: "conversation_archive",
                project: defaultProject,
                tags: ["chatgpt", "conversation"],
                importance: 3,
                source: "chatgpt_import"
              });
              imported.push(mem);
            }
          }
          return { success: true, count: imported.length, imported };
        }
      }
    }

    // Case B: Raw text (copied from ChatGPT Settings -> Personalization -> Saved Memories)
    const textLines = String(rawInput)
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 5);

    for (const line of textLines) {
      const cleanLine = line.replace(/^[-*•\d.)\]\s]+/, "").trim();
      if (!cleanLine) continue;

      // Classify line intelligently
      const lower = cleanLine.toLowerCase();
      let memType = MEMORY_TYPES.LONG_TERM;
      let category = "bio";
      let tags = ["chatgpt"];

      if (lower.includes("project") || lower.includes("building") || lower.includes("repo") || lower.includes("stack") || lower.includes("codebase")) {
        memType = MEMORY_TYPES.PROJECT;
        category = "project_context";
        tags.push("project");
      } else if (lower.includes("prefer") || lower.includes("never") || lower.includes("always") || lower.includes("style") || lower.includes("format")) {
        memType = MEMORY_TYPES.LONG_TERM;
        category = "preference";
        tags.push("preference");
      } else if (lower.includes("domain") || lower.includes("tool") || lower.includes("api") || lower.includes("gotcha") || lower.includes("url")) {
        memType = MEMORY_TYPES.KNOWLEDGE;
        category = "knowledge";
        tags.push("tool");
      }

      const mem = await this.addMemory({
        type: memType,
        title: cleanLine.slice(0, 40) + (cleanLine.length > 40 ? "..." : ""),
        content: cleanLine,
        category,
        project: memType === MEMORY_TYPES.PROJECT ? defaultProject : "Global",
        tags,
        importance: 4,
        source: "chatgpt_import"
      });
      imported.push(mem);
    }

    return { success: true, count: imported.length, imported };
  }

  /**
   * Import memories from Claude
   * Accepts:
   * 1. Claude Project Knowledge markdown files / instructions
   * 2. Claude Custom Instructions ("How Claude should respond", "About you")
   */
  static async importFromClaude(rawInput, { defaultProject = "Imported Claude Project" } = {}) {
    if (!rawInput) throw new Error("No Claude data provided.");
    const imported = [];
    const text = String(rawInput).trim();

    // Check for Markdown headers like `# Project`, `## Instructions`, `## Context`
    if (text.includes("#")) {
      const sections = text.split(/(?=^#{1,3}\s+)/m);
      for (const sec of sections) {
        const lines = sec.trim().split("\n");
        const header = lines[0].replace(/^#{1,3}\s+/, "").trim();
        const body = lines.slice(1).join("\n").trim();

        if (!body) continue;

        const lowerHeader = header.toLowerCase();
        let type = MEMORY_TYPES.PROJECT;
        let category = "architecture";

        if (lowerHeader.includes("user") || lowerHeader.includes("about") || lowerHeader.includes("identity") || lowerHeader.includes("profile")) {
          type = MEMORY_TYPES.LONG_TERM;
          category = "bio";
        } else if (lowerHeader.includes("rule") || lowerHeader.includes("style") || lowerHeader.includes("instruction") || lowerHeader.includes("preference")) {
          type = MEMORY_TYPES.LONG_TERM;
          category = "rule";
        } else if (lowerHeader.includes("gotcha") || lowerHeader.includes("knowledge") || lowerHeader.includes("api") || lowerHeader.includes("reference")) {
          type = MEMORY_TYPES.KNOWLEDGE;
          category = "reference";
        }

        const mem = await this.addMemory({
          type,
          title: header,
          content: body,
          category,
          project: type === MEMORY_TYPES.PROJECT ? (header || defaultProject) : "Global",
          tags: ["claude", type],
          importance: 4,
          source: "claude_import"
        });
        imported.push(mem);
      }

      if (imported.length > 0) {
        return { success: true, count: imported.length, imported };
      }
    }

    // Fallback: parse as bullet lines or paragraphs
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 10);
    for (const p of paragraphs) {
      const clean = p.trim();
      const mem = await this.addMemory({
        type: MEMORY_TYPES.PROJECT,
        title: clean.slice(0, 35) + "...",
        content: clean,
        category: "claude_artifact",
        project: defaultProject,
        tags: ["claude", "project_artifact"],
        importance: 3,
        source: "claude_import"
      });
      imported.push(mem);
    }

    return { success: true, count: imported.length, imported };
  }

  // ==========================================
  // EXPORT ENGINE: JSON & CLAUDE/CHATGPT MARKDOWN
  // ==========================================

  /**
   * Export all memories as structured JSON
   */
  static async exportToJSON() {
    const store = await this.getStore();
    const config = await this.getConfig();

    const exportPayload = {
      version: "1.0.0",
      app: "Wayfinder AI",
      exportedAt: new Date().toISOString(),
      activeProject: config.activeProject,
      tokenBudget: config.defaultTokenBudget,
      summary: {
        totalMemories: Object.values(store).reduce((acc, list) => acc + list.length, 0),
        longTerm: store[MEMORY_TYPES.LONG_TERM].length,
        project: store[MEMORY_TYPES.PROJECT].length,
        workingContext: store[MEMORY_TYPES.WORKING_CONTEXT].length,
        knowledge: store[MEMORY_TYPES.KNOWLEDGE].length
      },
      memories: store
    };

    return JSON.stringify(exportPayload, null, 2);
  }

  /**
   * Export memories into standard Claude / ChatGPT Custom Instructions Markdown
   */
  static async exportToMarkdown() {
    const store = await this.getStore();
    const config = await this.getConfig();

    const lines = [
      `# Wayfinder AI Context & Memory Export`,
      `*Generated on ${new Date().toLocaleDateString()} for Claude / ChatGPT / Cursor Integration*\n`,
      `---\n`,
      `## 1. User Profile & Core Directives (Long-Term Memory)`
    ];

    if (store[MEMORY_TYPES.LONG_TERM].length === 0) {
      lines.push("*No long-term memories saved yet.*");
    } else {
      for (const m of store[MEMORY_TYPES.LONG_TERM]) {
        lines.push(`### ${m.title}`);
        lines.push(`${m.content}\n`);
      }
    }

    lines.push(`---\n## 2. Project Memory (Active Project: ${config.activeProject || "None"})`);
    if (store[MEMORY_TYPES.PROJECT].length === 0) {
      lines.push("*No project memories saved yet.*");
    } else {
      for (const m of store[MEMORY_TYPES.PROJECT]) {
        lines.push(`### [${m.project}] ${m.title}`);
        lines.push(`${m.content}\n`);
      }
    }

    lines.push(`---\n## 3. Tool & Domain Knowledge`);
    if (store[MEMORY_TYPES.KNOWLEDGE].length === 0) {
      lines.push("*No domain knowledge saved yet.*");
    } else {
      for (const m of store[MEMORY_TYPES.KNOWLEDGE]) {
        lines.push(`### ${m.title}${m.domains?.length ? ` (${m.domains.join(", ")})` : ""}`);
        lines.push(`${m.content}\n`);
      }
    }

    lines.push(`---\n## 4. Recent Working Context`);
    if (store[MEMORY_TYPES.WORKING_CONTEXT].length === 0) {
      lines.push("*No active working context items.*");
    } else {
      for (const m of store[MEMORY_TYPES.WORKING_CONTEXT]) {
        lines.push(`- ${m.content}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Reset memories back to default starter set
   */
  static async resetToDefaults() {
    const initialStore = {
      [MEMORY_TYPES.LONG_TERM]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.LONG_TERM),
      [MEMORY_TYPES.PROJECT]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.PROJECT),
      [MEMORY_TYPES.WORKING_CONTEXT]: [],
      [MEMORY_TYPES.KNOWLEDGE]: DEFAULT_STARTER_MEMORIES.filter(m => m.type === MEMORY_TYPES.KNOWLEDGE)
    };
    await this._saveRawStorage(initialStore, DEFAULT_CONFIG);
    return initialStore;
  }

  /**
   * Clear all memories (or a specific type)
   */
  static async clearAll(type = null) {
    const store = await this.getStore();
    if (type && store[type]) {
      store[type] = [];
    } else {
      for (const t of Object.values(MEMORY_TYPES)) {
        store[t] = [];
      }
    }
    await this._saveRawStorage(store, undefined);
    return true;
  }
}
