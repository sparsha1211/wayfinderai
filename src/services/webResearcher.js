/**
 * Autonomous Background Web Researcher & Link Peeking Engine
 * Performs background research on user intent, searches market comparisons,
 * and peeks high-value on-page links to provide the AI with rich external context.
 */

export class WebResearcher {
  /**
   * Fetch comparison and competitor suggestions in the background
   */
  static async getComparisonIntelligence(query) {
    if (!query || query.length < 3) return [];
    try {
      const q = encodeURIComponent(`${query.slice(0, 60)} vs`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${q}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const data = await res.json();
      const suggestions = (data && Array.isArray(data[1])) ? data[1] : [];
      return suggestions.slice(0, 4).map(s => {
        // Strip out the query prefix if present for clean comparison display
        return s.replace(new RegExp(`^${query}\\s*(vs\\s*)?`, "i"), "").trim() || s;
      }).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  /**
   * Search community discussions & tech teardowns (HackerNews Algolia API)
   */
  static async getCommunityIntelligence(query) {
    if (!query || query.length < 3) return [];
    try {
      const q = encodeURIComponent(query.slice(0, 60));
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
   * Peek an on-page link in the background without navigating
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

      // Quick clean snippet of text (strip scripts, styles, tags)
      const cleanText = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300);

      return {
        url,
        title: title || "Linked Document",
        description: description || cleanText.slice(0, 160)
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Gather autonomous research package for the current page context
   */
  static async gatherAutonomousContext(pageContext) {
    const researchTarget = pageContext.productInfo?.productName || pageContext.title || "";
    const cleanTarget = researchTarget.split(/[|:()\[\]]/)[0].replace(/\s+-\s+.*$/, "").trim(); // clean primary entity name, preserve model hyphens

    const relatedLinks = Array.isArray(pageContext.relatedLinks) ? pageContext.relatedLinks : [];
    const linksToPeek = relatedLinks.slice(0, 2);

    const [comparisonsResult, communityResult, ...linkResults] = await Promise.allSettled([
      cleanTarget ? this.getComparisonIntelligence(cleanTarget) : Promise.resolve([]),
      cleanTarget ? this.getCommunityIntelligence(cleanTarget) : Promise.resolve([]),
      ...linksToPeek.map(l => this.peekLink(l.url))
    ]);

    const topComparisons = (comparisonsResult.status === "fulfilled" && Array.isArray(comparisonsResult.value))
      ? comparisonsResult.value
      : [];

    const communityDiscussions = (communityResult.status === "fulfilled" && Array.isArray(communityResult.value))
      ? communityResult.value
      : [];

    const peekedLinks = linkResults
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => r.value);

    // Format research report string for LLM userPrompt
    const lines = [];
    if (topComparisons.length > 0) {
      lines.push(`- Top Real-Time Market Comparisons / Alternatives: ${topComparisons.map(c => `"${c}"`).join(", ")}`);
    }
    if (communityDiscussions.length > 0) {
      lines.push(`- Community Discussions / Teardowns Found: ${communityDiscussions.map(d => `"${d.title}" (${d.points} upvotes)`).join("; ")}`);
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
      topComparisons,
      communityDiscussions,
      peekedLinks,
      formattedSummary
    };
  }
}
