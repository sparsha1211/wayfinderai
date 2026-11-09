# Wayfinder AI - Smart Web Navigation AI Assistant (Chrome Extension)

A lightweight, professional Chrome Extension (Manifest V3) that acts as an intelligent in-page co-pilot for web navigation. Wayfinder AI features 3 distinct interaction modes, in-page DOM marker overlays, automated dynamic DOM mutation and route change observation with rate-limiting, test-connection checks across all AI providers, usage/token metrics, developer debug inspection, and a complete **Playwright End-to-End (E2E) Testing Suite**.

---

## ✨ Key Features

1. **⚡ Test Connection for All AI Providers**:
   - In the popup, click **⚡ Test Connection** beside your API key and model config.
   - Instantly pings your selected provider (OpenAI, Claude, OpenRouter, Meta/Groq, Ollama, or Chrome Built-in AI) with real-time feedback (`✓ Connected successfully!` or clear error explanation).

2. **Predictable Navigation Analysis (Exactly 1 Call per Page Load / Refresh)**:
   - To conserve token usage and prevent unnecessary network calls, Wayfinder AI executes **strictly 1 AI analysis per page load / refresh**.
   - It will not fire repetitive calls on background DOM mutations or AJAX updates.
   - When navigating to a new URL (including client-side SPA navigation), it resets and runs one clean guidance request for that new page.
   - You can manually trigger a fresh re-analysis anytime using the **🔄 refresh button** in the guidance card header.

3. **In-Page DOM Purple Markers & 3 Modes of Interaction**:
   - **Mode 1 (Signal Beacon HUD)**: Floating bottom-right beacon. Hover to preview analysis; click to pin permanently.
   - **Mode 2 (DOM Markers with Popovers)**: Glowing purple beacons beside key action elements. Click or hover on any marker for in-page contextual advice.
   - **Mode 3 (Text Selection Copilot)**: Highlight text anywhere on the page and click *"Analyze with AI"* for an instant in-place explanation.

4. **Metrics & 🛠️ Developer Debug Mode**:
   - Live token and request tracking (Prompt tokens, completion tokens, breakdown by provider).
   - Toggle **Developer Debug Mode** in Settings to unlock the **"🛠️ Debug Logs"** tab:
     - Inspect exact roundtrip latency in milliseconds.
     - View exact prompt payloads sent to the AI.
     - View full raw JSON responses or error traces.

5. **Local AI Support on macOS / Chrome**:
   - **Ollama**: Run `llama3.2`, `mistral`, or `qwen2.5` locally accelerated by your Mac's GPU/Metal unified memory (`OLLAMA_ORIGINS="*" ollama serve`).
   - **Chrome Built-in AI (Gemini Nano)**: Support for Chrome's native on-device model (`window.ai` / Prompt API).

---

## 🧪 How to Run End-to-End (E2E) Tests

Wayfinder AI includes an automated Playwright testing framework that launches real Chromium with the unpacked extension, loads a sample test page, and verifies all features end-to-end.

### 1. Prerequisites
Ensure Node.js and Playwright dependencies are installed:
```bash
npm install
npx playwright install chromium
```

### 2. Configure Your Test Credentials (Optional)
The test suite reads configuration from [`tests/test.config.json`](tests/test.config.json). You can edit this file to test your real API keys or specific providers:

```json
{
  "activeProvider": "openai",
  "apiKeys": {
    "openai": "sk-your-real-openai-key-here",
    "claude": "sk-ant-your-claude-key-here",
    "openrouter": "sk-or-your-openrouter-key-here",
    "meta": "gsk_your_groq_key_here"
  },
  "customEndpoints": {
    "ollama": "http://localhost:11434/api/chat"
  },
  "selectedModels": {
    "openai": "gpt-4o-mini",
    "claude": "claude-3-5-haiku-20241022",
    "openrouter": "meta-llama/llama-3.1-8b-instruct:free",
    "meta": "llama-3.1-8b-instant",
    "ollama": "llama3.2:latest"
  },
  "domMarkersEnabled": true,
  "debugMode": true
}
```
*(Note: If no key is configured, the test suite verifies connection validation and error boundaries gracefully).*

### 3. Run the Tests
Execute all 6 end-to-end tests:
```bash
npm test
# or
npx playwright test
```

To run with Playwright's interactive visual UI runner:
```bash
npm run test:ui
# or
npx playwright test --ui
```

### 4. What the Tests Verify (100% Pass Rate):
- **`E2E-1` (Popup UI & Controls)**: Asserts extension loads properly in Chromium, validates brand header, master switch, and all navigation tabs.
- **`E2E-2` (⚡ Test Connection)**: Validates that clicking "Test Connection" pings the background worker and returns live status feedback.
- **`E2E-3` (Purple DOM Markers & HUD Injection)**: Confirms the floating HUD beacon is injected and that **glowing purple DOM markers** attach to primary buttons/links on the page with interactive hover popovers.
- **`E2E-4` (Guidance Card & Persistent Pinning)**: Asserts the beacon expands the guidance card on click and activates persistent pinned mode.
- **`E2E-5` (Text Selection Copilot)**: Selects on-page text and asserts that the floating **"Analyze with AI"** pill appears immediately.
- **`E2E-6` (Dynamic DOM & Route Mutation Observer)**: Adds dynamic content to the DOM and asserts that the MutationObserver debounces and updates in-page navigation context.

---

## 📁 Project Structure

```
ai_assist_chrome/
├── manifest.json                  # Manifest V3 extension configuration
├── icons/                         # 16px, 48px, 128px extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── e2e-fixtures/                  # Sample test portal for automated testing
│   └── sample-page.html
├── tests/
│   ├── extension.spec.js          # Playwright test suite (6 E2E scenarios)
│   └── test.config.json           # User configuration (API keys, provider choice)
├── playwright.config.js           # Playwright runner configuration
├── package.json                   # Test dependencies & scripts
├── src/
│   ├── background.js              # Service worker (AI dispatch, test connection, metrics, debug logs)
│   ├── content.js                 # Content script (HUD, DOM markers, MutationObserver, rate limiter)
│   ├── content.css                # Styling for beacon, cards, DOM markers, and selection popovers
│   ├── services/
│   │   ├── aiProviders.js         # Provider integrations + Token usage + Connectivity tester
│   │   └── patternLearner.js      # Local history & workflow pattern learner
│   └── ui/
│       ├── popup.html             # Control center UI (Settings, Metrics, Guide, Dev Console)
│       ├── popup.css              # Clean, modern popup design with dev console styles
│       └── popup.js               # Settings, Metrics, Test Connection & Debug Logs controller
└── README.md                      # Documentation & installation guide
```

---

## 🚀 Loading Extension in Google Chrome

1. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the `/Volumes/Workspace/ai_assist_chrome` folder.
4. Pin **Wayfinder AI** to your Chrome toolbar.
5. Click the extension icon to select your preferred provider, test connection, and browse!
