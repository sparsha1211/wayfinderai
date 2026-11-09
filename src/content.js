/**
 * Wayfinder AI Content Script
 * 3 Interaction Modes:
 * 1. Persistent Floating Beacon HUD with click-to-pin & hover-away dismissal
 * 2. In-Page DOM Markers (purple markers/beacons over interesting buttons/links with popovers)
 * 3. Text Selection AI Tooltip (highlight text to trigger instant AI explanation)
 */

(function () {
  if (window.__WAYFINDER_INITIALIZED__) return;
  window.__WAYFINDER_INITIALIZED__ = true;

  let isAnalyzing = false;
  let beaconContainer = null;
  let overlayCard = null;
  let isCardPinned = false;
  let closeTimer = null;
  let selectionButton = null;
  let selectionPopover = null;

  let chatRoot = null;
  let chatMessagesContainer = null;
  let chatInput = null;
  let chatContext = "";
  let chatHistory = [];
  let isChatOpen = false;
  let isSendingChat = false;

  let currentMarkerStyle = "dot";
  let currentGuidanceItems = [];

  let lastUrl = window.location.href;
  let hasAnalyzedCurrentPage = false;

  /**
   * Diagnostic & In-Page Logger
   */
  const WayfinderLogger = {
    logs: [],
    log(msg, data) {
      const timestamp = new Date().toLocaleTimeString();
      const logStr = `[${timestamp}] ℹ️ ${msg}`;
      this.logs.push(logStr);
      if (this.logs.length > 100) this.logs.shift();
      if (data !== undefined) {
        console.log(`%c[Wayfinder AI]%c ${msg}`, "color: #7c3aed; font-weight: bold; background: #ede9fe; padding: 2px 5px; border-radius: 3px;", "color: inherit;", data);
      } else {
        console.log(`%c[Wayfinder AI]%c ${msg}`, "color: #7c3aed; font-weight: bold; background: #ede9fe; padding: 2px 5px; border-radius: 3px;", "color: inherit;");
      }
    },
    warn(msg, data) {
      const timestamp = new Date().toLocaleTimeString();
      this.logs.push(`[${timestamp}] ⚠️ ${msg}`);
      if (this.logs.length > 100) this.logs.shift();
      console.warn(`[Wayfinder AI] ${msg}`, data || "");
    },
    error(msg, err) {
      const timestamp = new Date().toLocaleTimeString();
      this.logs.push(`[${timestamp}] ❌ ${msg}: ${err?.message || err}`);
      if (this.logs.length > 100) this.logs.shift();
      console.error(`[Wayfinder AI] ${msg}`, err || "");
    }
  };

  WayfinderLogger.log(`Content script loaded on: ${window.location.href}`);

  async function copyDiagnosticLogs() {
    WayfinderLogger.log("Compiling diagnostic report for clipboard...");
    let bgLogs = [];
    let bgSettings = {};
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_DEBUG_LOGS" });
      if (res && res.logs) bgLogs = res.logs;
      const s = await chrome.storage.local.get("wayfinder_settings");
      bgSettings = s.wayfinder_settings || {};
    } catch (e) {
      WayfinderLogger.error("Failed to fetch background debug logs", e);
    }

    const domMarkers = Array.from(document.querySelectorAll(".wayfinder-dom-marker"));
    const markerDetails = domMarkers.map((m, idx) => {
      const parent = m.parentElement;
      return `  ${idx + 1}. <${parent?.tagName.toLowerCase()}${parent?.id ? `#${parent.id}` : ''}${parent?.className ? `.${parent.className.split(' ').slice(0, 2).join('.')}` : ''}> -> Note: "${m.innerText.trim().slice(0, 60)}"`;
    }).join("\n");

    const activeProvider = bgSettings.activeProvider || "ollama";
    const rawKey = bgSettings.apiKeys?.[activeProvider] || "";
    const maskedKey = rawKey ? `${rawKey.slice(0, 7)}...${rawKey.slice(-5)}` : "None configured";

    const report = [
      "================ WAYFINDER AI DIAGNOSTIC REPORT ================",
      `Generated At: ${new Date().toISOString()}`,
      `Current URL: ${window.location.href}`,
      `Page Title: ${document.title || "Untitled"}`,
      `Domain: ${window.location.hostname}`,
      `Detected E-Commerce: ${extractProductInfo() ? "YES (" + JSON.stringify(extractProductInfo()) + ")" : "NO"}`,
      "",
      "--- SETTINGS & AI CONFIGURATION ---",
      `Enabled: ${bgSettings.enabled !== false}`,
      `Active Provider: ${activeProvider}`,
      `Configured Model: ${bgSettings.selectedModels?.[activeProvider] || "Default"}`,
      `API Key: ${maskedKey}`,
      `Endpoint: ${bgSettings.customEndpoints?.[activeProvider] || "Default"}`,
      `Marker Style: ${currentMarkerStyle}`,
      `Markers Enabled in Settings: ${bgSettings.domMarkersEnabled !== false}`,
      "",
      "--- ON-PAGE DOM MARKERS STATUS ---",
      `Active Markers on Page: ${domMarkers.length}`,
      markerDetails || "  (No markers currently rendered on DOM)",
      "",
      "--- RECENT IN-PAGE CONTENT SCRIPT LOGS ---",
      WayfinderLogger.logs.slice(-25).join("\n") || "  (No content logs recorded)",
      "",
      "--- RECENT BACKGROUND AI WORKER LOGS ---",
      bgLogs.slice(-3).map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.type} - Status: ${l.status}${l.error ? ` (Error: ${l.error})` : ''} - Provider: ${l.provider}`).join("\n") || "  (No background logs recorded)",
      "================================================================"
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      showInPageToast("✓ Diagnostic logs copied to clipboard! Paste them here.");
      WayfinderLogger.log("Diagnostic report successfully written to clipboard.");
    } catch (err) {
      console.log(report);
      alert("Diagnostic logs output to browser console (F12)!");
    }
  }

  function showInPageToast(message) {
    let toast = document.getElementById("wayfinder-inpage-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "wayfinder-inpage-toast";
      toast.className = "wayfinder-inpage-toast";
      (document.body || document.documentElement).appendChild(toast);
    }
    toast.innerText = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 3500);
  }

  /**
   * 1. Extract context from DOM & Domain-specific detection
   */
  function extractProductInfo() {
    const isAmazon = window.location.hostname.includes("amazon");
    const isEcom = isAmazon ||
      window.location.hostname.includes("bestbuy") ||
      window.location.hostname.includes("walmart") ||
      window.location.hostname.includes("ebay") ||
      window.location.hostname.includes("target") ||
      Boolean(document.querySelector('[itemtype*="Product"], [data-asin], #productTitle, .product-title, .price, .a-price'));

    if (!isEcom) return null;

    const titleEl = document.querySelector("#productTitle, h1.product-title, [data-automation-id='product-title'], h1");
    const priceEl = document.querySelector("#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen, #corePrice_feature_div .a-offscreen, .price, [itemprop='price']");
    const ratingEl = document.querySelector("#acrPopover, #averageCustomerReviews, .a-icon-star, .rating-score, [itemprop='ratingValue']");
    const reviewCountEl = document.querySelector("#acrCustomerReviewText, .total-review-count, [itemprop='reviewCount']");
    const availabilityEl = document.querySelector("#availability, [data-feature-name='availability']");

    const info = {
      isEcommerce: true,
      productName: titleEl ? titleEl.innerText.trim() : "",
      price: priceEl ? priceEl.innerText.trim() : "",
      rating: ratingEl ? (ratingEl.getAttribute("title") || ratingEl.innerText).trim() : "",
      reviewsCount: reviewCountEl ? reviewCountEl.innerText.trim() : "",
      inStock: availabilityEl ? availabilityEl.innerText.trim() : ""
    };

    if (!info.productName && !info.price) return null;
    return info;
  }

  function extractPageContext() {
    const title = document.title || "";
    const url = window.location.href;
    const domain = window.location.hostname;
    const productInfo = extractProductInfo();

    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") ||
                     document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";

    const headingElements = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 8);
    const headings = headingElements.map(h => h.innerText.trim()).filter(Boolean);

    const actionElements = [];
    document.querySelectorAll("button, a.btn, a.button, input[type='submit'], [role='button'], nav a").forEach((el, idx) => {
      if (idx < 15) {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
        if (text && text.length < 50 && !el.closest("#wayfinder-hud-root")) {
          actionElements.push({
            text,
            tag: el.tagName.toLowerCase(),
            selector: generateSimpleSelector(el)
          });
        }
      }
    });

    const clone = document.body ? document.body.cloneNode(true) : null;
    let condensedText = "";
    if (clone) {
      clone.querySelectorAll("script, style, noscript, svg, nav, footer, header, #wayfinder-hud-root, #wayfinder-selection-btn, #wayfinder-selection-popover, #wayfinder-chat-root, .wayfinder-dom-marker").forEach(node => node.remove());
      condensedText = (clone.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);
    }

    return { title, url, domain, metaDescription: metaDesc, headings, actionElements, condensedText, productInfo };
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
   * 2. Initialize HUD
   */
  function injectBeaconHUD() {
    if (document.getElementById("wayfinder-hud-root")) return;

    beaconContainer = document.createElement("div");
    beaconContainer.id = "wayfinder-hud-root";
    beaconContainer.className = "wayfinder-hud-root";

    const beacon = document.createElement("div");
    beacon.className = "wayfinder-signal-beacon";
    beacon.title = "Wayfinder AI - Click to toggle panel, or hover to preview";
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

    overlayCard = document.createElement("div");
    overlayCard.className = "wayfinder-overlay-card";
    overlayCard.innerHTML = `
      <div class="wayfinder-card-header">
        <div class="wayfinder-card-brand">
          <span class="wayfinder-logo-dot"></span>
          <span class="wayfinder-card-title">Wayfinder Navigator</span>
          <span class="wayfinder-pin-badge" id="wayfinder-pin-badge" title="Card is pinned open" style="display:none;">Pinned</span>
        </div>
        <div class="wayfinder-card-controls">
          <button class="wayfinder-style-toggle-btn" id="wayfinder-style-toggle-btn" title="Toggle between Purple Dots & Direct Purple Text Boxes">
            ${currentMarkerStyle === 'badge' ? '🟣 Dots' : '🏷️ Text Boxes'}
          </button>
          <button class="wayfinder-header-chat-btn" id="wayfinder-open-chat-btn" title="Open Copilot Chat (Cmd+I)">
            <span>💬 Copilot</span>
            <kbd class="wayfinder-kbd">⌘I</kbd>
          </button>
          <button class="wayfinder-icon-btn" id="wayfinder-pin-btn" title="Pin / Unpin panel">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v8m-4-4h8M5 10l2 2v7l5 3 5-3v-7l2-2"></path>
            </svg>
          </button>
          <button class="wayfinder-icon-btn" id="wayfinder-refresh-btn" title="Re-analyze Page">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"></path>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
          </button>
          <button class="wayfinder-icon-btn" id="wayfinder-copy-logs-btn" title="Copy Diagnostic Logs for Debugging">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
            </svg>
          </button>
          <button class="wayfinder-icon-btn" id="wayfinder-close-btn" title="Dismiss Panel">&times;</button>
        </div>
      </div>
      <div class="wayfinder-card-body" id="wayfinder-card-body">
        <div class="wayfinder-loading-state">
          <div class="wayfinder-spinner"></div>
          <span>Scanning DOM & contextual cues...</span>
        </div>
      </div>
    `;

    beaconContainer.appendChild(beacon);
    beaconContainer.appendChild(overlayCard);
    document.body.appendChild(beaconContainer);

    function openCard() {
      clearTimeout(closeTimer);
      overlayCard.classList.add("wayfinder-card-open");
    }

    function scheduleClose() {
      if (isCardPinned) return;
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        overlayCard.classList.remove("wayfinder-card-open");
      }, 350);
    }

    beacon.addEventListener("mouseenter", openCard);
    beacon.addEventListener("mouseleave", scheduleClose);

    overlayCard.addEventListener("mouseenter", openCard);
    overlayCard.addEventListener("mouseleave", scheduleClose);

    beacon.addEventListener("click", (e) => {
      e.stopPropagation();
      isCardPinned = !isCardPinned;
      updatePinUI();
      if (isCardPinned) {
        openCard();
      } else {
        overlayCard.classList.toggle("wayfinder-card-open");
      }
    });

    const styleToggleBtn = document.getElementById("wayfinder-style-toggle-btn");
    if (styleToggleBtn) {
      styleToggleBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        currentMarkerStyle = (currentMarkerStyle === "badge" ? "dot" : "badge");
        styleToggleBtn.innerText = currentMarkerStyle === "badge" ? "🟣 Dots" : "🏷️ Text Boxes";

        // Save preference
        try {
          const curr = await chrome.storage.local.get("wayfinder_settings");
          const newSettings = curr.wayfinder_settings || {};
          newSettings.markerStyle = currentMarkerStyle;
          await chrome.storage.local.set({ wayfinder_settings: newSettings });
        } catch (err) {}

        // Re-render markers instantly
        renderDomMarkers(currentGuidanceItems);
      });
    }

    const openChatBtn = document.getElementById("wayfinder-open-chat-btn");
    if (openChatBtn) {
      openChatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleChatbox();
      });
    }

    document.getElementById("wayfinder-pin-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      isCardPinned = !isCardPinned;
      updatePinUI();
    });

    document.getElementById("wayfinder-close-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      isCardPinned = false;
      updatePinUI();
      overlayCard.classList.remove("wayfinder-card-open");
    });

    document.getElementById("wayfinder-refresh-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      runPageAnalysis(true);
    });

    const copyLogsBtn = document.getElementById("wayfinder-copy-logs-btn");
    if (copyLogsBtn) {
      copyLogsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyDiagnosticLogs();
      });
    }
  }

  function updatePinUI() {
    const pinBadge = document.getElementById("wayfinder-pin-badge");
    const pinBtn = document.getElementById("wayfinder-pin-btn");
    if (pinBadge) pinBadge.style.display = isCardPinned ? "inline-block" : "none";
    if (pinBtn) {
      if (isCardPinned) {
        pinBtn.classList.add("active-pin");
      } else {
        pinBtn.classList.remove("active-pin");
      }
    }
  }

  /**
   * 3. Run Page Analysis (Exactly 1 call per page load / refresh)
   */
  async function runPageAnalysis(force = false) {
    if (isAnalyzing) return;
    if (hasAnalyzedCurrentPage && !force) return; // Prevent multiple calls per page refresh

    const { wayfinder_settings: settings = {} } = await chrome.storage.local.get("wayfinder_settings");
    if (settings.enabled === false) {
      if (beaconContainer) beaconContainer.style.display = "none";
      clearDomMarkers();
      return;
    } else {
      if (beaconContainer) beaconContainer.style.display = "block";
    }

    injectBeaconHUD();

    if (settings.markerStyle) {
      currentMarkerStyle = settings.markerStyle;
      const styleBtn = document.getElementById("wayfinder-style-toggle-btn");
      if (styleBtn) {
        styleBtn.innerText = currentMarkerStyle === "badge" ? "🟣 Dots" : "🏷️ Text Boxes";
      }
    }

    isAnalyzing = true;
    hasAnalyzedCurrentPage = true;

    // Place initial DOM markers so user sees interesting interactable items right away
    if (settings.domMarkersEnabled !== false) {
      applyHeuristicDomMarkers();
    }

    const cardBody = document.getElementById("wayfinder-card-body");
    if (cardBody) {
      cardBody.innerHTML = `
        <div class="wayfinder-loading-state">
          <div class="wayfinder-spinner"></div>
          <span>Analyzing DOM & navigation cues...</span>
        </div>
      `;
    }

    const context = extractPageContext();

    chrome.runtime.sendMessage({
      type: "RECORD_PAGE_VISIT",
      payload: {
        url: context.url,
        title: context.title,
        domain: context.domain,
        metaDescription: context.metaDescription
      }
    });

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

      renderGuidanceContent(response.guidance, response.provider, response.model);

      if (response.domMarkersEnabled !== false && settings.domMarkersEnabled !== false) {
        renderDomMarkers(response.guidance.domHighlights || response.guidance.suggestedActions || []);
      } else {
        clearDomMarkers();
      }
    } catch (err) {
      isAnalyzing = false;
      renderErrorState(err.message);
    }
  }

  /**
   * 4. Render main guidance card
   */
  function renderGuidanceContent(guidance, provider, model) {
    const cardBody = document.getElementById("wayfinder-card-body");
    const badge = document.getElementById("wayfinder-beacon-badge");
    if (!cardBody) return;

    if (badge) badge.style.display = "block";

    const productInfo = extractProductInfo();

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
      ${productInfo ? `
        <div class="wayfinder-product-banner">
          <div class="wayfinder-product-badge">🛍️ E-Commerce Insight</div>
          <div class="wayfinder-product-name">${escapeHtml(productInfo.productName || "Product Detected")}</div>
          <div class="wayfinder-product-stats">
            ${productInfo.price ? `<span class="wayfinder-product-price">${escapeHtml(productInfo.price)}</span>` : ""}
            ${productInfo.rating ? `<span class="wayfinder-product-rating">⭐ ${escapeHtml(productInfo.rating)}</span>` : ""}
            ${productInfo.reviewsCount ? `<span class="wayfinder-product-reviews">(${escapeHtml(productInfo.reviewsCount)})</span>` : ""}
          </div>
          <button class="wayfinder-ecom-cta-btn" id="wayfinder-product-deals-btn">
            🔍 Check cheaper alternatives & price history (⌘I)
          </button>
        </div>
      ` : ""}

      <div class="wayfinder-summary-box">
        <div class="wayfinder-meta-tag">Goal: ${escapeHtml(guidance.pageGoal || "Navigation")}</div>
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

    const dealsBtn = cardBody.querySelector("#wayfinder-product-deals-btn");
    if (dealsBtn && productInfo) {
      dealsBtn.addEventListener("click", () => {
        toggleChatbox(true, `Product: ${productInfo.productName} (${productInfo.price})`);
        sendChatMessage("Can I find this product cheaper elsewhere, or what are historical price trends and good alternative brands?");
      });
    }

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
    let targetEl = null;

    if (action.targetHint) {
      try {
        targetEl = document.querySelector(action.targetHint);
      } catch (e) {}

      if (!targetEl) {
        const all = Array.from(document.querySelectorAll("a, button, input[type='submit'], [role='button']"));
        targetEl = all.find(el => (el.innerText || el.value || "").toLowerCase().includes(action.targetHint.toLowerCase()));
      }
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      targetEl.classList.add("wayfinder-target-pulse");
      setTimeout(() => targetEl.classList.remove("wayfinder-target-pulse"), 2500);
    }
  }

  /**
   * 5. IN-PAGE DOM MARKERS: Purple beacon markers on interesting items with hover & click popovers
   */
  function clearDomMarkers() {
    document.querySelectorAll(".wayfinder-dom-marker").forEach(el => el.remove());
  }

  // Fallback heuristic markers so interesting items are highlighted immediately
  function getHeuristicDomCandidates() {
    const candidates = [];
    const seen = new Set();

    // 1. Domain-specific E-Commerce high-value elements (Amazon, BestBuy, Walmart, etc.)
    const ecomRules = [
      {
        sel: "#corePriceDisplay_desktop_feature_div, #corePrice_feature_div, .priceToPay, .apexPriceToPay, #priceblock_ourprice, #priceblock_dealprice, #price, .product-price, [itemprop='price'], .a-price:not(.a-offscreen)",
        note: "Price: Check historical price trends or cheaper alternatives (⌘I)"
      },
      {
        sel: "#add-to-cart-button, #buy-now-button, #addToCart, #buyNow, input[name='submit.add-to-cart'], button.add-to-cart, #exportsUndeliverable-cart-announce",
        note: "Purchase Action: Compare seller ratings & return policies before buying"
      },
      {
        sel: "#acrCustomerReviewText, #averageCustomerReviews, #reviewsMedley, [data-hook='total-review-count']",
        note: "Customer Reviews: Ask Copilot (⌘I) to summarize sentiment & flaws"
      },
      {
        sel: "#feature-bullets, #technicalSpecifications_section_1, #productOverview_feature_div, .specs, .features",
        note: "Specifications: Key product details and features"
      }
    ];

    for (const rule of ecomRules) {
      try {
        const elements = Array.from(document.querySelectorAll(rule.sel));
        for (let el of elements) {
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0 && el.offsetParent === null) continue;

          // If target is inside an Amazon button container, attach to the outer visible button
          const outerBtn = el.closest(".a-button");
          if (outerBtn) el = outerBtn;

          if (!seen.has(el) && !el.closest("#wayfinder-hud-root") && !el.closest("#wayfinder-chat-root")) {
            seen.add(el);
            candidates.push({ element: el, note: rule.note });
            break;
          }
        }
      } catch (e) {}
    }

    // 2. General page interactive elements (buttons, links, search, headers)
    const selectors = [
      "main button", "header button", "button",
      "header nav a", "nav a", "main a.btn", "main a.button", "a.btn",
      "[role='button']", "input[type='submit']",
      "main h1", "h1", "h2", "input[type='search']", "input[name='q']"
    ];

    for (const sel of selectors) {
      try {
        const elements = Array.from(document.querySelectorAll(sel));
        for (let el of elements) {
          if (candidates.length >= 8) break;
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0 && el.offsetParent === null) continue;

          const outerBtn = el.closest(".a-button");
          if (outerBtn) el = outerBtn;

          if (seen.has(el) || el.closest("#wayfinder-hud-root") || el.closest("#wayfinder-selection-popover") || el.closest("#wayfinder-chat-root")) continue;

          if (rect.width > 20 && rect.height > 15) {
            seen.add(el);
            candidates.push({
              element: el,
              note: `Key element: "${(el.innerText || el.value || el.title || 'Page Action').trim().slice(0, 35)}"`
            });
          }
        }
      } catch (e) {}
      if (candidates.length >= 8) break;
    }

    return candidates;
  }

  function applyHeuristicDomMarkers() {
    WayfinderLogger.log("Scanning DOM for candidates...");
    const candidates = getHeuristicDomCandidates();
    WayfinderLogger.log(`Found ${candidates.length} DOM candidates to mark.`);
    renderDomMarkers(candidates);
  }

  function renderDomMarkers(items) {
    clearDomMarkers();

    let effectiveItems = (items && items.length > 0) ? items : null;
    if (!effectiveItems || effectiveItems.length === 0) {
      WayfinderLogger.log("No specific guidance items provided, falling back to heuristic candidates...");
      effectiveItems = getHeuristicDomCandidates();
    }
    if (!effectiveItems || !effectiveItems.length) {
      WayfinderLogger.warn("No DOM elements found to render markers.");
      return;
    }

    currentGuidanceItems = effectiveItems;
    let attachedCount = 0;

    effectiveItems.forEach((item) => {
      let target = item.element || null;

      if (!target && item.selector) {
        try { target = document.querySelector(item.selector); } catch (e) {}
      }

      const hint = item.targetHint || item.textHint || item.label;
      if (!target && hint) {
        const candidates = Array.from(document.querySelectorAll("a, button, h1, h2, h3, nav a, header a, form input[type='submit'], [role='button']"));
        target = candidates.find(el => {
          const text = (el.innerText || el.value || "").toLowerCase();
          return text.includes(hint.toLowerCase()) && !el.closest("#wayfinder-hud-root") && !el.closest("#wayfinder-chat-root");
        });
      }

      if (target) {
        const outerBtn = target.closest(".a-button");
        if (outerBtn) target = outerBtn;
      }

      if (target && !target.closest("#wayfinder-hud-root") && !target.closest("#wayfinder-chat-root") && !target.querySelector(".wayfinder-dom-marker")) {
        const marker = document.createElement("div");
        const noteText = item.note || item.explanation || item.label || "Key navigation item";

        if (currentMarkerStyle === "badge") {
          // Direct Purple Box (Inline Callout Box)
          marker.className = "wayfinder-dom-marker wayfinder-marker-callout";
          marker.setAttribute("data-marker-style", "badge");
          marker.title = noteText;

          marker.innerHTML = `
            <div class="wayfinder-callout-box">
              <span class="wayfinder-callout-icon">✦</span>
              <span class="wayfinder-callout-text">${escapeHtml(noteText)}</span>
              <button class="wayfinder-callout-chat-btn" title="Ask Copilot about this (⌘I)">💬 Ask</button>
            </div>
          `;

          const chatBtn = marker.querySelector(".wayfinder-callout-chat-btn");
          if (chatBtn) {
            chatBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              e.preventDefault();
              const elSnippet = (target.innerText || target.value || target.title || "").trim().slice(0, 80);
              toggleChatbox(true, `${noteText}${elSnippet ? ` (${elSnippet})` : ''}`);
            });
          }

          // Click on callout box also scrolls element into view smoothly if partially obscured
          marker.addEventListener("click", (e) => {
            if (!e.target.closest(".wayfinder-callout-chat-btn")) {
              target.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          });
        } else {
          // Dot Mode with Hover/Click Popover
          marker.className = "wayfinder-dom-marker wayfinder-marker-dot-mode";
          marker.setAttribute("data-marker-style", "dot");
          marker.title = "Wayfinder Insight (Click or hover for details)";

          marker.innerHTML = `
            <div class="wayfinder-marker-dot"></div>
            <div class="wayfinder-marker-popover">
              <div class="wayfinder-marker-popover-header">
                <span class="wayfinder-marker-icon">✦</span>
                <strong>Wayfinder Insight</strong>
              </div>
              <div class="wayfinder-marker-note">${escapeHtml(noteText)}</div>
              <button class="wayfinder-marker-chat-btn" title="Open Copilot chat with this context">
                💬 Ask Copilot <kbd>⌘I</kbd>
              </button>
            </div>
          `;

          // Click on marker opens/toggles popover
          marker.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const popover = marker.querySelector(".wayfinder-marker-popover");
            if (popover) {
              popover.classList.toggle("wayfinder-popover-pinned");
            }
          });

          // Chat button opens chatbox with item context
          const chatBtn = marker.querySelector(".wayfinder-marker-chat-btn");
          if (chatBtn) {
            chatBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              e.preventDefault();
              const elSnippet = (target.innerText || target.value || target.title || "").trim().slice(0, 80);
              toggleChatbox(true, `${noteText}${elSnippet ? ` (${elSnippet})` : ''}`);
            });
          }
        }

        // Positioning & preserving UX without breaking page layout
        const computed = window.getComputedStyle(target);
        if (computed.position === "static") {
          target.style.position = "relative";
        }

        // Un-clip parent containers (like Amazon's .a-button-inner or table cells)
        let curr = target;
        while (curr && curr !== document.body) {
          const cs = window.getComputedStyle(curr);
          if (cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.overflowY === "hidden") {
            curr.style.setProperty("overflow", "visible", "important");
          }
          curr = curr.parentElement;
        }

        // Avoid clipping if element is near top of viewport
        const rect = target.getBoundingClientRect();
        if (currentMarkerStyle === "badge" && rect.top < 32) {
          marker.classList.add("wayfinder-callout-below");
        }

        // Attach marker
        try {
          target.appendChild(marker);
          attachedCount++;
          WayfinderLogger.log(`Attached marker #${attachedCount} to <${target.tagName.toLowerCase()}>`, noteText);
        } catch (e) {
          // If element doesn't allow children (e.g. input), insert as sibling
          if (target.parentNode) {
            target.parentNode.style.position = target.parentNode.style.position === "static" ? "relative" : target.parentNode.style.position;
            target.parentNode.insertBefore(marker, target.nextSibling);
            attachedCount++;
            WayfinderLogger.log(`Attached marker #${attachedCount} as sibling to <${target.tagName.toLowerCase()}>`, noteText);
          }
        }
      }
    });

    WayfinderLogger.log(`Finished rendering markers. Total attached: ${attachedCount}`);
  }

  /**
   * 6. TEXT SELECTION AI ANALYSIS
   */
  function initTextSelectionCopilot() {
    selectionButton = document.createElement("button");
    selectionButton.id = "wayfinder-selection-btn";
    selectionButton.className = "wayfinder-selection-btn";
    selectionButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
      </svg>
      <span>Analyze with AI</span>
    `;
    document.body.appendChild(selectionButton);

    selectionPopover = document.createElement("div");
    selectionPopover.id = "wayfinder-selection-popover";
    selectionPopover.className = "wayfinder-selection-popover";
    selectionPopover.innerHTML = `
      <div class="wayfinder-sel-header">
        <span class="wayfinder-sel-title">✦ Selected Text Analysis</span>
        <button class="wayfinder-sel-close" id="wayfinder-sel-close">&times;</button>
      </div>
      <div class="wayfinder-sel-body" id="wayfinder-sel-body">
        <div class="wayfinder-spinner"></div>
      </div>
    `;
    document.body.appendChild(selectionPopover);

    document.getElementById("wayfinder-sel-close").addEventListener("click", () => {
      selectionPopover.classList.remove("visible");
    });

    document.addEventListener("mouseup", (e) => {
      if (e.target.closest("#wayfinder-selection-btn") || e.target.closest("#wayfinder-selection-popover") || e.target.closest("#wayfinder-hud-root")) {
        return;
      }

      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : "";

      if (text.length > 5) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        const top = window.scrollY + rect.bottom + 8;
        const left = Math.max(10, window.scrollX + rect.left + (rect.width / 2) - 65);

        selectionButton.style.top = `${top}px`;
        selectionButton.style.left = `${left}px`;
        selectionButton.classList.add("visible");
        selectionButton.dataset.selectedText = text;
      } else {
        selectionButton.classList.remove("visible");
      }
    });

    selectionButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      const text = selectionButton.dataset.selectedText;
      if (!text) return;

      selectionButton.classList.remove("visible");

      const btnRect = selectionButton.getBoundingClientRect();
      const popoverTop = window.scrollY + btnRect.bottom + 6;
      const popoverLeft = Math.min(window.innerWidth - 360, Math.max(16, window.scrollX + btnRect.left - 120));

      selectionPopover.style.top = `${popoverTop}px`;
      selectionPopover.style.left = `${popoverLeft}px`;
      selectionPopover.classList.add("visible");

      const body = document.getElementById("wayfinder-sel-body");
      body.innerHTML = `
        <div class="wayfinder-loading-state">
          <div class="wayfinder-spinner"></div>
          <span>Analyzing highlighted text...</span>
        </div>
      `;

      try {
        const res = await chrome.runtime.sendMessage({
          type: "ANALYZE_SELECTED_TEXT",
          payload: {
            selectedText: text,
            pageUrl: window.location.href,
            pageTitle: document.title
          }
        });

        if (res && res.success) {
          body.innerHTML = `
            <div class="wayfinder-sel-content">${formatMarkdownSnippets(res.analysis)}</div>
            <div class="wayfinder-sel-actions">
              <button class="wayfinder-sel-chat-btn" id="wayfinder-sel-chat-btn">
                💬 Discuss in Chat <kbd>⌘I</kbd>
              </button>
            </div>
            <div class="wayfinder-footer-provider">
              <span>Model: <strong>${escapeHtml(res.provider)}</strong> (${escapeHtml(res.model)})</span>
            </div>
          `;

          const chatBtn = body.querySelector("#wayfinder-sel-chat-btn");
          if (chatBtn) {
            chatBtn.addEventListener("click", () => {
              selectionPopover.classList.remove("visible");
              toggleChatbox(true, text);
            });
          }
        } else {
          body.innerHTML = `<p class="wayfinder-error-msg">${escapeHtml(res?.error || "Could not analyze text.")}</p>`;
        }
      } catch (err) {
        body.innerHTML = `<p class="wayfinder-error-msg">${escapeHtml(err.message)}</p>`;
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (!e.target.closest("#wayfinder-selection-popover") && !e.target.closest("#wayfinder-selection-btn")) {
        selectionPopover.classList.remove("visible");
      }
    });
  }

  function formatMarkdownSnippets(text) {
    if (!text) return "";
    return escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n- /g, "<br>• ");
  }

  function renderErrorState(errorMessage) {
    WayfinderLogger.error("Error State Triggered", errorMessage);
    const cardBody = document.getElementById("wayfinder-card-body");
    const badge = document.getElementById("wayfinder-beacon-badge");
    if (badge) {
      badge.style.display = "block";
      badge.textContent = "!";
      badge.style.background = "#ef4444";
    }
    if (!cardBody) return;
    cardBody.innerHTML = `
      <div class="wayfinder-error-state">
        <div class="wayfinder-error-icon">⚠️</div>
        <div class="wayfinder-error-title">AI Guidance Notice</div>
        <div class="wayfinder-error-msg">${escapeHtml(errorMessage)}</div>
        <p class="wayfinder-error-help">Check your API key in the extension popup or verify provider settings.</p>
        <button class="wayfinder-copy-logs-btn" id="wayfinder-copy-logs-err-btn" style="margin-top: 10px; background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; border-radius: 6px; padding: 6px 12px; font-weight: 600; cursor: pointer;">
          📋 Copy Diagnostic Logs
        </button>
      </div>
    `;

    const errCopyBtn = document.getElementById("wayfinder-copy-logs-err-btn");
    if (errCopyBtn) {
      errCopyBtn.addEventListener("click", () => {
        copyDiagnosticLogs();
      });
    }
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

  // Storage listener for setting changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.wayfinder_settings) {
      const newSettings = changes.wayfinder_settings.newValue || {};
      if (newSettings.enabled === false) {
        if (beaconContainer) beaconContainer.style.display = "none";
        clearDomMarkers();
      } else {
        if (beaconContainer) beaconContainer.style.display = "block";
        if (newSettings.domMarkersEnabled === false) {
          clearDomMarkers();
        } else {
          if (newSettings.markerStyle && newSettings.markerStyle !== currentMarkerStyle) {
            currentMarkerStyle = newSettings.markerStyle;
            const styleBtn = document.getElementById("wayfinder-style-toggle-btn");
            if (styleBtn) {
              styleBtn.innerText = currentMarkerStyle === "badge" ? "🟣 Dots" : "🏷️ Text Boxes";
            }
          }
          if (currentGuidanceItems.length) {
            renderDomMarkers(currentGuidanceItems);
          } else {
            applyHeuristicDomMarkers();
          }
        }
      }
    }
  });

  /**
   * 7. INTERACTIVE CHATBOX COPILOT (Cmd+I / Ctrl+I)
   */
  function initChatboxCopilot() {
    if (document.getElementById("wayfinder-chat-root")) return;

    chatRoot = document.createElement("div");
    chatRoot.id = "wayfinder-chat-root";
    chatRoot.className = "wayfinder-chat-root";
    chatRoot.style.display = "none";

    chatRoot.innerHTML = `
      <div class="wayfinder-chat-panel">
        <div class="wayfinder-chat-header">
          <div class="wayfinder-chat-brand">
            <span class="wayfinder-chat-sparkle">✦</span>
            <div>
              <div class="wayfinder-chat-title">Wayfinder AI Copilot</div>
              <div class="wayfinder-chat-subtitle">In-Page Context Assistant</div>
            </div>
          </div>
          <div class="wayfinder-chat-controls">
            <button class="wayfinder-chat-ctrl" id="wayfinder-chat-close" title="Close (Cmd+I)">&times;</button>
          </div>
        </div>

        <div class="wayfinder-chat-context-banner" id="wayfinder-chat-context-banner" style="display:none;">
          <span class="wayfinder-chat-context-icon">📌</span>
          <span class="wayfinder-chat-context-text" id="wayfinder-chat-context-text"></span>
          <button class="wayfinder-chat-clear-ctx" id="wayfinder-chat-clear-ctx" title="Clear Context">&times;</button>
        </div>

        <div class="wayfinder-chat-quick-chips" id="wayfinder-chat-quick-chips"></div>

        <div class="wayfinder-chat-messages" id="wayfinder-chat-messages">
          <div class="wayfinder-chat-msg wayfinder-msg-ai">
            <div class="wayfinder-msg-bubble">
              👋 <strong>Hi! I'm your Wayfinder Page Copilot.</strong><br>
              Ask me anything about this page, compare prices & alternative stores, or inspect specific elements. Press <kbd class="wayfinder-kbd">⌘I</kbd> anytime to open or close me.
            </div>
          </div>
        </div>

        <div class="wayfinder-chat-input-wrapper">
          <textarea id="wayfinder-chat-input" placeholder="Ask a question about this page... (Enter to send)" rows="1"></textarea>
          <button id="wayfinder-chat-send-btn" title="Send message">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(chatRoot);

    chatMessagesContainer = document.getElementById("wayfinder-chat-messages");
    chatInput = document.getElementById("wayfinder-chat-input");

    document.getElementById("wayfinder-chat-close").addEventListener("click", () => {
      toggleChatbox(false);
    });

    document.getElementById("wayfinder-chat-clear-ctx").addEventListener("click", () => {
      setChatContext("");
    });

    chatInput.addEventListener("input", () => {
      chatInput.style.height = "auto";
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    });

    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    document.getElementById("wayfinder-chat-send-btn").addEventListener("click", () => {
      sendChatMessage();
    });

    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleChatbox();
      }
    });

    renderQuickPromptChips();
  }

  function toggleChatbox(forceState, contextText) {
    if (!chatRoot) initChatboxCopilot();

    if (forceState !== undefined) {
      isChatOpen = forceState;
    } else {
      isChatOpen = !isChatOpen;
    }

    if (isChatOpen) {
      chatRoot.style.display = "block";
      chatRoot.classList.add("wayfinder-chat-visible");

      const sel = window.getSelection() ? window.getSelection().toString().trim() : "";
      if (contextText) {
        setChatContext(contextText);
      } else if (sel) {
        setChatContext(sel);
      } else {
        const product = extractProductInfo();
        if (product) {
          setChatContext(`Product: ${product.productName || "Item"} (${product.price || ""})`);
        }
      }

      renderQuickPromptChips();
      setTimeout(() => chatInput && chatInput.focus(), 100);
    } else {
      chatRoot.style.display = "none";
      chatRoot.classList.remove("wayfinder-chat-visible");
    }
  }

  function setChatContext(ctx) {
    chatContext = ctx || "";
    const banner = document.getElementById("wayfinder-chat-context-banner");
    const textEl = document.getElementById("wayfinder-chat-context-text");
    if (!banner || !textEl) return;

    if (chatContext) {
      textEl.innerText = chatContext.slice(0, 80) + (chatContext.length > 80 ? "..." : "");
      banner.style.display = "flex";
    } else {
      banner.style.display = "none";
    }
  }

  function renderQuickPromptChips() {
    const chipsContainer = document.getElementById("wayfinder-chat-quick-chips");
    if (!chipsContainer) return;

    const product = extractProductInfo();
    let prompts = [];

    if (product) {
      prompts = [
        "🔍 Cheaper elsewhere?",
        "⭐ Review sentiment & flaws",
        "⚖️ Alternative products",
        "💵 Is this price a deal?"
      ];
    } else {
      prompts = [
        "📋 Summarize page",
        "🧭 What should I click next?",
        "💡 Explain key terms",
        "⚡ Navigation advice"
      ];
    }

    chipsContainer.innerHTML = prompts.map(p => `
      <button class="wayfinder-quick-chip">${escapeHtml(p)}</button>
    `).join("");

    chipsContainer.querySelectorAll(".wayfinder-quick-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        sendChatMessage(chip.innerText);
      });
    });
  }

  async function sendChatMessage(queryText) {
    if (isSendingChat) return;
    const input = document.getElementById("wayfinder-chat-input");
    const query = (queryText || (input ? input.value : "")).trim();
    if (!query) return;

    if (input && !queryText) {
      input.value = "";
      input.style.height = "auto";
    }

    appendChatMessage("user", query);
    const typingId = "wayfinder-typing-" + Date.now();
    appendChatTyping(typingId);

    isSendingChat = true;

    try {
      const pageCtx = extractPageContext();
      const res = await chrome.runtime.sendMessage({
        type: "CHAT_WITH_PAGE_CONTEXT",
        payload: {
          query,
          pageContext: pageCtx,
          selectedText: chatContext,
          chatHistory
        }
      });

      removeChatTyping(typingId);
      isSendingChat = false;

      if (res && res.success) {
        appendChatMessage("ai", res.answer, res.provider, res.model);
        chatHistory.push(
          { role: "user", content: query },
          { role: "assistant", content: res.answer }
        );
      } else {
        appendChatMessage("ai", `⚠️ ${res?.error || "Sorry, I couldn't reach the AI model."}`);
      }
    } catch (err) {
      removeChatTyping(typingId);
      isSendingChat = false;
      appendChatMessage("ai", `⚠️ Error: ${err.message}`);
    }
  }

  function appendChatMessage(role, text, provider, model) {
    if (!chatMessagesContainer) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = `wayfinder-chat-msg wayfinder-msg-${role}`;

    let bubbleContent = "";
    if (role === "user") {
      bubbleContent = `<div class="wayfinder-msg-bubble">${escapeHtml(text)}</div>`;
    } else {
      bubbleContent = `
        <div class="wayfinder-msg-bubble">
          ${formatMarkdownSnippets(text)}
          ${provider ? `<div class="wayfinder-chat-msg-footer">Powered by <strong>${escapeHtml(provider)}</strong> ${model ? `(${escapeHtml(model)})` : ''}</div>` : ""}
        </div>
      `;
    }

    msgDiv.innerHTML = bubbleContent;
    chatMessagesContainer.appendChild(msgDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function appendChatTyping(id) {
    if (!chatMessagesContainer) return;
    const typingDiv = document.createElement("div");
    typingDiv.id = id;
    typingDiv.className = "wayfinder-chat-msg wayfinder-msg-ai wayfinder-typing-indicator";
    typingDiv.innerHTML = `
      <div class="wayfinder-msg-bubble">
        <span class="wayfinder-dot"></span>
        <span class="wayfinder-dot"></span>
        <span class="wayfinder-dot"></span>
      </div>
    `;
    chatMessagesContainer.appendChild(typingDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function removeChatTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  initTextSelectionCopilot();
  initChatboxCopilot();

  // Watch for full navigation/SPA route changes
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      hasAnalyzedCurrentPage = false;
      runPageAnalysis(true);
    }
  }, 1000);

  // 1. Initial heuristic DOM scan at 400ms (Local DOM only, 0 network requests)
  setTimeout(() => {
    applyHeuristicDomMarkers();
  }, 400);

  // 2. Main Page Analysis at 1000ms (Exactly 1 network request per page load/refresh)
  setTimeout(() => {
    runPageAnalysis();
  }, 1000);

  // 3. Post-hydration resilience check at 2800ms (Local DOM only, 0 network requests) to catch Amazon's late-rendered price & buy box
  setTimeout(() => {
    const activeMarkers = document.querySelectorAll(".wayfinder-dom-marker").length;
    if (activeMarkers < 2) {
      WayfinderLogger.log("Post-hydration resilience check: refreshing on-page markers...");
      applyHeuristicDomMarkers();
    }
  }, 2800);

})();
