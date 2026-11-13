/**
 * Wayfinder AI — Hybrid Context Retrieval & Dynamic Token Budget Optimizer
 *
 * Combines:
 * - Lexical BM25 term overlap
 * - Domain Affinity matching
 * - Project Affinity matching
 * - Importance priority weighting
 * - Recency exponential decay (half-life of 6 hours for working context; zero decay for long-term)
 * - Dynamic token budget quota allocation with greedy spillover
 */

import { MEMORY_TYPES } from "./types.js";
import { MemoryStore } from "./store.js";

export class HybridRetriever {
  /**
   * Estimate token count of a string (~3.8 chars per token for English text)
   */
  static estimateTokens(text = "") {
    if (!text || typeof text !== "string") return 0;
    return Math.max(1, Math.ceil(text.length / 3.8));
  }

  /**
   * Tokenize text into normalized unique keywords (strips stop words)
   */
  static tokenize(text = "") {
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
   * Score an individual memory entry against query and page context
   */
  static scoreMemory(memory, { queryTokens, domain, activeProject, weights }) {
    const now = Date.now();

    // 1. Lexical / Keyword BM25-like Score
    let lexicalHits = 0;
    const memoryTokens = new Set([
      ...this.tokenize(memory.title),
      ...this.tokenize(memory.content),
      ...memory.tags
    ]);

    for (const qTok of queryTokens) {
      if (memoryTokens.has(qTok)) {
        lexicalHits += 1;
      }
    }
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
      // Exponential decay for working context (half-life of 6 hours)
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
   * Retrieve relevant context and enforce token budget
   */
  static async retrieveContext({
    query = "",
    pageContext = {},
    maxTokens = null,
    activeProject = null
  } = {}) {
    const config = await MemoryStore.getConfig();

    // Respect master memory opt-in toggle: if disabled, return empty context
    if (config.memoryEnabled === false) {
      return {
        formattedPrompt: "",
        selectedMemories: [],
        tokenStats: { budget: 0, used: 0, free: 0, itemCount: 0, disabled: true }
      };
    }

    const store = await MemoryStore.getStore();
    const targetProject = activeProject || config.activeProject || "Wayfinder AI";
    const tokenBudget = maxTokens || config.defaultTokenBudget || 1000;
    const weights = config.weights;
    const quotas = config.quotas;

    const domain = pageContext?.domain || "";
    const pageTitle = pageContext?.title || "";
    const pageSnippet = (pageContext?.condensedText || "").slice(0, 500);

    const fullSearchText = `${query} ${pageTitle} ${domain} ${pageSnippet}`;
    const queryTokens = this.tokenize(fullSearchText);

    // 1. Score all candidates in each partition
    const scoredByType = {};
    for (const type of Object.values(MEMORY_TYPES)) {
      scoredByType[type] = store[type].map(mem => {
        const { totalScore, breakdown } = this.scoreMemory(mem, {
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

    // First Pass: Fill each bucket up to its quota
    for (const type of Object.values(MEMORY_TYPES)) {
      let bucketTokens = 0;
      const budget = bucketBudgets[type];

      for (const item of scoredByType[type]) {
        const isPriority = item.memory.type === MEMORY_TYPES.LONG_TERM && item.memory.importance >= 5;
        if (bucketTokens + item.tokens <= budget || (isPriority && bucketTokens + item.tokens <= budget * 1.5)) {
          selected.push(item);
          bucketTokens += item.tokens;
          tokensUsed += item.tokens;
          item.selected = true;
        }
      }
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

      remainingCandidates.sort((a, b) => b.score - a.score);

      for (const item of remainingCandidates) {
        if (tokensUsed + item.tokens <= tokenBudget) {
          selected.push(item);
          tokensUsed += item.tokens;
          item.selected = true;
        }
      }
    }

    // Mark accessed
    this.markAccessed(selected.map(s => s.memory.id)).catch(() => {});

    // 3. Format into structured LLM Context Block
    const formattedPrompt = this.formatPromptBlock(selected, targetProject);

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
   * Format selected memories into an authoritative XML/Markdown block for LLM prompts
   */
  static formatPromptBlock(selectedItems, activeProject) {
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
      lines.push("\n## Recent Working Context & Search Intent:");
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
  static async markAccessed(ids) {
    if (!ids || ids.length === 0) return;
    const store = await MemoryStore.getStore();
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
    await MemoryStore.saveRawStorage(store, undefined);
  }
}
