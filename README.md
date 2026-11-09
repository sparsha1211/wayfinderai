# Wayfinder AI - Smart Web Navigation AI Assistant (Chrome Extension)

A lightweight, professional Chrome Extension (Manifest V3) that acts as an intelligent in-page co-pilot for web navigation. Wayfinder AI features 3 distinct interaction modes, in-page DOM marker overlays, automated DOM change & navigation re-analysis with rate-limiting, test-connection checks for all AI providers, usage/token metrics, and a dedicated **Playwright E2E Testing Suite**.

---

## ✨ Key Features

1. **Test Connection for All AI Providers**:
   - In the popup, click **⚡ Test Connection** beside your API key and model config.
   - Instantly pings your selected provider (OpenAI, Claude, OpenRouter, Meta/Groq, or Ollama) with real-time feedback (`✓ Connected successfully!` or clear error explanation).

2. **Automated Dynamic DOM Mutation & Route Change Observer**:
   - Wayfinder AI automatically detects when:
     - You navigate to a new page or refresh.
     - Single Page Applications (SPA) change URL client-side.
     - Dynamic AJAX / DOM content updates on the active page.
   - Includes a **rate limiter (6-second threshold + 2.5s mutation debounce)** to prevent excessive AI queries or API cost runaway.

3. **In-Page DOM Purple Markers & 3 Modes of Interaction**:
   - **Mode 1 (Signal Beacon HUD)**: Floating bottom-right beacon. Hover to preview analysis; click to pin permanently.
   - **Mode 2 (DOM Markers with Popovers)**: Glowing purple beacons beside key action elements. Click or hover on any marker for in-page contextual advice.
   - **Mode 3 (Text Selection Copilot)**: Highlight text anywhere on the page and click *"Analyze with AI"* for an instant in-place explanation.

4. **Metrics & Developer Debug Mode**:
   - Live token and request tracking (Prompt tokens, completion tokens, breakdown by provider).
   - Toggle **Developer Debug Mode** to inspect raw payloads, duration in milliseconds, and error traces.

---

## 🧪 Playwright End-to-End (E2E) Testing

Wayfinder AI includes an automated Playwright E2E testing framework in [`tests/`](file:///Volumes/Workspace/ai_assist_chrome/tests/).

### Running the E2E Tests:

1. **Configure your API Key (Optional)**:
   Edit [`tests/test.config.json`](file:///Volumes/Workspace/ai_assist_chrome/tests/test.config.json):
   ```json
   {
     "activeProvider": "openai",
     "apiKeys": {
       "openai": "sk-your-real-key-here"
     }
   }
   ```
   *(By default, it tests with Ollama / local mock structure without requiring paid keys).*

2. **Run Tests**:
   ```bash
   npx playwright test
   ```
   Or to run with the interactive UI:
   ```bash
   npx playwright test --ui
   ```

### What the E2E Tests Verify:
- **E2E-1**: Extension popup loads, verifies master toggle, and validates UI navigation tabs.
- **E2E-2**: Validates the **Test Connection** button against configured provider settings.
- **E2E-3**: Injects the floating beacon HUD and verifies that **Purple DOM Markers** attach to key interactive elements.
- **E2E-4**: Validates hover and click-to-pin behavior on the guidance overlay.
- **E2E-5**: Highlights on-page text and asserts that the **"Analyze with AI"** copilot pill appears.
- **E2E-6**: Triggers dynamic DOM mutation and verifies that the observer updates the in-page navigation context.

---

## 📁 Project Structure

```
ai_assist_chrome/
├── manifest.json                  # Manifest V3 extension configuration
├── icons/                         # 16px, 48px, 128px extension icons
├── e2e-fixtures/                  # Sample test portal for automated testing
│   └── sample-page.html
├── tests/
│   ├── extension.spec.js          # Playwright test suite
│   └── test.config.json           # User configuration (API keys, provider choice)
├── playwright.config.js           # Playwright test configuration
├── package.json                   # Test dependencies
├── src/
│   ├── background.js              # Service worker (AI dispatch, test connection, metrics)
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
