/**
 * Local Navigation History and Behavioral Pattern Learning Engine
 * Stores user transitions, frequent domains, common navigational goals,
 * and extracts user patterns locally without sending raw browsing history to cloud.
 */

const STORAGE_KEYS = {
  HISTORY: "wayfinder_nav_history",
  PATTERNS: "wayfinder_user_patterns",
  SETTINGS: "wayfinder_settings"
};

const MAX_HISTORY_ITEMS = 50;

export class PatternLearner {
  /**
   * Log page visit and analyze behavior patterns
   */
  static async recordVisit({ url, title, domain, metaDescription, timestamp = Date.now() }) {
    const data = await chrome.storage.local.get([STORAGE_KEYS.HISTORY, STORAGE_KEYS.PATTERNS]);
    let history = data[STORAGE_KEYS.HISTORY] || [];
    let patterns = data[STORAGE_KEYS.PATTERNS] || {
      frequentDomains: {},
      interests: {},
      recentWorkflows: [],
      totalVisits: 0
    };

    // 1. Add to rolling history
    const visitRecord = { url, title, domain, metaDescription, timestamp };
    history.unshift(visitRecord);
    if (history.length > MAX_HISTORY_ITEMS) {
      history = history.slice(0, MAX_HISTORY_ITEMS);
    }

    // 2. Update domain frequency
    patterns.totalVisits += 1;
    patterns.frequentDomains[domain] = (patterns.frequentDomains[domain] || 0) + 1;

    // 3. Extract lightweight topical cues from title & domain
    const keywords = this._extractKeywords(title);
    keywords.forEach(kw => {
      patterns.interests[kw] = (patterns.interests[kw] || 0) + 1;
    });

    // 4. Track workflow sequences (e.g. search -> docs -> github)
    if (history.length >= 2) {
      const prevDomain = history[1].domain;
      if (prevDomain && prevDomain !== domain) {
        const transition = `${prevDomain} -> ${domain}`;
        const existingWorkflow = patterns.recentWorkflows.find(w => w.transition === transition);
        if (existingWorkflow) {
          existingWorkflow.count += 1;
          existingWorkflow.lastSeen = timestamp;
        } else {
          patterns.recentWorkflows.unshift({ transition, count: 1, lastSeen: timestamp });
          if (patterns.recentWorkflows.length > 20) {
            patterns.recentWorkflows = patterns.recentWorkflows.slice(0, 20);
          }
        }
      }
    }

    await chrome.storage.local.set({
      [STORAGE_KEYS.HISTORY]: history,
      [STORAGE_KEYS.PATTERNS]: patterns
    });

    return { history, patterns };
  }

  /**
   * Get synthesized summary of user patterns to inject into AI prompt context
   */
  static async getPatternContext() {
    const data = await chrome.storage.local.get([STORAGE_KEYS.HISTORY, STORAGE_KEYS.PATTERNS]);
    const history = data[STORAGE_KEYS.HISTORY] || [];
    const patterns = data[STORAGE_KEYS.PATTERNS] || { frequentDomains: {}, interests: {}, recentWorkflows: [] };

    // Top 5 domains
    const topDomains = Object.entries(patterns.frequentDomains)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([domain, count]) => `${domain} (${count} visits)`);

    // Top 5 detected interests
    const topInterests = Object.entries(patterns.interests)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);

    // Recent 5 page trail
    const recentTrail = history.slice(0, 5).map(h => ({
      title: h.title,
      domain: h.domain,
      url: h.url
    }));

    return {
      topDomains,
      topInterests,
      recentTrail,
      frequentWorkflows: patterns.recentWorkflows.slice(0, 3).map(w => `${w.transition} (${w.count}x)`)
    };
  }

  /**
   * Clear all stored local patterns and history
   */
  static async clearLearningData() {
    await chrome.storage.local.remove([STORAGE_KEYS.HISTORY, STORAGE_KEYS.PATTERNS]);
  }

  static _extractKeywords(text) {
    if (!text) return [];
    const stopWords = new Set([
      "the", "and", "or", "to", "in", "a", "of", "for", "with", "on", "at", "by", "from",
      "home", "page", "welcome", "dashboard", "google", "search", "login", "official", "site"
    ]);

    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    return Array.from(new Set(words)).slice(0, 4);
  }
}
