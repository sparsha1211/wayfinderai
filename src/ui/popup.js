/**
 * Wayfinder AI Popup UI Controller
 */

import { PROVIDERS } from "../services/aiProviders.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const masterToggle = document.getElementById("masterToggle");
  const providerSelect = document.getElementById("providerSelect");
  const apiKeyGroup = document.getElementById("apiKeyGroup");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const apiKeyHint = document.getElementById("apiKeyHint");
  const toggleKeyVisibility = document.getElementById("toggleKeyVisibility");
  const modelSelect = document.getElementById("modelSelect");
  const endpointInput = document.getElementById("endpointInput");
  const endpointHint = document.getElementById("endpointHint");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const statusToast = document.getElementById("statusToast");
  const statusText = document.getElementById("statusText");
  const indicatorDot = document.querySelector(".indicator-dot");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

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

      if (btn.getAttribute("data-tab") === "tab-patterns") {
        loadPatternInsights();
      }
    });
  });

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

  const activeProvider = settings.activeProvider || "ollama";
  providerSelect.value = activeProvider;

  updateProviderUI(activeProvider, settings);

  // Switch Provider dropdown listener
  providerSelect.addEventListener("change", (e) => {
    const selected = e.target.value;
    updateProviderUI(selected, settings);
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

    const curr = await chrome.storage.local.get("wayfinder_settings");
    const newSettings = curr.wayfinder_settings || { apiKeys: {}, customEndpoints: {}, selectedModels: {} };

    newSettings.activeProvider = provider;
    newSettings.apiKeys = newSettings.apiKeys || {};
    newSettings.customEndpoints = newSettings.customEndpoints || {};
    newSettings.selectedModels = newSettings.selectedModels || {};

    if (PROVIDERS[provider]?.requiresKey) {
      newSettings.apiKeys[provider] = key;
    }
    if (model) {
      newSettings.selectedModels[provider] = model;
    }
    if (endpoint) {
      newSettings.customEndpoints[provider] = endpoint;
    }

    await chrome.storage.local.set({ wayfinder_settings: newSettings });
    showToast("Settings saved successfully!");
  });

  // Clear learning data
  clearHistoryBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_HISTORY" }, (res) => {
      if (res?.success) {
        showToast("Learned history and patterns reset.");
        loadPatternInsights();
      }
    });
  });

  function updateProviderUI(providerKey, currentSettings) {
    const provider = PROVIDERS[providerKey] || PROVIDERS.openai;

    // Show/hide API key group
    if (provider.requiresKey) {
      apiKeyGroup.style.display = "block";
      apiKeyInput.value = currentSettings.apiKeys?.[providerKey] || "";
      apiKeyHint.textContent = `Required for ${provider.name}. Stored locally.`;
    } else {
      apiKeyGroup.style.display = "none";
      apiKeyInput.value = "";
    }

    // Model and endpoint
    modelSelect.value = currentSettings.selectedModels?.[providerKey] || provider.defaultModel;
    endpointInput.value = currentSettings.customEndpoints?.[providerKey] || provider.defaultEndpoint;

    if (providerKey === "ollama") {
      endpointHint.textContent = "Default: http://localhost:11434/api/chat. Set OLLAMA_ORIGINS='*' if blocked.";
    } else {
      endpointHint.textContent = `Default REST endpoint for ${provider.name}.`;
    }
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
    }, 3000);
  }

  // Load and render pattern insights
  function loadPatternInsights() {
    chrome.runtime.sendMessage({ type: "GET_PATTERNS_CONTEXT" }, (res) => {
      if (!res || !res.success || !res.patterns) return;
      const { topDomains = [], topInterests = [], frequentWorkflows = [] } = res.patterns;

      const domainsContainer = document.getElementById("topDomainsList");
      const interestsContainer = document.getElementById("topInterestsList");
      const workflowsContainer = document.getElementById("workflowsList");

      // Render domains
      if (topDomains.length > 0) {
        domainsContainer.innerHTML = topDomains
          .map(d => `<span class="pattern-tag">${escapeHtml(d)}</span>`)
          .join("");
      } else {
        domainsContainer.innerHTML = `<span class="empty-state">No visits recorded yet.</span>`;
      }

      // Render interests
      if (topInterests.length > 0) {
        interestsContainer.innerHTML = topInterests
          .map(t => `<span class="pattern-tag">#${escapeHtml(t)}</span>`)
          .join("");
      } else {
        interestsContainer.innerHTML = `<span class="empty-state">No topics detected yet.</span>`;
      }

      // Render workflows
      if (frequentWorkflows.length > 0) {
        workflowsContainer.innerHTML = frequentWorkflows
          .map(w => `<li>${escapeHtml(w)}</li>`)
          .join("");
      } else {
        workflowsContainer.innerHTML = `<li class="empty-state">No workflow sequences detected yet.</li>`;
      }
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
