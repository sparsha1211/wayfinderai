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
  let lastPageAssistanceData = null;

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
      `Detected Semantic Entity: ${extractSemanticEntity() ? "YES (" + JSON.stringify(extractSemanticEntity()) + ")" : "NO"}`,
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
      "--- ACTIVE AI PROMPT & RAW RESPONSE ---",
      `System Prompt:\n${lastPageAssistanceData?.prompts?.systemPrompt || "N/A"}\n`,
      `User Prompt:\n${lastPageAssistanceData?.prompts?.userPrompt || "N/A"}\n`,
      `Raw Guidance Output:\n${JSON.stringify(lastPageAssistanceData?.guidance || lastPageAssistanceData?.error || "N/A", null, 2)}\n`,
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
   * CRITICAL SECURITY GUARD RAILS: Passwords & Payments
   * Multi-tiered protection: Automatic Shielding, DOM element exclusion, & Regex PII Sanitization.
   */
  function sanitizeSensitiveText(text) {
    if (!text || typeof text !== "string") return "";
    return text
      // Credit card numbers (standard 16-digit or spaced)
      .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, "[CARD_REDACTED]")
      .replace(/\b\d{4}[ -]?\d{6}[ -]?\d{5}\b/g, "[CARD_REDACTED]") // Amex
      // CVV / CVC / Security codes
      .replace(/\b(?:cvv|cvc|cid|security code)[\s:=]*([0-9]{3,4})\b/gi, "[CVV_REDACTED]")
      // Password strings in key-value or query format (e.g. password=xyz)
      .replace(/(?:password|passwd|pwd|secret)[\s:=]+([^\s&,]{3,})/gi, "[PASSWORD_REDACTED]")
      // US Social Security Numbers
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN_REDACTED]")
      // International Bank Account Numbers (IBAN)
      .replace(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/g, "[IBAN_REDACTED]")
      // Cryptocurrency addresses (BTC / ETH)
      .replace(/\b(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g, "[CRYPTO_ADDR_REDACTED]")
      // API Keys and Bearer auth tokens
      .replace(/\b(?:sk-[a-zA-Z0-9_-]{20,}|ghp_[a-zA-Z0-9]{36}|bearer\s+[a-zA-Z0-9._~+/-]+=*)\b/gi, "[KEY_REDACTED]")
      // Email addresses
      .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, "[EMAIL_REDACTED]");
  }

  function isSensitiveElement(el) {
    if (!el || !(el instanceof Element)) return false;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    const id = (el.id || "").toLowerCase();
    const cls = (typeof el.className === "string" ? el.className : "").toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const combined = `${tag} ${type} ${auto} ${name} ${id} ${cls} ${aria}`;

    if (type === "password" || type === "hidden") return true;
    if (/passw|credit|card|cvv|cvc|cid|token|auth|secret|ssn|iban|routing|billing|expir/i.test(combined)) return true;

    // Check if inside a checkout payment form, billing section, or login form
    if (el.closest("form[action*='login'], form[action*='signin'], form[action*='pay'], form[action*='checkout'], form[id*='payment'], form[id*='checkout'], [class*='payment-form']")) {
      if (tag === "input" || tag === "select" || tag === "textarea") return true;
    }

    return false;
  }

  function checkSensitivePageContext() {
    const url = window.location.href.toLowerCase();
    const path = window.location.pathname.toLowerCase();

    // 1. Sensitive URL paths and domains (checkout, payment gateways, login, banking)
    const sensitivePatterns = [
      "/checkout/payment", "/checkout/billing", "/pay", "/payment", "/billing",
      "/login", "/signin", "/signup", "/register", "/auth", "/oauth",
      "/account/password", "/forgot-password", "/reset-password",
      "paypal.com", "stripe.com", "checkout.stripe.com", "pay.google.com"
    ];

    for (const pat of sensitivePatterns) {
      if (url.includes(pat) || path.startsWith(pat)) {
        return { isSensitive: true, reason: "Sensitive payment, billing, or authentication page" };
      }
    }

    // 2. DOM inspection: check for live password or payment inputs
    const passwordEl = document.querySelector("input[type='password'], [autocomplete*='password']");
    if (passwordEl) {
      return { isSensitive: true, reason: "Login or password form detected" };
    }

    const paymentEl = document.querySelector(
      "[autocomplete*='cc-'], [autocomplete*='card'], [data-elements-stable-field-name='cardNumber'], " +
      "input[name*='cardnumber' i], input[name*='cvv' i], input[name*='cvc' i], input[id*='creditcard' i], " +
      "iframe[src*='stripe' i], iframe[src*='paypal' i], iframe[src*='braintree' i]"
    );
    if (paymentEl) {
      return { isSensitive: true, reason: "Credit card or payment form detected" };
    }

    return { isSensitive: false };
  }

  function renderPrivacyShieldState(reason) {
    const cardBody = document.getElementById("wayfinder-card-body");
    const badge = document.getElementById("wayfinder-beacon-badge");
    if (badge) {
      badge.style.display = "block";
      badge.textContent = "🛡️";
      badge.style.background = "#10b981";
      badge.style.borderColor = "#059669";
    }
    if (!cardBody) return;

    cardBody.innerHTML = `
      <div class="wayfinder-privacy-shield-card">
        <div class="wayfinder-shield-header">
          <span class="wayfinder-shield-icon">🛡️</span>
          <div>
            <div class="wayfinder-shield-title">Privacy Shield Active</div>
            <div class="wayfinder-shield-subtitle">${escapeHtml(reason)}</div>
          </div>
        </div>
        <p class="wayfinder-shield-desc">
          Wayfinder AI has automatically paused analysis on this page to prevent any transmission of credentials, passwords, or payment info.
        </p>
        <div class="wayfinder-shield-guarantees">
          <div class="shield-guarantee-item"><span>🔒</span> <strong>Zero Data Sent:</strong> No keystrokes or page text sent to AI.</div>
          <div class="shield-guarantee-item"><span>🛡️</span> <strong>DOM Markers Disabled:</strong> Input elements remain untouched.</div>
          <div class="shield-guarantee-item"><span>⚡</span> <strong>100% Client-Side:</strong> Evaluated entirely on your device.</div>
        </div>
        <button class="wayfinder-shield-force-btn" id="wayfinder-shield-force-btn" title="Analyze only non-sensitive general content">
          Scan Non-Sensitive Content (Override)
        </button>
      </div>
    `;

    const forceBtn = document.getElementById("wayfinder-shield-force-btn");
    if (forceBtn) {
      forceBtn.addEventListener("click", () => {
        runPageAnalysis(true);
      });
    }
  }

  /**
   * 1. Universal Semantic Entity Extraction (Zero domain hardcoding)
   * Inspects Schema.org JSON-LD microdata, OpenGraph tags, and universal DOM cues.
   */
  function extractJsonLdEntity() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const raw = JSON.parse(script.textContent);
        const items = Array.isArray(raw) ? raw : (raw["@graph"] ? raw["@graph"] : [raw]);
        for (const item of items) {
          if (!item || !item["@type"]) continue;
          const typeStr = Array.isArray(item["@type"]) ? item["@type"].join(" ") : String(item["@type"]);
          const t = typeStr.toLowerCase();

          // 1. Stays, Hotels, Vacation Rentals
          if (t.includes("hotel") || t.includes("lodging") || t.includes("accommodation") || t.includes("resort") || t.includes("vacationrental")) {
            return {
              category: "stay",
              name: item.name || item.headline || "",
              price: item.priceRange || (item.offers ? (item.offers.price ? `${item.offers.priceCurrency || '$'}${item.offers.price}` : "") : ""),
              rating: item.aggregateRating?.ratingValue ? `${item.aggregateRating.ratingValue}/5` : "",
              reviewsCount: item.aggregateRating?.reviewCount ? `${item.aggregateRating.reviewCount} reviews` : "",
              location: typeof item.address === "string" ? item.address : (item.address?.addressLocality || item.address?.streetAddress || "")
            };
          }

          // 2. Flights, Airlines, Travel
          if (t.includes("flight") || t.includes("trip") || t.includes("travelaction") || t.includes("flightreservation")) {
            const dep = item.departureAirport?.name || item.departureAirport?.iataCode || "";
            const arr = item.arrivalAirport?.name || item.arrivalAirport?.iataCode || "";
            return {
              category: "flight",
              name: item.name || (dep && arr ? `${dep} → ${arr}` : "Flight Route"),
              price: item.offers?.price ? `${item.offers.priceCurrency || '$'}${item.offers.price}` : "",
              location: dep && arr ? `${dep} to ${arr}` : "",
              dates: item.departureTime ? String(item.departureTime) : ""
            };
          }

          // 3. Products, Shopping, E-Commerce
          if (t.includes("product") || t.includes("itempage")) {
            const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
            return {
              category: "shopping",
              name: item.name || "",
              price: offers?.price ? `${offers.priceCurrency || '$'}${offers.price}` : "",
              rating: item.aggregateRating?.ratingValue ? `${item.aggregateRating.ratingValue}/5` : "",
              reviewsCount: item.aggregateRating?.reviewCount ? `${item.aggregateRating.reviewCount} reviews` : "",
              inStock: offers?.availability?.includes("InStock") ? "In Stock" : ""
            };
          }
        }
      } catch (e) {}
    }
    return null;
  }

  function extractSemanticEntity() {
    const jsonLd = extractJsonLdEntity();
    if (jsonLd && (jsonLd.name || jsonLd.price)) {
      jsonLd.productName = jsonLd.name; // Backwards compatibility
      jsonLd.isEcommerce = jsonLd.category === "shopping";
      return jsonLd;
    }

    // Dynamic heuristic detection across title, meta tags, and URL
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") ||
                     document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const pageText = `${window.location.href} ${document.title} ${metaDesc}`.toLowerCase();

    let category = "general";
    if (/flight|airline|skyscanner|kayak|depart|layover|roundtrip|one-way|boarding/.test(pageText)) {
      category = "flight";
    } else if (/hotel|stay|airbnb|booking|hostel|resort|check-in|check-out|villa|apartment|lodging/.test(pageText)) {
      category = "stay";
    } else if (/cart|add to cart|buy now|price|shop|store|checkout|in stock|item/.test(pageText) || document.querySelector("button[name*='cart'], input[name*='cart'], [class*='cart']")) {
      category = "shopping";
    } else if (/docs|documentation|guide|api|reference|sdk|tutorial/.test(pageText)) {
      category = "docs";
    }

    // Extract Title / Headline
    const headingEl = document.querySelector("#productTitle, h1.product-title, [data-automation-id='product-title'], main h1, h1");
    const name = headingEl ? headingEl.innerText.trim() : (document.title || "").trim();

    // Extract Price / Fare
    let price = "";
    const priceEl = document.querySelector("#priceblock_ourprice, #priceblock_dealprice, .a-price .a-offscreen, #corePrice_feature_div .a-offscreen, .priceToPay, .price, [class*='price'], [class*='fare'], [class*='rate'], [itemprop='price']");
    if (priceEl) {
      const pText = priceEl.innerText.trim();
      const match = pText.match(/[$€£¥₹]\s*[\d,]+(?:\.\d{2})?/);
      if (match) {
        price = match[0];
      } else if (pText.length > 0 && pText.length < 25) {
        price = pText;
      }
    }

    // Extract Rating / Stars
    let rating = "";
    const ratingEl = document.querySelector("#acrPopover, #averageCustomerReviews, .a-icon-star, .rating-score, [class*='rating'], [class*='star'], [itemprop='ratingValue']");
    if (ratingEl) {
      rating = (ratingEl.getAttribute("title") || ratingEl.getAttribute("aria-label") || ratingEl.innerText).trim();
    }

    // Extract Reviews Count
    let reviewsCount = "";
    const reviewEl = document.querySelector("#acrCustomerReviewText, .total-review-count, [class*='review-count'], [itemprop='reviewCount']");
    if (reviewEl) {
      reviewsCount = reviewEl.innerText.trim();
    }

    // Extract Dates
    let dates = "";
    const dateEl = document.querySelector("[class*='date'], [class*='calendar'], [class*='checkin'], [class*='depart'], [data-testid*='date']");
    if (dateEl) {
      dates = dateEl.innerText.trim().slice(0, 45);
    }

    // Extract Location / Destination
    let location = "";
    const locEl = document.querySelector("[class*='location'], [class*='address'], [class*='destination'], [class*='city'], [class*='airport']");
    if (locEl) {
      location = locEl.innerText.trim().slice(0, 50);
    }

    // Only return if we found identifiable semantic markers
    if (!name && !price && !rating && category === "general") {
      return null;
    }

    return {
      category,
      name,
      productName: name, // Backwards compatibility
      price,
      rating,
      reviewsCount,
      dates,
      location,
      isEcommerce: category === "shopping"
    };
  }

  // Backwards compatibility alias
  function extractProductInfo() {
    return extractSemanticEntity();
  }

  function extractPageContext() {
    const title = document.title || "";
    const url = window.location.href;
    const domain = window.location.hostname;
    const semanticEntity = extractSemanticEntity();
    const productInfo = semanticEntity; // Backwards compatibility

    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") ||
                     document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";

    const headingElements = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 8);
    const headings = headingElements.map(h => h.innerText.trim()).filter(Boolean);

    const actionElements = [];
    document.querySelectorAll("button, a.btn, a.button, input[type='submit'], [role='button'], nav a").forEach((el, idx) => {
      if (idx < 15) {
        // Security filter: strictly ignore sensitive inputs, passwords, and payment buttons
        const type = (el.getAttribute("type") || "").toLowerCase();
        const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
        const aria = (el.getAttribute("aria-label") || "").toLowerCase();
        if (type === "password" || type === "hidden") return;
        if (/passw|credit|card|cvv|cvc|token|auth|secret|ssn/i.test(auto + " " + aria + " " + (el.className || ""))) return;

        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
        if (text && text.length < 50 && !el.closest("#wayfinder-hud-root") && !el.closest("#wayfinder-chat-root")) {
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
      // Security filter: strip all scripts, forms, password fields, auth elements, and Wayfinder UI
      clone.querySelectorAll(
        "script, style, noscript, svg, nav, footer, header, input, textarea, select, " +
        "[type='password'], [autocomplete*='password'], [autocomplete*='cc-'], [autocomplete*='card'], " +
        "[data-sensitive], [data-private], .sensitive, .password, .credit-card, " +
        "#wayfinder-hud-root, #wayfinder-selection-btn, #wayfinder-selection-popover, #wayfinder-chat-root, .wayfinder-dom-marker"
      ).forEach(node => node.remove());

      let rawText = (clone.innerText || "").replace(/\s+/g, " ").trim();

      // PII Redaction: automatically sanitize emails, credit card numbers, SSNs, and API keys
      rawText = rawText
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL_REDACTED]")
        .replace(/\b(?:\d{4}[ -]?){3}\d{4}\b/g, "[CARD_REDACTED]")
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN_REDACTED]")
        .replace(/\b(?:sk-[a-zA-Z0-9_-]{20,}|bearer\s+[a-zA-Z0-9._~+/-]+=*)/gi, "[KEY_REDACTED]");

      condensedText = rawText.slice(0, 1500);
    }

    const relatedLinks = [];
    const seenHrefs = new Set();
    const linkKeywords = ["review", "spec", "compare", "price", "pricing", "feature", "manual", "doc", "alternative", "seller", "warranty", "return", "guide", "faq", "flight", "hotel", "stay", "book", "fare", "cancel", "policy"];

    document.querySelectorAll("a[href]").forEach((a) => {
      if (relatedLinks.length >= 6) return;
      const href = a.href;
      if (!href || href.startsWith("javascript:") || href.includes("#") || seenHrefs.has(href)) return;
      if (href === window.location.href) return;

      const text = (a.innerText || a.title || a.getAttribute("aria-label") || "").trim().toLowerCase();
      const hrefLower = href.toLowerCase();
      const matchesKeyword = linkKeywords.some(kw => text.includes(kw) || hrefLower.includes(kw));

      if (matchesKeyword && text.length > 2 && text.length < 60) {
        seenHrefs.add(href);
        relatedLinks.push({
          text: a.innerText.trim(),
          url: href,
          selector: generateSimpleSelector(a)
        });
      }
    });

    return { title, url, domain, metaDescription: metaDesc, headings, actionElements, condensedText, semanticEntity, productInfo, relatedLinks };
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

    // Critical Security Guard Rail: Auto-pause AI on login, password, and payment forms
    const privacyCheck = checkSensitivePageContext();
    if (privacyCheck.isSensitive && !force) {
      isAnalyzing = false;
      clearDomMarkers();

      chrome.runtime.sendMessage({
        type: "RECORD_SHIELDED_PAGE",
        payload: { reason: privacyCheck.reason }
      });

      const beaconEl = document.querySelector(".wayfinder-signal-beacon");
      if (beaconEl) {
        beaconEl.classList.add("wayfinder-beacon-shield");
        beaconEl.title = `Wayfinder Privacy Shield Active: ${privacyCheck.reason}`;
      }

      renderPrivacyShieldState(privacyCheck.reason);
      return;
    }

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

      lastPageAssistanceData = response;
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

    const entity = extractSemanticEntity();

    let categoryBadge = "🧭 Page Intel";
    let categoryClass = "wayfinder-entity-general";
    const category = entity?.category || "general";
    const inferredIntentLower = (guidance.inferredIntent || "").toLowerCase();

    if (category === "flight" || inferredIntentLower.includes("flight") || inferredIntentLower.includes("airline")) {
      categoryBadge = "✈️ Flight & Travel Intel";
      categoryClass = "wayfinder-entity-flight";
    } else if (category === "stay" || inferredIntentLower.includes("hotel") || inferredIntentLower.includes("stay") || inferredIntentLower.includes("lodging") || inferredIntentLower.includes("resort") || inferredIntentLower.includes("airbnb")) {
      categoryBadge = "🏡 Stay & Lodging Intel";
      categoryClass = "wayfinder-entity-stay";
    } else if (category === "shopping" || inferredIntentLower.includes("product") || inferredIntentLower.includes("price") || inferredIntentLower.includes("buy") || inferredIntentLower.includes("deal")) {
      categoryBadge = "🛍️ Product & Value Intel";
      categoryClass = "wayfinder-entity-shopping";
    } else if (category === "docs" || inferredIntentLower.includes("doc") || inferredIntentLower.includes("api") || inferredIntentLower.includes("code")) {
      categoryBadge = "💻 Tech & Documentation Intel";
      categoryClass = "wayfinder-entity-docs";
    }

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
      ${entity ? `
        <div class="wayfinder-product-banner ${categoryClass}">
          <div class="wayfinder-product-badge">${categoryBadge}</div>
          <div class="wayfinder-product-name">${escapeHtml(entity.name || "Identified Target")}</div>
          <div class="wayfinder-product-stats">
            ${entity.price ? `<span class="wayfinder-product-price">${escapeHtml(entity.price)}</span>` : ""}
            ${entity.rating ? `<span class="wayfinder-product-rating">⭐ ${escapeHtml(entity.rating)}</span>` : ""}
            ${entity.reviewsCount ? `<span class="wayfinder-product-reviews">(${escapeHtml(entity.reviewsCount)})</span>` : ""}
            ${entity.dates ? `<span class="wayfinder-product-dates">📅 ${escapeHtml(entity.dates)}</span>` : ""}
            ${entity.location ? `<span class="wayfinder-product-location">📍 ${escapeHtml(entity.location)}</span>` : ""}
          </div>
          <button class="wayfinder-ecom-cta-btn" id="wayfinder-product-deals-btn">
            🔍 Copilot Analysis, Gotchas & Alternatives (⌘I)
          </button>
        </div>
      ` : ""}

      <div class="wayfinder-summary-box">
        <div class="wayfinder-meta-tag">Goal: ${escapeHtml(guidance.pageGoal || "Navigation")}</div>
        ${guidance.inferredIntent ? `<div class="wayfinder-intent-subtag">🎯 Inferred Intent: ${escapeHtml(guidance.inferredIntent)}</div>` : ""}
        <p class="wayfinder-summary-text">${escapeHtml(guidance.summary || "Page scanned.")}</p>
      </div>

      ${guidance.copilotThinking ? `
        <div class="wayfinder-intent-box">
          <div class="wayfinder-intent-header">
            <span class="wayfinder-intent-icon">🧠</span>
            <strong>Copilot Cognitive Reasoning ("How I Can Help")</strong>
          </div>
          <p class="wayfinder-intent-text">${escapeHtml(guidance.copilotThinking)}</p>
        </div>
      ` : ""}

      ${((guidance.proactiveInsights && guidance.proactiveInsights.length > 0) || (guidance.marketInsights && guidance.marketInsights.length > 0)) ? `
        <div class="wayfinder-section">
          <div class="wayfinder-section-title">⚡ Autonomous Proactive Advice & Gotchas</div>
          <ul class="wayfinder-intel-list">
            ${(guidance.proactiveInsights || guidance.marketInsights || []).map(m => `<li><span class="wayfinder-bullet">💡</span> <span>${escapeHtml(m)}</span></li>`).join("")}
          </ul>
        </div>
      ` : ""}

      ${(lastPageAssistanceData?.research?.peekedLinks && lastPageAssistanceData.research.peekedLinks.length > 0) ? `
        <div class="wayfinder-section">
          <div class="wayfinder-section-title">🔗 Background Peeked Links</div>
          <div class="wayfinder-peeked-links-list">
            ${lastPageAssistanceData.research.peekedLinks.map(l => `
              <div class="wayfinder-peeked-link-item">
                <a href="${escapeHtml(l.url)}" target="_blank" class="wayfinder-peeked-title">${escapeHtml(l.title)} ↗</a>
                <p class="wayfinder-peeked-desc">${escapeHtml(l.description)}</p>
              </div>
            `).join("")}
          </div>
        </div>
      ` : ""}

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

      ${lastPageAssistanceData?.prompts ? `
        <details class="wayfinder-prompt-details">
          <summary class="wayfinder-prompt-toggle">👁️ View Active AI Prompt & Raw Data</summary>
          <div class="wayfinder-prompt-content">
            <div class="wayfinder-prompt-label">SYSTEM PROMPT:</div>
            <pre class="wayfinder-prompt-pre">${escapeHtml(lastPageAssistanceData.prompts.systemPrompt || "")}</pre>
            <div class="wayfinder-prompt-label">USER PROMPT SENT TO AI:</div>
            <pre class="wayfinder-prompt-pre">${escapeHtml(lastPageAssistanceData.prompts.userPrompt || "")}</pre>
            <div class="wayfinder-prompt-label">RAW JSON RECEIVED:</div>
            <pre class="wayfinder-prompt-pre">${escapeHtml(JSON.stringify(guidance, null, 2))}</pre>
          </div>
        </details>
      ` : ""}

      <div class="wayfinder-footer-provider" style="display: flex; justify-content: space-between; align-items: center;">
        <span>Powered by <strong>${escapeHtml(provider)}</strong> (${escapeHtml(model)})</span>
        <button class="wayfinder-copy-logs-btn" id="wayfinder-copy-logs-hud-btn" style="background: rgba(255, 255, 255, 0.15); color: #c4b5fd; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 4px; padding: 2px 7px; font-size: 10px; cursor: pointer;">📋 Copy Logs</button>
      </div>
    `;

    const hudCopyBtn = cardBody.querySelector("#wayfinder-copy-logs-hud-btn");
    if (hudCopyBtn) {
      hudCopyBtn.addEventListener("click", () => copyDiagnosticLogs());
    }

    const dealsBtn = cardBody.querySelector("#wayfinder-product-deals-btn");
    if (dealsBtn && entity) {
      dealsBtn.addEventListener("click", () => {
        const catPrompt = entity.category === "flight" ? "What hidden baggage fees, layover risks, or cheaper alternative dates should I watch out for?" :
                          entity.category === "stay" ? "What hidden cleaning fees, cancellation deadlines, or neighborhood safety gotchas should I know?" :
                          "Can I find this cheaper elsewhere, or what are historical price trends and good alternatives?";
        toggleChatbox(true, `${entity.category.toUpperCase()}: ${entity.name} (${entity.price || ''})`);
        sendChatMessage(catPrompt);
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
   * 5. IN-PAGE DOM MARKERS: Purple beacon markers & direct purple boxes
   * Injected into a top-level overlay layer (#wayfinder-markers-layer) directly on document.body.
   * This completely eliminates clipping from overflow:hidden, contain:paint, or button stacking contexts.
   */
  function getOrCreateMarkersLayer() {
    let layer = document.getElementById("wayfinder-markers-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "wayfinder-markers-layer";
      layer.className = "wayfinder-markers-layer";
      (document.body || document.documentElement).appendChild(layer);
    }
    return layer;
  }

  function clearDomMarkers() {
    const layer = document.getElementById("wayfinder-markers-layer");
    if (layer) {
      layer.innerHTML = "";
    }
    document.querySelectorAll(".wayfinder-dom-marker").forEach(el => el.remove());
  }

  function positionSingleMarker(marker, target, style) {
    if (!target || !target.isConnected) {
      marker.style.display = "none";
      return;
    }
    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && target.offsetParent === null) {
      marker.style.display = "none";
      return;
    }

    marker.style.display = "inline-flex";
    marker.style.position = "absolute";

    const pageScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const pageScrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;

    if (style === "badge") {
      let top = pageScrollY + rect.top - 28;
      let left = pageScrollX + Math.max(0, rect.left);
      if (rect.top < 34) {
        top = pageScrollY + rect.bottom + 4;
        marker.classList.add("wayfinder-callout-below");
      } else {
        marker.classList.remove("wayfinder-callout-below");
      }
      marker.style.top = `${Math.round(top)}px`;
      marker.style.left = `${Math.round(left)}px`;
    } else {
      let top = pageScrollY + rect.top - 6;
      let left = pageScrollX + rect.right - 10;
      marker.style.top = `${Math.round(top)}px`;
      marker.style.left = `${Math.round(left)}px`;
    }
  }

  let positionUpdateTimer = null;
  function updateAllMarkerPositions() {
    const layer = document.getElementById("wayfinder-markers-layer");
    if (!layer) return;
    const markers = layer.querySelectorAll(".wayfinder-dom-marker");
    markers.forEach(marker => {
      const target = marker._targetElement;
      const style = marker.getAttribute("data-marker-style") || currentMarkerStyle;
      positionSingleMarker(marker, target, style);
    });
  }

  function throttledUpdateMarkerPositions() {
    if (positionUpdateTimer) return;
    positionUpdateTimer = requestAnimationFrame(() => {
      positionUpdateTimer = null;
      updateAllMarkerPositions();
    });
  }

  window.addEventListener("scroll", throttledUpdateMarkerPositions, { passive: true });
  window.addEventListener("resize", throttledUpdateMarkerPositions, { passive: true });

  // Fallback heuristic markers so interesting items are highlighted immediately
  function getHeuristicDomCandidates() {
    const candidates = [];
    const seen = new Set();

    // 1. Universal Semantic High-Value Elements (Price/Fare, Actions, Reviews, Policies, Dates)
    const universalRules = [
      {
        sel: "[class*='price'], [class*='fare'], [class*='rate'], [itemprop='price'], .priceToPay, .apexPriceToPay, #priceblock_ourprice, #priceblock_dealprice, #price, [data-testid*='price']",
        note: "Price / Fare: Check for hidden fees, price changes, or cheaper alternatives (⌘I)"
      },
      {
        sel: "button[type='submit'], [class*='book'], [class*='reserve'], [class*='add-to-cart'], [class*='buy'], [id*='book'], [id*='cart'], [id*='buy'], [data-testid*='book'], [data-testid*='buy'], #add-to-cart-button, #buy-now-button",
        note: "Key Action: Compare terms, cancellation policy, or return window before confirming"
      },
      {
        sel: "[class*='review'], [class*='rating'], [id*='review'], [id*='rating'], [data-hook='total-review-count'], [data-testid*='review'], #averageCustomerReviews",
        note: "Customer Feedback: Copilot (⌘I) can summarize sentiment, defect patterns & gotchas"
      },
      {
        sel: "[class*='amenit'], [class*='policy'], [class*='cancel'], [class*='baggage'], [class*='spec'], [class*='feature'], [id*='policy'], [id*='amenit'], #feature-bullets",
        note: "Policies & Details: Check baggage allowance, cancellation deadlines, or prerequisites"
      },
      {
        sel: "[class*='date'], [class*='calendar'], [class*='schedule'], [class*='depart'], [class*='checkin'], [data-testid*='date']",
        note: "Timeline / Dates: Verify flexibility, layover times, or off-peak savings"
      }
    ];

    for (const rule of universalRules) {
      try {
        const elements = Array.from(document.querySelectorAll(rule.sel));
        for (let el of elements) {
          if (!el || isSensitiveElement(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0 && el.offsetParent === null) continue;

          // If target is inside a button container or wrapper, attach to the outer visible element
          const outerBtn = el.closest(".a-button, button, [role='button']");
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
          if (!el || isSensitiveElement(el)) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0 && el.offsetParent === null) continue;

          const outerBtn = el.closest(".a-button, button, [role='button']");
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
    if (checkSensitivePageContext().isSensitive) {
      clearDomMarkers();
      return;
    }
    WayfinderLogger.log("Scanning DOM for candidates...");
    const candidates = getHeuristicDomCandidates();
    WayfinderLogger.log(`Found ${candidates.length} DOM candidates to mark.`);
    renderDomMarkers(candidates);
  }

  function renderDomMarkers(items) {
    clearDomMarkers();
    if (checkSensitivePageContext().isSensitive) {
      return;
    }

    let effectiveItems = (items && items.length > 0) ? [...items] : null;
    if (!effectiveItems || effectiveItems.length === 0) {
      WayfinderLogger.log("No specific guidance items provided, falling back to heuristic candidates...");
      effectiveItems = getHeuristicDomCandidates();
    }

    // On high-interest pages (flights, stays, products), if fewer than 3 items, include key candidates
    const semanticEntity = extractSemanticEntity();
    if (semanticEntity && effectiveItems.length < 3) {
      const candidates = getHeuristicDomCandidates();
      effectiveItems = [...effectiveItems, ...candidates];
    }

    if (!effectiveItems || !effectiveItems.length) {
      WayfinderLogger.warn("No DOM elements found to render markers.");
      return;
    }

    currentGuidanceItems = effectiveItems;
    const layer = getOrCreateMarkersLayer();
    let attachedCount = 0;
    const seenTargets = new Set();

    effectiveItems.forEach((item) => {
      let target = item.element || null;

      if (!target && item.selector) {
        try { target = document.querySelector(item.selector); } catch (e) {}
      }

      const hint = item.targetHint || item.textHint || item.label;
      if (!target && hint) {
        const candidates = Array.from(document.querySelectorAll("a, button, h1, h2, h3, nav a, header a, form input[type='submit'], [role='button'], .price, #productTitle"));
        target = candidates.find(el => {
          const text = (el.innerText || el.value || "").toLowerCase();
          return text.includes(hint.toLowerCase()) && !el.closest("#wayfinder-hud-root") && !el.closest("#wayfinder-chat-root");
        });
      }

      if (target) {
        const outerBtn = target.closest(".a-button");
        if (outerBtn) target = outerBtn;
      }

      if (!target || seenTargets.has(target)) return;
      if (target.closest("#wayfinder-hud-root") || target.closest("#wayfinder-chat-root")) return;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && target.offsetParent === null) return;

      seenTargets.add(target);

      const marker = document.createElement("div");
      marker._targetElement = target;
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

      positionSingleMarker(marker, target, currentMarkerStyle);
      layer.appendChild(marker);
      attachedCount++;
      WayfinderLogger.log(`Attached marker #${attachedCount} to top-level layer for <${target.tagName.toLowerCase()}>`, noteText);
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
            selectedText: sanitizeSensitiveText(text),
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

    const entity = extractSemanticEntity();
    let bannerHtml = "";
    if (entity) {
      const catBadge = entity.category === "flight" ? "✈️ Flight & Travel Intel" :
                       entity.category === "stay" ? "🏡 Stay & Lodging Intel" :
                       entity.category === "shopping" ? "🛍️ Product & Value Intel" :
                       entity.category === "docs" ? "💻 Tech & Documentation Intel" : "🧭 Page Intel";
      const catClass = `wayfinder-entity-${entity.category || 'general'}`;
      bannerHtml = `
        <div class="wayfinder-product-banner ${catClass}">
          <div class="wayfinder-product-badge">${catBadge}</div>
          <div class="wayfinder-product-name">${escapeHtml(entity.name || "Identified Target")}</div>
          <div class="wayfinder-product-stats">
            ${entity.price ? `<span class="wayfinder-product-price">${escapeHtml(entity.price)}</span>` : ""}
            ${entity.rating ? `<span class="wayfinder-product-rating">⭐ ${escapeHtml(entity.rating)}</span>` : ""}
            ${entity.dates ? `<span class="wayfinder-product-dates">📅 ${escapeHtml(entity.dates)}</span>` : ""}
            ${entity.location ? `<span class="wayfinder-product-location">📍 ${escapeHtml(entity.location)}</span>` : ""}
          </div>
          <button class="wayfinder-ecom-cta-btn" id="wayfinder-product-deals-btn">
            🔍 Copilot Analysis, Gotchas & Alternatives (⌘I)
          </button>
        </div>
      `;
    }

    cardBody.innerHTML = `
      ${bannerHtml}
      <div class="wayfinder-error-state">
        <div class="wayfinder-error-icon">⚠️</div>
        <div class="wayfinder-error-title">AI Guidance Notice</div>
        <div class="wayfinder-error-msg">${escapeHtml(errorMessage)}</div>
        <p class="wayfinder-error-help">Check your API key in the extension popup or verify provider settings.</p>
        ${lastPageAssistanceData?.prompts?.userPrompt ? `
          <details class="wayfinder-prompt-details">
            <summary class="wayfinder-prompt-toggle">👁️ View Active AI Prompt Sent</summary>
            <div class="wayfinder-prompt-content">
              <div class="wayfinder-prompt-label">SYSTEM PROMPT:</div>
              <pre class="wayfinder-prompt-pre">${escapeHtml(lastPageAssistanceData.prompts.systemPrompt || "")}</pre>
              <div class="wayfinder-prompt-label">USER PROMPT:</div>
              <pre class="wayfinder-prompt-pre">${escapeHtml(lastPageAssistanceData.prompts.userPrompt || "")}</pre>
            </div>
          </details>
        ` : ""}
        <button class="wayfinder-copy-logs-btn" id="wayfinder-copy-logs-err-btn" style="margin-top: 10px; background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; border-radius: 6px; padding: 6px 12px; font-weight: 600; cursor: pointer;">
          📋 Copy Diagnostic Logs
        </button>
      </div>
    `;

    const dealsBtn = cardBody.querySelector("#wayfinder-product-deals-btn");
    if (dealsBtn && entity) {
      dealsBtn.addEventListener("click", () => {
        const catPrompt = entity.category === "flight" ? "What hidden baggage fees, layover risks, or cheaper alternative dates should I watch out for?" :
                          entity.category === "stay" ? "What hidden cleaning fees, cancellation deadlines, or neighborhood safety gotchas should I know?" :
                          "Can I find this cheaper elsewhere, or what are historical price trends and good alternatives?";
        toggleChatbox(true, `${entity.category.toUpperCase()}: ${entity.name} (${entity.price || ''})`);
        sendChatMessage(catPrompt);
      });
    }

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
        const entity = extractSemanticEntity();
        if (entity) {
          const catLabel = entity.category === "flight" ? "Flight" :
                           entity.category === "stay" ? "Stay" :
                           entity.category === "shopping" ? "Product" :
                           entity.category === "docs" ? "Docs" : "Entity";
          setChatContext(`${catLabel}: ${entity.name || "Target"} ${entity.price ? '(' + entity.price + ')' : ''}`);
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

    const entity = extractSemanticEntity();
    let prompts = [];

    if (entity?.category === "flight") {
      prompts = [
        "✈️ Hidden baggage & seat fees?",
        "📉 Layover risks & flight traps",
        "🔄 Cheaper alternative dates?",
        "⭐ Airline reliability & reviews"
      ];
    } else if (entity?.category === "stay") {
      prompts = [
        "🏡 Hidden cleaning & service fees?",
        "📍 Neighborhood safety & transit?",
        "📅 Cancellation policy gotchas?",
        "⭐ Host review warning signs"
      ];
    } else if (entity?.category === "shopping") {
      prompts = [
        "🔍 Cheaper elsewhere?",
        "⭐ Review sentiment & flaws",
        "⚖️ Alternative products",
        "💵 Is this price a deal?"
      ];
    } else if (entity?.category === "docs") {
      prompts = [
        "⚠️ Breaking changes & versions",
        "📦 Prerequisites & setup steps",
        "💡 Explain code sample",
        "🔍 Alternatives & trade-offs"
      ];
    } else {
      prompts = [
        "📋 Summarize page",
        "🧭 What should I click next?",
        "💡 Explain key terms & catches",
        "⚡ Proactive recommendations"
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
    const rawQuery = (queryText || (input ? input.value : "")).trim();
    if (!rawQuery) return;
    const query = sanitizeSensitiveText(rawQuery);

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
          selectedText: sanitizeSensitiveText(chatContext),
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
    if (!checkSensitivePageContext().isSensitive) {
      applyHeuristicDomMarkers();
    }
  }, 400);

  // 2. Main Page Analysis at 1000ms (Exactly 1 network request per page load/refresh)
  setTimeout(() => {
    runPageAnalysis();
  }, 1000);

  // 3. Post-hydration resilience check at 2800ms
  setTimeout(() => {
    if (checkSensitivePageContext().isSensitive) return;
    const activeMarkers = document.querySelectorAll(".wayfinder-dom-marker").length;
    if (activeMarkers < 2) {
      WayfinderLogger.log("Post-hydration resilience check: refreshing on-page markers...");
      applyHeuristicDomMarkers();
    }
  }, 2800);

})();
