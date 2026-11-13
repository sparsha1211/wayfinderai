/**
 * Wayfinder AI — Browsing Activity, Search Context & Auto-Remember Engine
 *
 * Responsibilities:
 * 1. Detects search queries on major search engines (Google, Bing, DuckDuckGo, GitHub, Amazon, etc.).
 * 2. Extracts user task intent from opened tabs and navigation workflows.
 * 3. Auto-records working context into the Working Memory tier (subject to user opt-in toggle).
 * 4. Synthesizes beneficial, personalized suggested queries for the user.
 */

import { MEMORY_TYPES } from "./types.js";
import { MemoryStore } from "./store.js";

// Recent processed cache to prevent duplicate working memory records on reloads
const recentProcessedCache = new Map();

export class ActivityTracker {
  /**
   * Search Engine Query Extractors
   */
  static extractSearchQuery(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return null;

    try {
      const url = new URL(rawUrl);
      const host = url.hostname.toLowerCase();
      const path = url.pathname.toLowerCase();
      const params = url.searchParams;

      // Google
      if (host.includes("google.") && (path.includes("/search") || path === "/")) {
        const q = params.get("q");
        if (q) return { engine: "Google", query: q.trim() };
      }

      // Bing
      if (host.includes("bing.com") && path.includes("/search")) {
        const q = params.get("q");
        if (q) return { engine: "Bing", query: q.trim() };
      }

      // DuckDuckGo
      if (host.includes("duckduckgo.com")) {
        const q = params.get("q");
        if (q) return { engine: "DuckDuckGo", query: q.trim() };
      }

      // GitHub Search
      if (host.includes("github.com") && path.includes("/search")) {
        const q = params.get("q");
        if (q) return { engine: "GitHub", query: q.trim() };
      }

      // Amazon Search
      if (host.includes("amazon.") && (path.includes("/s") || params.has("k"))) {
        const k = params.get("k");
        if (k) return { engine: "Amazon", query: k.trim() };
      }

      // Reddit Search
      if (host.includes("reddit.com") && path.includes("/search")) {
        const q = params.get("q");
        if (q) return { engine: "Reddit", query: q.trim() };
      }

      // YouTube Search
      if (host.includes("youtube.com") && path.includes("/results")) {
        const q = params.get("search_query");
        if (q) return { engine: "YouTube", query: q.trim() };
      }

      // Skyscanner / Flight Search
      if (host.includes("skyscanner.") || host.includes("google.com/travel/flights")) {
        return { engine: "Flight Search", query: "Flight comparison & booking" };
      }
    } catch (e) {}

    return null;
  }

  /**
   * Record page visit or search context into Working Memory
   */
  static async recordActivity({ url, title, domain, metaDescription, timestamp = Date.now() }) {
    if (!url || url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("chrome-extension://")) {
      return { skipped: true, reason: "internal_page" };
    }

    const config = await MemoryStore.getConfig();

    // Check opt-in toggles
    if (config.memoryEnabled === false) {
      return { skipped: true, reason: "memory_disabled" };
    }
    if (config.autoRememberActivity === false) {
      return { skipped: true, reason: "auto_remember_disabled" };
    }

    // De-duplication check within 10 seconds
    const cacheKey = `${domain}_${(title || "").slice(0, 30)}`;
    const lastSeen = recentProcessedCache.get(cacheKey);
    if (lastSeen && (timestamp - lastSeen < 10000)) {
      return { skipped: true, reason: "recent_duplicate" };
    }
    recentProcessedCache.set(cacheKey, timestamp);

    // Clean up stale cache keys
    if (recentProcessedCache.size > 50) {
      const oldestKeys = [...recentProcessedCache.keys()].slice(0, 20);
      oldestKeys.forEach(k => recentProcessedCache.delete(k));
    }

    const activeProject = config.activeProject || "Global";
    const searchData = this.extractSearchQuery(url);

    // Case 1: Search engine query detected
    if (searchData && searchData.query) {
      const mem = await MemoryStore.addMemory({
        type: MEMORY_TYPES.WORKING_CONTEXT,
        title: `Search: "${searchData.query.slice(0, 35)}"`,
        content: `User searched for "${searchData.query}" on ${searchData.engine}. Actively researching this topic.`,
        category: "search_intent",
        project: activeProject,
        tags: ["search", searchData.engine.toLowerCase(), "intent"],
        domains: [domain],
        importance: 4,
        source: "auto_activity_tracker"
      });

      // Keep working context partition compact (max 10 entries)
      await this._pruneWorkingContext(10);
      return { success: true, type: "search", query: searchData.query, memory: mem };
    }

    // Case 2: Standard tab navigation with substantial title
    if (title && title.length > 5 && !title.toLowerCase().includes("loading") && !title.toLowerCase().includes("untitled")) {
      const cleanTitle = title.slice(0, 80);
      const mem = await MemoryStore.addMemory({
        type: MEMORY_TYPES.WORKING_CONTEXT,
        title: `Browsing: ${domain}`,
        content: `User opened tab "${cleanTitle}" on ${domain}. Relevant to active session workflow.`,
        category: "active_task",
        project: activeProject,
        tags: ["browsing", domain.toLowerCase()],
        domains: [domain],
        importance: 3,
        source: "auto_activity_tracker"
      });

      await this._pruneWorkingContext(10);
      return { success: true, type: "tab", domain, memory: mem };
    }

    return { skipped: true, reason: "no_substantial_context" };
  }

  /**
   * Keep working context bounded to prevent bloating
   */
  static async _pruneWorkingContext(maxItems = 10) {
    const store = await MemoryStore.getStore();
    const working = store[MEMORY_TYPES.WORKING_CONTEXT];
    if (working.length > maxItems) {
      // Sort by updatedAt DESC and keep newest
      working.sort((a, b) => b.updatedAt - a.updatedAt);
      store[MEMORY_TYPES.WORKING_CONTEXT] = working.slice(0, maxItems);
      await MemoryStore.saveRawStorage(store, undefined);
    }
  }

  /**
   * Synthesize personalized, beneficial suggested queries for the user
   */
  static async generateBeneficialQueries({ pageContext = {}, recentMemories = [] }) {
    const config = await MemoryStore.getConfig();
    const activeProject = config.activeProject || "Wayfinder AI";

    const queries = [];

    // 1. Project-aligned queries
    if (activeProject && activeProject !== "Global") {
      queries.push(`How does this relate to or integrate with ${activeProject}?`);
    }

    // 2. Search intent queries from recent working memory
    const searchMems = recentMemories.filter(m => m.tags?.includes("search"));
    if (searchMems.length > 0) {
      const latestSearch = searchMems[0].title.replace(/^Search:\s*"/, "").replace(/"$/, "");
      queries.push(`Summarize key tradeoffs for "${latestSearch}" on this page`);
    }

    // 3. Domain gotcha queries
    if (pageContext.domain?.includes("github.com")) {
      queries.push("Inspect PR / code changes for security flaws and breaking APIs");
    } else if (pageContext.domain?.includes("stripe.com")) {
      queries.push("Verify webhook signatures and secret handling best practices");
    } else if (pageContext.domain?.includes("railway.app")) {
      queries.push("Check environment variable deployment and health check status");
    } else if (pageContext.domain?.includes("flight") || pageContext.domain?.includes("skyscanner")) {
      queries.push("Compare hidden baggage fees, layovers, and alternative dates");
    }

    return queries.slice(0, 4);
  }
}
