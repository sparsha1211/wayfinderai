/**
 * Universal Autonomous Web Researcher & Link Peeking Engine
 * Dynamically infers user intent across any category (Flights, Stays, Commerce, Tech, Docs, Portals),
 * executes background web intelligence queries, and peeks on-page links without hardcoded rules.
 */

export class WebResearcher {
  /**
   * Dynamically deduce the best background query and task category from page context
   */
  static deduceDynamicResearchTarget(pageContext) {
    const rawTarget = pageContext?.semanticEntity?.name ||
                      pageContext?.productInfo?.productName ||
                      pageContext?.title ||
                      "";

    // Clean target: strip site suffixes like " - Amazon", " | Skyscanner", " - Airbnb", " :: Best Buy"
    const cleanTarget = rawTarget
      .split(/[|:()\[\]]/)[0]
      .replace(/\s+[-–—]\s+.*$/, "")
      .trim()
      .slice(0, 70);

    const combined = `${pageContext?.url || ""} ${pageContext?.title || ""} ${cleanTarget}`.toLowerCase();

    let taskType = "General Navigation";
    let searchSuffix = "tips guide alternatives";

    if (/flight|airline|skyscanner|layover|airport|roundtrip|one-way/i.test(combined)) {
      taskType = "Flight & Travel Search";
      searchSuffix = "baggage fees layover reviews";
    } else if (/hotel|airbnb|booking|resort|hostel|villa|check-in|lodging|stay/i.test(combined)) {
      taskType = "Accommodation & Stay Search";
      searchSuffix = "neighborhood safety reviews hidden fees";
    } else if (/price|\$|deal|cart|buy|specs|model|headphones|laptop|phone|camera|shoes|gear/i.test(combined) || pageContext?.semanticEntity?.price) {
      taskType = "Product Evaluation & Buying";
      searchSuffix = "vs alternatives review defects";
    } else if (/github|docs|api|framework|library|documentation|tutorial|npm|pypi/i.test(combined)) {
      taskType = "Developer & Technical Research";
      searchSuffix = "best practices common issues";
    } else if (/job|career|salary|hiring|glassdoor|linkedin/i.test(combined)) {
      taskType = "Career & Job Vetting";
      searchSuffix = "company reviews culture interview";
    }

    return {
      cleanTarget,
      taskType,
      searchSuffix
    };
  }

  /**
   * Fetch real-time search suggestions & alternative queries in the background
   */
  static async getSearchSuggestions(query, suffix = "") {
    if (!query || query.length < 3) return [];
    try {
      const fullQ = suffix ? `${query.slice(0, 50)} ${suffix.split(" ")[0]}` : query.slice(0, 50);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(fullQ)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const data = await res.json();
      const suggestions = (data && Array.isArray(data[1])) ? data[1] : [];
      return suggestions.slice(0, 4);
    } catch (e) {
      return [];
    }
  }

  /**
   * Search community discussions, teardowns, and user reports
   */
  static async getCommunityIntelligence(query) {
    if (!query || query.length < 3) return [];
    try {
      const q = encodeURIComponent(query.slice(0, 50));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=2`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const data = await res.json();
      return (data.hits || []).map(hit => ({
        title: hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        points: hit.points || 0
      })).filter(h => h.title);
    } catch (e) {
      return [];
    }
  }

  /**
   * Peek an on-page link in the background without user navigation
   * Extracts title, meta description, and first clean text snippet
   */
  static async peekLink(url) {
    if (!url || !url.startsWith("http")) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "text/html,application/xhtml+xml" }
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, " ") : "";

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
      const description = descMatch ? descMatch[1].trim().replace(/\s+/g, " ") : "";

      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 260);

      return {
        url,
        title: title || "Linked Reference",
        description: description || cleanText.slice(0, 150)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Autonomously gather task-specific background intelligence for any web page
   */
  static async gatherAutonomousContext(pageContext) {
    const { cleanTarget, taskType, searchSuffix } = this.deduceDynamicResearchTarget(pageContext);

    const relatedLinks = Array.isArray(pageContext.relatedLinks) ? pageContext.relatedLinks : [];
    const linksToPeek = relatedLinks.slice(0, 2);

    const [suggestionsResult, communityResult, ...linkResults] = await Promise.allSettled([
      cleanTarget ? this.getSearchSuggestions(cleanTarget, searchSuffix) : Promise.resolve([]),
      cleanTarget ? this.getCommunityIntelligence(cleanTarget) : Promise.resolve([]),
      ...linksToPeek.map(l => this.peekLink(l.url))
    ]);

    const searchSuggestions = (suggestionsResult.status === "fulfilled" && Array.isArray(suggestionsResult.value))
      ? suggestionsResult.value
      : [];

    const communityDiscussions = (communityResult.status === "fulfilled" && Array.isArray(communityResult.value))
      ? communityResult.value
      : [];

    const peekedLinks = linkResults
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value);

    // Format research report string for LLM userPrompt
    const lines = [];
    lines.push(`- Inferred Task Category: ${taskType}`);
    if (searchSuggestions.length > 0) {
      lines.push(`- Real-Time Search Trends & Alternatives: ${searchSuggestions.map(c => `"${c}"`).join(", ")}`);
    }
    if (communityDiscussions.length > 0) {
      lines.push(`- Community Intel / User Feedback Found: ${communityDiscussions.map(d => `"${d.title}" (${d.points} pts)`).join("; ")}`);
    }
    if (peekedLinks.length > 0) {
      lines.push("- Peeked Key On-Page Links (Background Context):");
      peekedLinks.forEach(p => {
        lines.push(`  * [${p.title}]: ${p.description}`);
      });
    }

    const formattedSummary = lines.length > 0 ? lines.join("\n") : "None found within time window.";

    return {
      query: cleanTarget,
      taskType,
      searchSuggestions,
      communityDiscussions,
      peekedLinks,
      formattedSummary
    };
  }
}
