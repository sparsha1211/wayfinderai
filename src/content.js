/**
 * Wayfinder AI Content Script
 * Extracts page context, communicates with background AI service,
 * and renders an unobtrusive interactive HUD / DOM beacon overlay on the web page.
 */

(function () {
  // Prevent duplicate execution
  if (window.__WAYFINDER_INITIALIZED__) return;
  window.__WAYFINDER_INITIALIZED__ = true;

  let currentGuidance = null;
  let isAnalyzing = false;
  let beaconContainer = null;
  let overlayCard = null;

  /**
   * 1. Extract clean page context for the AI
   */
  function extractPageContext() {
    const title = document.title || "";
    const url = window.location.href;
    const domain = window.location.hostname;

    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") ||
                     document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";

    // Extract notable headings
    const headingElements = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 8);
    const headings = headingElements.map(h => h.innerText.trim()).filter(Boolean);

    // Extract key action elements (buttons, primary links, forms)
    const actionElements = [];
    document.querySelectorAll("button, a.btn, a.button, input[type='submit'], [role='button']").forEach((el, idx) => {
      if (idx < 10) {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
        if (text && text.length < 50) {
          actionElements.push({
            text,
            tag: el.tagName.toLowerCase(),
            selector: generateSimpleSelector(el)
          });
        }
      }
    });

    // Extract condensed readable body text (strip scripts/styles)
    const clone = document.body ? document.body.cloneNode(true) : null;
    let condensedText = "";
    if (clone) {
      clone.querySelectorAll("script, style, noscript, svg, nav, footer, header").forEach(node => node.remove());
      condensedText = (clone.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500); // lightweight context window limit
    }

    return {
      title,
      url,
      domain,
      metaDescription: metaDesc,
      headings,
      actionElements,
      condensedText
    };
  }

  function generateSimpleSelector(el) {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === "string") {
      const cls = el.className.split(" ").filter(c => c && !c.startsWith("wayfinder")).slice(0, 2).join(".");
      if (cls) return `${el.tagName.toLowerCase()}.${cls}`;
    }
    return el.tagName.toLowerCase();
  }

  /**
   * 2. Initialize and inject DOM Beacon / Indicator
   */
  function injectBeaconHUD() {
    if (document.getElementById("wayfinder-hud-root")) return;

    beaconContainer = document.createElement("div");
    beaconContainer.id = "wayfinder-hud-root";
    beaconContainer.className = "wayfinder-hud-root";

    // Floating Signal Beacon
    const beacon = document.createElement("div");
    beacon.className = "wayfinder-signal-beacon";
    beacon.title = "Wayfinder AI Web Navigator - Hover or click to expand guidance";
    beacon.innerHTML = `
      <div class="wayfinder-beacon-glow"></div>
      <div class="wayfinder-beacon-icon">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
        </svg>
      </div>
      <div class="wayfinder-beacon-badge" id="wayfinder-beacon-badge" style="display:none;">!</div>
    `;

    // Interactive Guidance Card
    overlayCard = document.createElement("div");
    overlayCard.className = "wayfinder-overlay-card";
    overlayCard.innerHTML = `
      <div class="wayfinder-card-header">
        <div class="wayfinder-card-brand">
          <span class="wayfinder-logo-dot"></span>
          <span class="wayfinder-card-title">Wayfinder AI Navigator</span>
        </div>
        <div class="wayfinder-card-controls">
          <button class="wayfinder-refresh-btn" id="wayfinder-refresh-btn" title="Refresh Analysis">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"></path>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button class="wayfinder-close-btn" id="wayfinder-close-btn" title="Minimize">&times;</button>
        </div>
      </div>
      <div class="wayfinder-card-body" id="wayfinder-card-body">
        <div class="wayfinder-loading-state">
          <div class="wayfinder-spinner"></div>
          <span>Synthesizing page context & patterns...</span>
        </div>
      </div>
    `;

    beaconContainer.appendChild(beacon);
    beaconContainer.appendChild(overlayCard);
    document.body.appendChild(beaconContainer);

    // Event listeners: Hover or Click to toggle overlay
    let hoverTimeout;
    beacon.addEventListener("mouseenter", () => {
      clearTimeout(hoverTimeout);
      overlayCard.classList.add("wayfinder-card-open");
    });

    beaconContainer.addEventListener("mouseleave", () => {
      hoverTimeout = setTimeout(() => {
        overlayCard.classList.remove("wayfinder-card-open");
      }, 500);
    });

    beacon.addEventListener("click", (e) => {
      e.stopPropagation();
      overlayCard.classList.toggle("wayfinder-card-open");
    });

    document.getElementById("wayfinder-close-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      overlayCard.classList.remove("wayfinder-card-open");
    });

    document.getElementById("wayfinder-refresh-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      runPageAnalysis(true);
    });
  }

  /**
   * 3. Send context to AI and update DOM
   */
  async function runPageAnalysis(force = false) {
    if (isAnalyzing && !force) return;

    // Check if extension is enabled in storage
    const storage = await chrome.storage.local.get("wayfinder_settings");
    const settings = storage.wayfinder_settings || {};
    if (settings.enabled === false) {
      if (beaconContainer) beaconContainer.style.display = "none";
      return;
    } else {
      if (beaconContainer) beaconContainer.style.display = "block";
    }

    injectBeaconHUD();
    isAnalyzing = true;

    const cardBody = document.getElementById("wayfinder-card-body");
    if (cardBody) {
      cardBody.innerHTML = `
        <div class="wayfinder-loading-state">
          <div class="wayfinder-spinner"></div>
          <span>Analyzing DOM & navigation patterns...</span>
        </div>
      `;
    }

    const context = extractPageContext();

    // 1. Record visit for pattern learning locally
    chrome.runtime.sendMessage({
      type: "RECORD_PAGE_VISIT",
      payload: {
        url: context.url,
        title: context.title,
        domain: context.domain,
        metaDescription: context.metaDescription
      }
    });

    // 2. Request guidance from background service
    try {
      const response = await chrome.runtime.sendMessage({
        type: "REQUEST_PAGE_ASSISTANCE",
        payload: context
      });

      isAnalyzing = false;

      if (!response || !response.success) {
        renderErrorState(response?.error || "AI could not process this page.");
        return;
      }

      currentGuidance = response.guidance;
      renderGuidanceContent(response.guidance, response.provider, response.model);
      highlightDomElements(response.guidance.domHighlights || []);
    } catch (err) {
      isAnalyzing = false;
      renderErrorState(err.message);
    }
  }

  /**
   * 4. Render guidance into UI card
   */
  function renderGuidanceContent(guidance, provider, model) {
    const cardBody = document.getElementById("wayfinder-card-body");
    const badge = document.getElementById("wayfinder-beacon-badge");
    if (!cardBody) return;

    if (badge) badge.style.display = "block";

    const recsHtml = (guidance.recommendations || [])
      .map(rec => `<li><span class="wayfinder-bullet">✦</span> ${escapeHtml(rec)}</li>`)
      .join("");

    const actionsHtml = (guidance.suggestedActions || []).map((action, idx) => `
      <div class="wayfinder-action-chip" data-action-idx="${idx}">
        <span class="wayfinder-action-name">${escapeHtml(action.label)}</span>
        ${action.explanation ? `<small class="wayfinder-action-desc">${escapeHtml(action.explanation)}</small>` : ""}
      </div>
    `).join("");

    cardBody.innerHTML = `
      <div class="wayfinder-summary-box">
        <div class="wayfinder-meta-tag">Goal: ${escapeHtml(guidance.pageGoal || "General Navigation")}</div>
        <p class="wayfinder-summary-text">${escapeHtml(guidance.summary || "Page scanned.")}</p>
      </div>

      ${recsHtml ? `
        <div class="wayfinder-section">
          <div class="wayfinder-section-title">Navigation Insights</div>
          <ul class="wayfinder-recs-list">${recsHtml}</ul>
        </div>
      ` : ""}

      ${actionsHtml ? `
        <div class="wayfinder-section">
          <div class="wayfinder-section-title">Suggested Quick Steps</div>
          <div class="wayfinder-actions-grid">${actionsHtml}</div>
        </div>
      ` : ""}

      <div class="wayfinder-footer-provider">
        <span>Powered by <strong>${escapeHtml(provider)}</strong> (${escapeHtml(model)})</span>
      </div>
    `;

    // Attach click events for suggested actions
    cardBody.querySelectorAll(".wayfinder-action-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const idx = chip.getAttribute("data-action-idx");
        const action = guidance.suggestedActions[idx];
        executeSuggestedAction(action);
      });
    });
  }

  function executeSuggestedAction(action) {
    if (!action) return;
    if (action.targetHint) {
      try {
        const el = document.querySelector(action.targetHint);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("wayfinder-target-pulse");
          setTimeout(() => el.classList.remove("wayfinder-target-pulse"), 2500);
          return;
        }
      } catch (e) {
        // Selector invalid, try text search
      }

      // Try finding by text
      const allClickables = Array.from(document.querySelectorAll("a, button"));
      const match = allClickables.find(el => (el.innerText || "").toLowerCase().includes(action.targetHint.toLowerCase()));
      if (match) {
        match.scrollIntoView({ behavior: "smooth", block: "center" });
        match.classList.add("wayfinder-target-pulse");
        setTimeout(() => match.classList.remove("wayfinder-target-pulse"), 2500);
      }
    }
  }

  /**
   * 5. Highlight DOM with contextual tooltips
   */
  function highlightDomElements(highlights) {
    // Clear old tags
    document.querySelectorAll(".wayfinder-dom-tag").forEach(el => el.remove());

    highlights.forEach(h => {
      if (!h.selector) return;
      try {
        const el = document.querySelector(h.selector);
        if (el && !el.closest("#wayfinder-hud-root")) {
          const tag = document.createElement("span");
          tag.className = "wayfinder-dom-tag";
          tag.innerText = `💡 ${h.note || "Focus"}`;
          el.style.position = el.style.position || "relative";
          el.appendChild(tag);
        }
      } catch (e) {
        // Invalid selector, ignore gracefully
      }
    });
  }

  function renderErrorState(errorMessage) {
    const cardBody = document.getElementById("wayfinder-card-body");
    if (!cardBody) return;
    cardBody.innerHTML = `
      <div class="wayfinder-error-state">
        <div class="wayfinder-error-icon">⚠️</div>
        <div class="wayfinder-error-title">Navigation Assistant Notice</div>
        <div class="wayfinder-error-msg">${escapeHtml(errorMessage)}</div>
        <p class="wayfinder-error-help">Check your API Key or Ollama status in the extension popup menu.</p>
      </div>
    `;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Listen for setting changes (e.g. enable/disable toggle)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.wayfinder_settings) {
      const newSettings = changes.wayfinder_settings.newValue;
      if (newSettings && newSettings.enabled === false) {
        if (beaconContainer) beaconContainer.style.display = "none";
      } else {
        if (beaconContainer) beaconContainer.style.display = "block";
      }
    }
  });

  // Debounce launch after page load settles
  setTimeout(() => {
    runPageAnalysis();
  }, 1200);

})();
