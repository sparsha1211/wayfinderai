/**
 * Wayfinder AI Popup UI Controller
 * Handles provider configuration, metrics monitoring, developer debug inspector, DOM markers, and habit controls.
 */

import { PROVIDERS } from "../services/aiProviders.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Core UI elements
  const masterToggle = document.getElementById("masterToggle");
  const providerSelect = document.getElementById("providerSelect");
  const licenseGroup = document.getElementById("licenseGroup");
  const licenseKeyInput = document.getElementById("licenseKeyInput");
  const licenseTierBadge = document.getElementById("licenseTierBadge");
  const getTrialBtn = document.getElementById("getTrialBtn");
  const apiKeyGroup = document.getElementById("apiKeyGroup");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const apiKeyHint = document.getElementById("apiKeyHint");
  const toggleKeyVisibility = document.getElementById("toggleKeyVisibility");
  const modelSelect = document.getElementById("modelSelect");
  const endpointInput = document.getElementById("endpointInput");
  const endpointHint = document.getElementById("endpointHint");
  const domMarkersToggle = document.getElementById("domMarkersToggle");
  const markerStyleSelect = document.getElementById("markerStyleSelect");
  const learnPatternsToggle = document.getElementById("learnPatternsToggle");
  const debugModeToggle = document.getElementById("debugModeToggle");
  const devTabBtn = document.getElementById("devTabBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const statusToast = document.getElementById("statusToast");
  const statusText = document.getElementById("statusText");
  const indicatorDot = document.querySelector(".indicator-dot");

  // Metrics elements
  const totalCallsMetric = document.getElementById("totalCallsMetric");
  const totalTokensMetric = document.getElementById("totalTokensMetric");
  const promptTokensMetric = document.getElementById("promptTokensMetric");
  const completionTokensMetric = document.getElementById("completionTokensMetric");
  const lastCallMetric = document.getElementById("lastCallMetric");
  const providerBreakdownList = document.getElementById("providerBreakdownList");
  const resetMetricsBtn = document.getElementById("resetMetricsBtn");

  // Debug elements
  const debugLogsContainer = document.getElementById("debugLogsContainer");
  const refreshDebugLogsBtn = document.getElementById("refreshDebugLogsBtn");
  const clearDebugLogsBtn = document.getElementById("clearDebugLogsBtn");

  // Tab Switching
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.getAttribute("data-tab"));
      if (target) target.classList.add("active");

      if (btn.getAttribute("data-tab") === "tab-metrics") {
        loadMetrics();
      }
      if (btn.getAttribute("data-tab") === "tab-memory") {
        loadMemoryTab();
      }
      if (btn.getAttribute("data-tab") === "tab-debug") {
        loadDebugLogs();
      }
    });
  });

  // Always load initial metrics
  loadMetrics();

  // Auto-refresh active tab every 2 seconds
  setInterval(() => {
    const activeTab = document.querySelector(".tab-btn.active");
    if (!activeTab) return;
    const tabId = activeTab.getAttribute("data-tab");
    if (tabId === "tab-metrics") {
      loadMetrics();
    } else if (tabId === "tab-debug") {
      loadDebugLogs();
    }
  }, 2500);

  // Toggle API key reveal
  toggleKeyVisibility.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleKeyVisibility.textContent = "🙈";
    } else {
      apiKeyInput.type = "password";
      toggleKeyVisibility.textContent = "👁️";
    }
  });

  // Load existing settings
  const { wayfinder_settings: settings = {} } = await chrome.storage.local.get("wayfinder_settings");

  const isEnabled = settings.enabled !== false;
  masterToggle.checked = isEnabled;
  updateStatusDisplay(isEnabled);

  domMarkersToggle.checked = settings.domMarkersEnabled !== false;
  if (markerStyleSelect) {
    markerStyleSelect.value = settings.markerStyle || "dot";
  }
  learnPatternsToggle.checked = settings.learnPatterns !== false;

  // Debug mode toggle state
  const isDebug = !!settings.debugMode;
  debugModeToggle.checked = isDebug;
  devTabBtn.style.display = isDebug ? "block" : "none";

  const activeProvider = settings.activeProvider || "ollama";
  providerSelect.value = activeProvider;

  updateProviderUI(activeProvider, settings);

  const testConnectionBtn = document.getElementById("testConnectionBtn");
  const testConnectionStatus = document.getElementById("testConnectionStatus");

  // Switch Provider dropdown listener
  providerSelect.addEventListener("change", (e) => {
    const selected = e.target.value;
    updateProviderUI(selected, settings);
  });

  // Live toggle for Marker Style
  if (markerStyleSelect) {
    markerStyleSelect.addEventListener("change", async (e) => {
      const curr = await chrome.storage.local.get("wayfinder_settings");
      const newSettings = curr.wayfinder_settings || {};
      newSettings.markerStyle = e.target.value;
      await chrome.storage.local.set({ wayfinder_settings: newSettings });
      showToast(`Marker style: ${e.target.value === "badge" ? "Direct Purple Boxes" : "Purple Dots"}`);
    });
  }

  // Live toggle for Developer Debug Mode
  debugModeToggle.addEventListener("change", async (e) => {
    const isDev = e.target.checked;
    devTabBtn.style.display = isDev ? "block" : "none";
    if (isDev) {
      showToast("🛠️ Developer Debug Mode Enabled! Debug tab unlocked.");
    }
  });

  // Test Connection Button Listener
  testConnectionBtn.addEventListener("click", async () => {
    const providerId = providerSelect.value;
    const apiKey = providerId === "wayfinder_cloud" ? licenseKeyInput.value.trim() : apiKeyInput.value.trim();
    const model = modelSelect.value.trim();
    const endpoint = endpointInput.value.trim();

    testConnectionStatus.className = "test-conn-status status-loading";
    testConnectionStatus.textContent = "⏳ Testing...";
    testConnectionBtn.disabled = true;

    chrome.runtime.sendMessage({
      type: "TEST_PROVIDER_CONNECTION",
      payload: { providerId, apiKey, model, endpoint }
    }, async (res) => {
      testConnectionBtn.disabled = false;
      if (res && res.success) {
        testConnectionStatus.className = "test-conn-status status-ok";
        testConnectionStatus.textContent = "✓ Connected successfully!";
        showToast(`Connected to ${PROVIDERS[providerId]?.name || providerId}! Auto-saved.`);
        
        // Auto-save verified settings immediately so user doesn't have to manually click Save Preferences
        const curr = await chrome.storage.local.get("wayfinder_settings");
        const newSettings = curr.wayfinder_settings || { apiKeys: {}, customEndpoints: {}, selectedModels: {} };
        newSettings.activeProvider = providerId;
        newSettings.apiKeys = newSettings.apiKeys || {};
        newSettings.selectedModels = newSettings.selectedModels || {};
        newSettings.customEndpoints = newSettings.customEndpoints || {};
        if (providerId === "wayfinder_cloud") {
          newSettings.licenseKey = apiKey;
          newSettings.apiKeys.wayfinder_cloud = apiKey;
        } else if (PROVIDERS[providerId]?.requiresKey && apiKey) {
          newSettings.apiKeys[providerId] = apiKey;
        }
        if (model) {
          newSettings.selectedModels[providerId] = model;
        }
        if (endpoint) {
          newSettings.customEndpoints[providerId] = endpoint;
        }
        await chrome.storage.local.set({ wayfinder_settings: newSettings });

        loadMetrics();
      } else {
        testConnectionStatus.className = "test-conn-status status-err";
        const err = res?.error || "Connection failed";
        testConnectionStatus.textContent = `✗ ${err.slice(0, 32)}...`;
        testConnectionStatus.title = err;
        showToast(`Error: ${err.slice(0, 40)}`);
      }
    });
  });

  // Master Toggle listener
  masterToggle.addEventListener("change", async (e) => {
    const enabled = e.target.checked;
    updateStatusDisplay(enabled);
    const curr = await chrome.storage.local.get("wayfinder_settings");
    const updated = { ...(curr.wayfinder_settings || {}), enabled };
    await chrome.storage.local.set({ wayfinder_settings: updated });
    showToast(enabled ? "Wayfinder AI is now Enabled" : "Wayfinder AI is now Paused");
  });

  // Save Settings Form
  saveSettingsBtn.addEventListener("click", async () => {
    const provider = providerSelect.value;
    const key = apiKeyInput.value.trim();
    const model = modelSelect.value.trim();
    const endpoint = endpointInput.value.trim();
    const domMarkersEnabled = domMarkersToggle.checked;
    const learnPatterns = learnPatternsToggle.checked;
    const debugMode = debugModeToggle.checked;

    const curr = await chrome.storage.local.get("wayfinder_settings");
    const newSettings = curr.wayfinder_settings || { apiKeys: {}, customEndpoints: {}, selectedModels: {} };

    newSettings.activeProvider = provider;
    newSettings.domMarkersEnabled = domMarkersEnabled;
    newSettings.markerStyle = markerStyleSelect ? markerStyleSelect.value : "dot";
    newSettings.learnPatterns = learnPatterns;
    newSettings.debugMode = debugMode;
    newSettings.apiKeys = newSettings.apiKeys || {};
    newSettings.customEndpoints = newSettings.customEndpoints || {};
    newSettings.selectedModels = newSettings.selectedModels || {};

    if (provider === "wayfinder_cloud") {
      newSettings.licenseKey = licenseKeyInput.value.trim();
      newSettings.apiKeys.wayfinder_cloud = licenseKeyInput.value.trim();
    } else if (PROVIDERS[provider]?.requiresKey) {
      newSettings.apiKeys[provider] = key;
    }
    if (model) {
      newSettings.selectedModels[provider] = model;
    }
    if (endpoint) {
      newSettings.customEndpoints[provider] = endpoint;
    }

    await chrome.storage.local.set({ wayfinder_settings: newSettings });
    devTabBtn.style.display = debugMode ? "block" : "none";
    showToast("Preferences & AI settings saved!");
  });

  // Clear learning data
  clearHistoryBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, (res) => {
      if (res?.success) {
        showToast("Learned history and habits reset.");
      }
    });
  });

  // Copy Diagnostics
  const copyDiagnosticsPopupBtn = document.getElementById("copyDiagnosticsPopupBtn");
  if (copyDiagnosticsPopupBtn) {
    copyDiagnosticsPopupBtn.addEventListener("click", async () => {
      let bgLogs = [];
      try {
        const res = await new Promise(resolve => chrome.runtime.sendMessage({ type: "GET_DEBUG_LOGS" }, resolve));
        if (res && res.logs) bgLogs = res.logs;
      } catch (e) {}

      const { wayfinder_settings: curSettings = {} } = await chrome.storage.local.get("wayfinder_settings");
      const activeProv = curSettings.activeProvider || "ollama";
      const rawKey = curSettings.apiKeys?.[activeProv] || "";
      const maskedKey = rawKey ? `${rawKey.slice(0, 7)}...${rawKey.slice(-5)}` : "None configured";

      const report = [
        "================ WAYFINDER AI DIAGNOSTIC REPORT ================",
        `Generated At: ${new Date().toISOString()}`,
        `Active Provider: ${activeProv}`,
        `Model: ${curSettings.selectedModels?.[activeProv] || "Default"}`,
        `API Key: ${maskedKey}`,
        `Endpoint: ${curSettings.customEndpoints?.[activeProv] || "Default"}`,
        `Marker Style: ${curSettings.markerStyle || "dot"}`,
        `Markers Enabled: ${curSettings.domMarkersEnabled !== false}`,
        `Master Extension Enabled: ${curSettings.enabled !== false}`,
        "",
        "--- RECENT BACKGROUND AI WORKER LOGS ---",
        bgLogs.slice(-5).map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.type} - Status: ${l.status}${l.error ? ` (Error: ${l.error})` : ''} - Provider: ${l.provider}`).join("\n") || "  (No background logs recorded)",
        "================================================================"
      ].join("\n");

      try {
        await navigator.clipboard.writeText(report);
        showToast("✓ Diagnostic logs copied to clipboard!");
      } catch (err) {
        console.log(report);
        alert("Logs output to console!");
      }
    });
  }

  // Reset metrics
  resetMetricsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RESET_METRICS" }, (res) => {
      if (res?.success) {
        showToast("Metrics counter reset to zero.");
        loadMetrics();
      }
    });
  });

  // Refresh & Clear Debug Logs
  refreshDebugLogsBtn.addEventListener("click", () => {
    loadDebugLogs();
    showToast("Debug logs refreshed.");
  });

  clearDebugLogsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_DEBUG_LOGS" }, () => {
      loadDebugLogs();
      showToast("Debug logs cleared.");
    });
  });

  function updateProviderUI(providerKey, currentSettings) {
    const provider = PROVIDERS[providerKey] || PROVIDERS.openai;

    if (providerKey === "wayfinder_cloud") {
      if (licenseGroup) licenseGroup.style.display = "block";
      if (apiKeyGroup) apiKeyGroup.style.display = "none";
      if (licenseKeyInput) {
        licenseKeyInput.value = currentSettings.licenseKey || currentSettings.apiKeys?.wayfinder_cloud || "";
      }
      endpointHint.textContent = "Wayfinder Cloud Server Gateway (Default: https://wayfinder-ai-gateway-production-038471e5.up.railway.app)";
    } else {
      if (licenseGroup) licenseGroup.style.display = "none";
      if (provider.requiresKey) {
        if (apiKeyGroup) apiKeyGroup.style.display = "block";
        if (apiKeyInput) apiKeyInput.value = currentSettings.apiKeys?.[providerKey] || "";
        if (apiKeyHint) apiKeyHint.textContent = `Required for ${provider.name}. Stored locally.`;
      } else {
        if (apiKeyGroup) apiKeyGroup.style.display = "none";
        if (apiKeyInput) apiKeyInput.value = "";
      }
    }

    modelSelect.value = currentSettings.selectedModels?.[providerKey] || provider.defaultModel;
    endpointInput.value = currentSettings.customEndpoints?.[providerKey] || provider.defaultEndpoint;

    if (providerKey === "ollama") {
      endpointHint.textContent = "Default: http://localhost:11434/api/chat. Set OLLAMA_ORIGINS='*' if blocked.";
    } else if (providerKey !== "wayfinder_cloud") {
      endpointHint.textContent = `Default REST endpoint for ${provider.name}.`;
    }
  }

  // Free trial button listener
  if (getTrialBtn) {
    getTrialBtn.addEventListener("click", async () => {
      const endpoint = endpointInput.value.trim() || "https://wayfinder-ai-gateway-production-038471e5.up.railway.app";
      try {
        const syncStorage = await chrome.storage.sync.get("wayfinder_device_id").catch(() => ({}));
        const localStorage = await chrome.storage.local.get("wayfinder_device_id");
        const deviceId = syncStorage?.wayfinder_device_id || localStorage?.wayfinder_device_id || "";

        const res = await fetch(`${endpoint.replace(/\/+$/, '')}/api/v1/auth/trial`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId })
        });
        const data = await res.json();
        if (data.success && data.licenseKey) {
          licenseKeyInput.value = data.licenseKey;
          if (licenseTierBadge) {
            licenseTierBadge.textContent = "Free (25/day)";
            licenseTierBadge.style.background = "#e0e7ff";
            licenseTierBadge.style.color = "#4338ca";
          }
          const curr = await chrome.storage.local.get("wayfinder_settings");
          const newSettings = curr.wayfinder_settings || {};
          newSettings.licenseKey = data.licenseKey;
          newSettings.activeProvider = "wayfinder_cloud";
          await chrome.storage.local.set({ wayfinder_settings: newSettings });
          showToast(data.reconnected ? "Welcome back! Free Tier restored (25 queries/day)." : "🎉 Free Tier activated! 25 queries per day, resets daily.");
        } else {
          showToast(`Error: ${data.error || "Could not activate trial"}`);
        }
      } catch (e) {
        showToast("Gateway offline. Start server with: npm run server");
      }
    });
  }

  // Lookup license by email listener
  const lookupLicenseBtn = document.getElementById("lookupLicenseBtn");
  if (lookupLicenseBtn) {
    lookupLicenseBtn.addEventListener("click", async () => {
      const email = prompt("Enter the email address you used at Stripe checkout:");
      if (!email || !email.trim()) return;
      try {
        const endpoint = endpointInput.value.trim() || "https://wayfinder-ai-gateway-production-038471e5.up.railway.app";
        const res = await fetch(`${endpoint.replace(/\/+$/, "")}/api/v1/auth/lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() })
        });
        const data = await res.json();
        if (data.success && data.licenseKey) {
          licenseKeyInput.value = data.licenseKey;
          if (licenseTierBadge) {
            licenseTierBadge.textContent = "Pro Active";
            licenseTierBadge.style.background = "#dcfce7";
            licenseTierBadge.style.color = "#15803d";
          }
          const curr = await chrome.storage.local.get("wayfinder_settings");
          const newSettings = curr.wayfinder_settings || {};
          newSettings.licenseKey = data.licenseKey;
          newSettings.activeProvider = "wayfinder_cloud";
          await chrome.storage.local.set({ wayfinder_settings: newSettings });
          showToast(`🎉 Subscription found! Pro key ${data.licenseKey.slice(0, 11)}... activated.`);
        } else {
          alert(`No active subscription found for "${email}". Please verify the email used at checkout.`);
        }
      } catch (err) {
        showToast(`Lookup failed: ${err.message}`);
      }
    });
  }

  function updateStatusDisplay(enabled) {
    if (enabled) {
      statusText.textContent = "Wayfinder AI Active";
      indicatorDot.classList.add("active");
    } else {
      statusText.textContent = "Wayfinder AI Paused";
      indicatorDot.classList.remove("active");
    }
  }

  function showToast(message) {
    statusToast.textContent = message;
    statusToast.style.display = "block";
    setTimeout(() => {
      statusToast.style.display = "none";
    }, 2800);
  }

  // Load and render AI call & token metrics
  async function loadMetrics() {
    const { wayfinder_metrics: metrics = {} } = await chrome.storage.local.get("wayfinder_metrics");

    totalCallsMetric.textContent = (metrics.totalCalls || 0).toLocaleString();
    totalTokensMetric.textContent = (metrics.totalTokens || 0).toLocaleString();
    promptTokensMetric.textContent = (metrics.promptTokens || 0).toLocaleString();
    completionTokensMetric.textContent = (metrics.completionTokens || 0).toLocaleString();

    // Estimated Cost
    const cost = metrics.estimatedCostUsd || 0;
    const costEl = document.getElementById("estimatedCostMetric");
    if (costEl) {
      costEl.textContent = cost > 0 && cost < 0.01
        ? `$${cost.toFixed(4)}`
        : `$${cost.toFixed(2)}`;
    }

    // Shielded Pages Counter
    const shieldEl = document.getElementById("sensitiveShieldedMetric");
    if (shieldEl) {
      shieldEl.textContent = (metrics.sensitivePagesShielded || 0).toLocaleString();
    }

    // Average Latency
    const avgLatencyEl = document.getElementById("avgLatencyMetric");
    if (avgLatencyEl) {
      if (metrics.totalCalls > 0 && metrics.totalLatencyMs) {
        const avg = Math.round(metrics.totalLatencyMs / metrics.totalCalls);
        avgLatencyEl.textContent = `${avg.toLocaleString()} ms`;
      } else {
        avgLatencyEl.textContent = "-";
      }
    }

    if (metrics.lastCallTimestamp) {
      const dt = new Date(metrics.lastCallTimestamp);
      lastCallMetric.textContent = dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } else {
      lastCallMetric.textContent = "Never";
    }

    const breakdown = metrics.providerBreakdown || {};
    const entries = Object.entries(breakdown);
    if (entries.length > 0) {
      providerBreakdownList.innerHTML = entries
        .map(([prov, stats]) => {
          const calls = typeof stats === "object" ? stats.calls : stats;
          const tokens = typeof stats === "object" ? (stats.tokens || 0) : 0;
          const provCost = typeof stats === "object" && stats.cost
            ? (stats.cost < 0.01 ? `$${stats.cost.toFixed(4)}` : `$${stats.cost.toFixed(2)}`)
            : (prov === "ollama" || prov === "chrome_builtin" ? "Free" : "-");

          return `
            <div class="breakdown-item">
              <div>
                <strong>${escapeHtml(PROVIDERS[prov]?.name || prov)}</strong>
                <small style="display:block; color:#64748b; font-size:10.5px;">${tokens.toLocaleString()} tokens • ${provCost}</small>
              </div>
              <span class="breakdown-badge">${calls} calls</span>
            </div>
          `;
        }).join("");
    } else {
      providerBreakdownList.innerHTML = `<span class="empty-state">No calls recorded yet.</span>`;
    }
  }

  // Load and render Developer Debug Logs
  async function loadDebugLogs() {
    chrome.runtime.sendMessage({ type: "GET_DEBUG_LOGS" }, (res) => {
      if (!res || !res.success || !res.logs || res.logs.length === 0) {
        debugLogsContainer.innerHTML = `<div class="debug-empty">No requests recorded yet. Browse any webpage to generate traffic.</div>`;
        return;
      }

      debugLogsContainer.innerHTML = res.logs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        const statusClass = `status-${log.status}`;
        const duration = log.durationMs ? `${log.durationMs}ms` : "-";

        return `
          <div class="debug-log-card">
            <div class="debug-log-header">
              <span class="debug-log-status ${statusClass}">${log.status}</span>
              <span class="debug-log-title" title="${escapeHtml(log.page?.url || log.type)}">${escapeHtml(log.page?.title || log.type)}</span>
              <span class="debug-log-time">${time}</span>
            </div>
            <div class="debug-log-details">
              <div class="debug-meta-grid">
                <div><strong>Provider:</strong> ${escapeHtml(log.provider)} (${escapeHtml(log.model)})</div>
                <div><strong>Latency:</strong> ${duration}</div>
                <div><strong>Tokens:</strong> In: ${log.usage?.promptTokens || 0} | Out: ${log.usage?.completionTokens || 0}</div>
                <div><strong>Target Domain:</strong> ${escapeHtml(log.page?.domain || "-")}</div>
              </div>

              ${log.error ? `
                <div>
                  <div class="debug-label" style="color: #ef4444;">Error Message:</div>
                  <pre class="debug-code-block" style="color: #fca5a5;">${escapeHtml(log.error)}</pre>
                </div>
              ` : ""}

              <div>
                <div class="debug-label">Payload Sent to AI (Prompt Context):</div>
                <pre class="debug-code-block">${escapeHtml(log.request?.userPrompt || JSON.stringify(log.request, null, 2))}</pre>
              </div>

              <div>
                <div class="debug-label">Raw AI Response:</div>
                <pre class="debug-code-block">${escapeHtml(typeof log.response === 'object' ? JSON.stringify(log.response, null, 2) : log.response)}</pre>
              </div>
            </div>
          </div>
        `;
      }).join("");
    });
  }

  // =========================================================================
  // MEMORY & CONTEXT TAB CONTROLLER
  // =========================================================================
  let currentMemoryFilter = "all";

  // Elements
  const activeProjectInput = document.getElementById("activeProjectInput");
  const activeProjectBadge = document.getElementById("activeProjectBadge");
  const saveProjectBtn = document.getElementById("saveProjectBtn");
  const tokenBudgetValue = document.getElementById("tokenBudgetValue");
  const memoryCardsContainer = document.getElementById("memoryCardsContainer");
  const filterPills = document.querySelectorAll(".mem-pill");

  // Modals
  const addMemoryModal = document.getElementById("addMemoryModal");
  const importMemoryModal = document.getElementById("importMemoryModal");
  const testContextModal = document.getElementById("testContextModal");

  // Buttons
  const openAddMemoryBtn = document.getElementById("openAddMemoryBtn");
  const closeAddMemoryBtn = document.getElementById("closeAddMemoryBtn");
  const cancelNewMemoryBtn = document.getElementById("cancelNewMemoryBtn");
  const saveNewMemoryBtn = document.getElementById("saveNewMemoryBtn");

  const openImportModalBtn = document.getElementById("openImportModalBtn");
  const closeImportMemoryBtn = document.getElementById("closeImportMemoryBtn");
  const cancelImportBtn = document.getElementById("cancelImportBtn");
  const executeImportBtn = document.getElementById("executeImportBtn");

  const exportMarkdownBtn = document.getElementById("exportMarkdownBtn");
  const openTestContextBtn = document.getElementById("openTestContextBtn");
  const closeTestContextBtn = document.getElementById("closeTestContextBtn");
  const runTestRetrievalBtn = document.getElementById("runTestRetrievalBtn");

  // Filter pill clicks
  filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      filterPills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      currentMemoryFilter = pill.getAttribute("data-filter");
      renderMemories();
    });
  });

  // Save active project name
  if (saveProjectBtn) {
    saveProjectBtn.addEventListener("click", () => {
      const proj = activeProjectInput.value.trim() || "Wayfinder AI";
      chrome.runtime.sendMessage({
        type: "UPDATE_MEMORY_CONFIG",
        payload: { activeProject: proj }
      }, (res) => {
        if (res && res.success) {
          activeProjectBadge.textContent = proj;
          showToast(`Active project set to "${proj}"`);
          renderMemories();
        }
      });
    });
  }

  // Add memory modal controls
  if (openAddMemoryBtn) {
    openAddMemoryBtn.addEventListener("click", () => {
      addMemoryModal.style.display = "flex";
    });
  }
  const closeAddModal = () => { if (addMemoryModal) addMemoryModal.style.display = "none"; };
  if (closeAddMemoryBtn) closeAddMemoryBtn.addEventListener("click", closeAddModal);
  if (cancelNewMemoryBtn) cancelNewMemoryBtn.addEventListener("click", closeAddModal);

  if (saveNewMemoryBtn) {
    saveNewMemoryBtn.addEventListener("click", () => {
      const type = document.getElementById("newMemType").value;
      const title = document.getElementById("newMemTitle").value;
      const content = document.getElementById("newMemContent").value;
      const tagsRaw = document.getElementById("newMemTags").value;
      const importance = document.getElementById("newMemImportance").value;
      const activeProj = activeProjectInput.value.trim() || "Wayfinder AI";

      if (!content.trim()) {
        alert("Please enter memory content.");
        return;
      }

      const tags = tagsRaw.split(",").map(t => t.trim()).filter(Boolean);

      chrome.runtime.sendMessage({
        type: "ADD_MEMORY",
        payload: {
          type,
          title: title || content.slice(0, 30),
          content,
          project: activeProj,
          tags,
          importance: Number(importance) || 3
        }
      }, (res) => {
        if (res && res.success) {
          closeAddModal();
          document.getElementById("newMemTitle").value = "";
          document.getElementById("newMemContent").value = "";
          document.getElementById("newMemTags").value = "";
          showToast("Memory saved successfully!");
          renderMemories();
        }
      });
    });
  }

  // Import modal controls
  if (openImportModalBtn) {
    openImportModalBtn.addEventListener("click", () => {
      importMemoryModal.style.display = "flex";
    });
  }
  const closeImportModal = () => { if (importMemoryModal) importMemoryModal.style.display = "none"; };
  if (closeImportMemoryBtn) closeImportMemoryBtn.addEventListener("click", closeImportModal);
  if (cancelImportBtn) cancelImportBtn.addEventListener("click", closeImportModal);

  if (executeImportBtn) {
    executeImportBtn.addEventListener("click", () => {
      const source = document.getElementById("importSourceSelect").value;
      const targetProj = document.getElementById("importTargetProject").value.trim() || "Imported Project";
      const payload = document.getElementById("importPayloadTextarea").value.trim();

      if (!payload) {
        alert("Please paste data to import.");
        return;
      }

      executeImportBtn.disabled = true;
      executeImportBtn.textContent = "Importing...";

      const msgType = source === "claude" ? "IMPORT_MEMORY_CLAUDE" : "IMPORT_MEMORY_CHATGPT";

      chrome.runtime.sendMessage({
        type: msgType,
        payload: {
          data: payload,
          options: { defaultProject: targetProj }
        }
      }, (res) => {
        executeImportBtn.disabled = false;
        executeImportBtn.textContent = "Parse & Import Memories";

        if (res && res.success) {
          closeImportModal();
          document.getElementById("importPayloadTextarea").value = "";
          showToast(`✓ Imported ${res.count} memories from ${source}!`);
          renderMemories();
        } else {
          alert(`Import failed: ${res?.error || 'Unknown error'}`);
        }
      });
    });
  }

  // Export controls (Claude/ChatGPT Markdown)
  if (exportMarkdownBtn) {
    exportMarkdownBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "EXPORT_MEMORY_MARKDOWN" }, (res) => {
        if (res && res.markdown) {
          navigator.clipboard.writeText(res.markdown).then(() => {
            showToast("📋 Copied Claude/ChatGPT Markdown context to clipboard!");
          });
        }
      });
    });
  }

  // Test retrieval simulator
  if (openTestContextBtn) {
    openTestContextBtn.addEventListener("click", () => {
      testContextModal.style.display = "flex";
    });
  }
  const closeTestModal = () => { if (testContextModal) testContextModal.style.display = "none"; };
  if (closeTestContextBtn) closeTestContextBtn.addEventListener("click", closeTestModal);

  if (runTestRetrievalBtn) {
    runTestRetrievalBtn.addEventListener("click", () => {
      const query = document.getElementById("testQueryInput").value.trim();
      const domain = document.getElementById("testDomainInput").value.trim();
      const resultBox = document.getElementById("testResultBox");

      runTestRetrievalBtn.textContent = "Simulating...";

      chrome.runtime.sendMessage({
        type: "TEST_MEMORY_RETRIEVAL",
        payload: {
          query,
          pageContext: { domain, title: `Test on ${domain}` },
          maxTokens: 1000
        }
      }, (res) => {
        runTestRetrievalBtn.textContent = "Run Hybrid Retrieval";
        if (res && res.success) {
          resultBox.style.display = "block";
          resultBox.textContent = `Tokens used: ${res.context.tokenStats.used} / ${res.context.tokenStats.budget}\n` +
            `Selected memories: ${res.context.tokenStats.itemCount}\n\n` +
            `--- INJECTED CONTEXT BLOCK ---\n${res.context.formattedPrompt}`;
        }
      });
    });
  }

  function loadMemoryTab() {
    chrome.runtime.sendMessage({ type: "GET_MEMORY_CONFIG" }, (res) => {
      if (res && res.config) {
        if (activeProjectInput) activeProjectInput.value = res.config.activeProject || "Wayfinder AI";
        if (activeProjectBadge) activeProjectBadge.textContent = res.config.activeProject || "Wayfinder AI";
        if (tokenBudgetValue) tokenBudgetValue.textContent = `${(res.config.defaultTokenBudget || 1000).toLocaleString()} tokens`;
      }
    });
    renderMemories();
  }

  function renderMemories() {
    chrome.runtime.sendMessage({ type: "GET_MEMORIES" }, (res) => {
      if (!res || !res.memories) return;
      const all = res.memories;

      // Update pill counters
      const counts = {
        all: all.length,
        long_term: all.filter(m => m.type === "long_term").length,
        project: all.filter(m => m.type === "project").length,
        knowledge: all.filter(m => m.type === "knowledge").length,
        working_context: all.filter(m => m.type === "working_context").length
      };

      const cAll = document.getElementById("countAll");
      const cLong = document.getElementById("countLongTerm");
      const cProj = document.getElementById("countProject");
      const cKnow = document.getElementById("countKnowledge");
      const cWork = document.getElementById("countWorking");

      if (cAll) cAll.textContent = counts.all;
      if (cLong) cLong.textContent = counts.long_term;
      if (cProj) cProj.textContent = counts.project;
      if (cKnow) cKnow.textContent = counts.knowledge;
      if (cWork) cWork.textContent = counts.working_context;

      // Filter
      const filtered = currentMemoryFilter === "all"
        ? all
        : all.filter(m => m.type === currentMemoryFilter);

      if (!memoryCardsContainer) return;

      if (filtered.length === 0) {
        memoryCardsContainer.innerHTML = `
          <div style="text-align: center; padding: 24px 10px; color: #94a3b8; font-size: 11.5px;">
            No memories found in this partition.<br>Click <strong>➕ Add Memory</strong> or <strong>📥 Import</strong> to create one.
          </div>
        `;
        return;
      }

      const badgeClassMap = {
        long_term: "badge-core",
        project: "badge-project",
        knowledge: "badge-knowledge",
        working_context: "badge-session"
      };

      const badgeNameMap = {
        long_term: "🧠 Core",
        project: "📂 Project",
        knowledge: "🌐 Knowledge",
        working_context: "⚡ Session"
      };

      memoryCardsContainer.innerHTML = filtered.map(m => {
        const badgeClass = badgeClassMap[m.type] || "badge-core";
        const badgeName = badgeNameMap[m.type] || m.type;
        const stars = "★".repeat(m.importance || 3);
        const tags = (m.tags || []).slice(0, 4).map(t => `<span class="memory-tag-chip">#${escapeHtml(t)}</span>`).join("");

        return `
          <div class="memory-card" data-id="${m.id}">
            <div class="memory-card-header">
              <div>
                <span class="memory-badge ${badgeClass}" style="margin-right: 4px;">${badgeName}</span>
                <span style="font-size: 10px; color: #6366f1; font-weight: 600;">[${escapeHtml(m.project || 'Global')}]</span>
                <div class="memory-card-title" style="margin-top: 3px;">${escapeHtml(m.title)}</div>
              </div>
              <button type="button" class="delete-mem-btn" data-id="${m.id}" title="Delete Memory">🗑️</button>
            </div>
            <div class="memory-card-body">${escapeHtml(m.content)}</div>
            <div class="memory-card-footer">
              <div class="memory-tags-cloud">${tags}</div>
              <span style="color: #f59e0b; font-size: 11px;">${stars}</span>
            </div>
          </div>
        `;
      }).join("");

      // Bind delete handlers
      memoryCardsContainer.querySelectorAll(".delete-mem-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.getAttribute("data-id");
          if (confirm("Delete this memory?")) {
            chrome.runtime.sendMessage({ type: "DELETE_MEMORY", payload: { id } }, (res) => {
              if (res && res.success) {
                renderMemories();
                showToast("Memory deleted");
              }
            });
          }
        });
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
});
