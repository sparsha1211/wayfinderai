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

  let lastAnalysisTime = 0;
  const RATE_LIMIT_MS = 6000; // minimum 6 seconds between automatic AI page re-analyses
  let domChangeDebounceTimer = null;
  let lastUrl = window.location.href;

  /**
   * 1. Extract context from DOM
   */
  function extractPageContext() {
    const title = document.title || "";
    const url = window.location.href;
    const domain = window.location.hostname;

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
      clone.querySelectorAll("script, style, noscript, svg, nav, footer, header, #wayfinder-hud-root, #wayfinder-selection-btn, #wayfinder-selection-popover, .wayfinder-dom-marker").forEach(node => node.remove());
      condensedText = (clone.innerText || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500);
    }

    return { title, url, domain, metaDescription: metaDesc, headings, actionElements, condensedText };
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
   * 3. Run Page Analysis
   */
  async function runPageAnalysis(force = false) {
    if (isAnalyzing && !force) return;

    const now = Date.now();
    if (!force && (now - lastAnalysisTime < RATE_LIMIT_MS)) {
      return; // Rate limited, skip redundant call
    }

    const { wayfinder_settings: settings = {} } = await chrome.storage.local.get("wayfinder_settings");
    if (settings.enabled === false) {
      if (beaconContainer) beaconContainer.style.display = "none";
      clearDomMarkers();
      return;
    } else {
      if (beaconContainer) beaconContainer.style.display = "block";
    }

    injectBeaconHUD();
    isAnalyzing = true;
    lastAnalysisTime = Date.now();

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
  function applyHeuristicDomMarkers() {
    if (document.querySelector(".wayfinder-dom-marker")) return; // already marked

    const candidates = Array.from(document.querySelectorAll("button, a.btn, a.button, input[type='submit'], header nav a, main h1, [role='button']"))
      .filter(el => {
        if (el.closest("#wayfinder-hud-root") || el.closest("#wayfinder-selection-popover")) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 20 && rect.height > 15;
      })
      .slice(0, 4);

    const heuristicItems = candidates.map(el => ({
      element: el,
      note: `Interesting action: "${(el.innerText || el.value || el.title || 'Page Action').trim().slice(0, 30)}"`
    }));

    renderDomMarkers(heuristicItems);
  }

  function renderDomMarkers(items) {
    clearDomMarkers();
    if (!items || !items.length) return;

    items.forEach((item) => {
      let target = item.element || null;

      if (!target && item.selector) {
        try { target = document.querySelector(item.selector); } catch (e) {}
      }

      const hint = item.targetHint || item.textHint || item.label;
      if (!target && hint) {
        const candidates = Array.from(document.querySelectorAll("a, button, h1, h2, h3, nav a, header a, form input[type='submit'], [role='button']"));
        target = candidates.find(el => {
          const text = (el.innerText || el.value || "").toLowerCase();
          return text.includes(hint.toLowerCase()) && !el.closest("#wayfinder-hud-root");
        });
      }

      if (target && !target.closest("#wayfinder-hud-root") && !target.querySelector(".wayfinder-dom-marker")) {
        const marker = document.createElement("div");
        marker.className = "wayfinder-dom-marker";
        marker.title = "Wayfinder Insight (Click or hover for details)";
        
        const noteText = item.note || item.explanation || item.label || "Key navigation item";
        
        marker.innerHTML = `
          <div class="wayfinder-marker-dot"></div>
          <div class="wayfinder-marker-popover">
            <strong>Wayfinder Insight</strong>
            <span>${escapeHtml(noteText)}</span>
          </div>
        `;

        // Click on marker opens/toggles popover and prevents propagating to link
        marker.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          const popover = marker.querySelector(".wayfinder-marker-popover");
          if (popover) {
            popover.classList.toggle("wayfinder-popover-pinned");
          }
        });

        // Ensure target is relative so marker positions neatly
        const currentPos = window.getComputedStyle(target).position;
        if (currentPos === "static") {
          target.style.position = "relative";
        }

        target.appendChild(marker);
      }
    });
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
            <div class="wayfinder-footer-provider">
              <span>Model: <strong>${escapeHtml(res.provider)}</strong> (${escapeHtml(res.model)})</span>
            </div>
          `;
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
    const cardBody = document.getElementById("wayfinder-card-body");
    if (!cardBody) return;
    cardBody.innerHTML = `
      <div class="wayfinder-error-state">
        <div class="wayfinder-error-icon">⚠️</div>
        <div class="wayfinder-error-title">Notice</div>
        <div class="wayfinder-error-msg">${escapeHtml(errorMessage)}</div>
        <p class="wayfinder-error-help">Click the extension icon in your Chrome toolbar to configure OpenAI, Claude, OpenRouter, or ensure local Ollama is active.</p>
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
          applyHeuristicDomMarkers();
        }
      }
    }
  });

  initTextSelectionCopilot();

  // Watch for SPA client-side route changes (URL changes without full page reload)
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      runPageAnalysis(true);
    }
  }, 1000);

  // Watch for major DOM content changes (with debounce and rate limit)
  const domObserver = new MutationObserver((mutations) => {
    let significantChange = false;
    for (const m of mutations) {
      if (m.target && (m.target.closest?.("#wayfinder-hud-root") || m.target.closest?.("#wayfinder-selection-popover") || m.target.classList?.contains?.("wayfinder-dom-marker"))) {
        continue;
      }
      if (m.addedNodes.length > 0 || m.removedNodes.length > 0) {
        significantChange = true;
        break;
      }
    }

    if (significantChange) {
      clearTimeout(domChangeDebounceTimer);
      domChangeDebounceTimer = setTimeout(() => {
        runPageAnalysis(false); // will honor RATE_LIMIT_MS
      }, 2500); // Debounce by 2.5s to let dynamic rendering settle
    }
  });

  if (document.body) {
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(() => {
    runPageAnalysis();
  }, 1000);

})();
