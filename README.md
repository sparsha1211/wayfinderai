# Wayfinder AI - Smart Web Navigation AI Assistant (Chrome Extension)

A lightweight, professional Chrome Extension (Manifest V3) that acts as an intelligent in-page co-pilot for web navigation. Wayfinder AI features 3 distinct interaction modes, in-page DOM marker overlays, automated dynamic DOM mutation and route change observation with rate-limiting, test-connection checks across all AI providers, usage/token metrics, developer debug inspection, and a complete **Playwright End-to-End (E2E) Testing Suite**.

---

## ✨ Key Features

1. **⚡ Test Connection for All AI Providers**:
   - In the popup, click **⚡ Test Connection** beside your API key and model config.
   - Instantly pings your selected provider (OpenAI, Claude, OpenRouter, Meta/Groq, Ollama, or Chrome Built-in AI) with real-time feedback (`✓ Connected successfully!` or clear error explanation).

2. **💬 In-Page Copilot Chatbox (`Cmd + I` / `Ctrl + I`)**:
   - Press <kbd>Cmd + I</kbd> on macOS (or <kbd>Ctrl + I</kbd> on Windows/Linux) anytime, or click **"💬 Copilot"** in the HUD header.
   - A modern in-page chat copilot appears directly over the webpage.
   - Seamlessly ask questions using the active page context, inspect elements, or ask about highlighted text.
   - Features quick-prompt suggestion chips (`"Is this price fair?"`, `"Cheaper elsewhere?"`, `"Summarize page"`, `"What should I click next?"`).

3. **🌐 Universal Intent Deduction Engine (Flights, Stays, Shopping, Docs, SaaS)**:
   - Autonomously deduces what you are trying to do on **any** website without domain hardcoding.
   - **Flights & Travel**: Highlights baggage traps, layover risks, alternative airports, and date flexibility.
   - **Stays & Accommodations**: Identifies cleaning/service fee gotchas, cancellation deadlines, and neighborhood safety.
   - **Shopping & Products**: Evaluates price-to-value, checks review sentiment & defect patterns, and searches competitor pricing.
   - **Technical Documentation**: Flags version gotchas, breaking changes, and prerequisites.

4. **🟣 Marker Display Mode Toggle: Purple Dots vs. Direct Purple Boxes**:
   - Toggle between two visualization styles on the fly:
     - **Mode A (🟣 Dot Mode)**: Concentric pulsing purple beacon dots beside key action items. Hover or click to reveal the popover.
     - **Mode B (🏷️ Direct Box Mode)**: Displays direct text insights immediately inside stylish purple callout boxes without needing to hover! Includes smart positioning and UX preservation to keep target buttons easily clickable.
   - Toggle right from the HUD header (`🏷️ Text Boxes` / `🟣 Dots`) or in the popup settings under **Marker Display Mode**.

5. **🛡️ Critical Security Guard Rails & Automatic Privacy Shield**:
   - **Auto-Pauses on Sensitive Pages**: When visiting login/signin forms, password fields (`input[type="password"]`), or checkout payment gateways (`/checkout/payment`, `/pay`, Stripe, PayPal, banking URLs), Wayfinder AI **automatically halts all AI analysis**.
   - **Privacy Shield Beacon**: Floating beacon turns to a green/gold shield (🛡️) reading *"Wayfinder Privacy Shield Active"*.
   - **Zero Form Tampering**: In-page purple dots and callout boxes are completely suppressed on sensitive forms.
   - **Client-Side Regex Redactor**: Automatically sanitizes credit card numbers, CVVs, passwords, SSNs, IBANs, crypto addresses, and API tokens before any text is sent to the AI.
   - **Chatbox & Selection Guard**: Even if a user pastes a card number or password into Copilot Chat or text selection, it is intercepted and redacted on-device prior to transmission.

6. **Predictable Navigation Analysis (Exactly 1 Call per Page Load / Refresh)**:
   - To conserve token usage and prevent unexpected billing, Wayfinder AI executes **strictly 1 AI analysis per page load / refresh**.
   - It will not fire repetitive calls on background DOM mutations or AJAX updates.
   - When navigating to a new URL (including client-side SPA navigation), it resets and runs one clean guidance request for that new page.
   - You can manually trigger a fresh re-analysis anytime using the **🔄 refresh button** in the guidance card header.

7. **In-Page DOM Purple Markers & 4 Modes of Interaction**:
   - **Mode 1 (Signal Beacon HUD)**: Floating bottom-right beacon. Hover to preview analysis; click to pin permanently.
   - **Mode 2 (DOM Markers & Callout Boxes)**: Highlighting key action elements with insights and direct *"Ask Copilot"* shortcuts.
   - **Mode 3 (Text Selection Copilot)**: Highlight text anywhere on the page and click *"Analyze with AI"* or *"Discuss in Chat"*.
   - **Mode 4 (Interactive Copilot Chatbox)**: Full interactive chat thread embedded on the page.

8. **📊 Metrics Dashboard & Live Cost Estimator**:
   - Live token and request tracking (Prompt tokens, completion tokens, breakdown by provider).
   - **Estimated Cost (USD)**: Real-time calculation of your AI spend based on your active provider's token rates (typically fractions of a cent).
   - **🛡️ Shielded Pages Counter**: Tracks the total number of sensitive login and payment pages safely protected.
   - **Average Latency**: Tracks real-world roundtrip response times in milliseconds.
   - Toggle **Developer Debug Mode** in Settings to unlock the **"🛠️ Debug Logs"** tab:
     - Inspect exact roundtrip latency in milliseconds.
     - View exact prompt payloads sent to the AI.
     - View full raw JSON responses or error traces.

9. **Local AI Support on macOS / Chrome**:
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
- **`E2E-3` (Purple DOM Markers & HUD Injection)**: Confirms the floating HUD beacon is injected and that **glowing purple DOM markers** attach to primary buttons/links on the page.
- **`E2E-4` (Guidance Card & Persistent Pinning)**: Asserts the beacon expands the guidance card on click and activates persistent pinned mode.
- **`E2E-5` (Text Selection Copilot)**: Selects on-page text and asserts that the floating **"Analyze with AI"** pill appears immediately.
- **`E2E-6` (Single Call Policy & DOM Mutation Handling)**: Adds dynamic content to the DOM and asserts single-call policy and marker retention.
- **`E2E-7` (Cmd+I Interactive Copilot Chatbox)**: Verifies `Cmd+I` (and `Ctrl+I`) keyboard shortcut opens in-page chatbox, verifies prompt suggestion chips, and tests sending interactive contextual queries.
- **`E2E-8` (Purple Dots vs. Direct Purple Box Toggle)**: Verifies instant toggling between pulsing purple dots and direct inline purple text boxes with smart positioning.

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
├── LICENSE                        # Open-source MIT License
├── PRIVACY.md                     # Security & Privacy Policy
├── README.md                      # Documentation & installation guide
└── ...
```

---

## 🔒 Security, Privacy & Data Handling

Wayfinder AI was designed around user privacy:
- **Local-First AI (Ollama)**: When using Ollama, 100% of execution happens locally on your computer (`localhost:11434`). Zero web content, URLs, or prompts leave your machine.
- **External Cloud AI Providers**: When using OpenAI, Claude, Groq, or OpenRouter, page structure and text summaries are transmitted to that provider over encrypted HTTPS under your own API key.
- **4-Tier Security Guard Rails**:
  1. *Automatic Privacy Shield*: Automatically pauses AI analysis when visiting login, password, or payment checkout forms.
  2. *DOM-Level Exclusion*: Never attaches markers to or scrapes passwords, credit cards, or billing forms.
  3. *Client-Side Regex Redactor*: Automatically sanitizes card numbers, CVVs, passwords, SSNs, IBANs, crypto addresses, tokens, and emails before dispatch.
  4. *Chat & Selection Guard*: User chats and highlighted text selections are filtered on-device prior to network transmission.
- **Commercial API Privacy (Zero Model Training)**: In accordance with OpenAI and Anthropic Commercial API terms, data sent via their APIs is **NEVER used to train models** and is purged after 30 days.
- **Zero Telemetry**: No third-party trackers, analytics, or external logging servers.
- **Sandboxed Credentials**: API keys are saved exclusively in local Chrome profile storage (`chrome.storage.local`) and never synced to the cloud.

---

## 💰 Cloud AI Pricing & Economics

Wayfinder AI uses a strict **1-call-per-page-load policy**, making it exceptionally inexpensive:
- **Average Analysis Size**: ~288 input tokens + ~240 output tokens = **~530 total tokens**.

| Provider & Model | Input / 1M Tokens | Output / 1M Tokens | Cost per Page | Pages per $1.00 USD | Est. Monthly Cost (30-50 pages/day) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **OpenAI `gpt-4o-mini` (Default)** | **$0.15** | **$0.60** | **~$0.00019** | **~5,260 pages** | **~$0.20 – $0.35 / mo** |
| **Meta Llama 3.1 8B (via Groq/OpenRouter)** | $0.05 | $0.08 | **~$0.00003** | **~33,000 pages** | **~$0.03 – $0.06 / mo** |
| **Anthropic Claude 3.5 Haiku** | $0.80 | $4.00 | **~$0.00120** | **~830 pages** | **~$1.20 – $1.80 / mo** |
| **Ollama (Local Mac AI)** | Free | Free | **$0.00** | **Unlimited** | **$0.00 (Free)** |

Read the full [Privacy Policy & Security Architecture](PRIVACY.md).

---

## 💼 Commercial SaaS, Economics & Deployment

For subscription monetization, commercial projections, and 0-to-1 cloud deployment instructions, explore the [`marketing/`](marketing/) strategy suite:

* **[Commercial Unit Economics & Financial Projections](marketing/commercial-unit-economics.md)**: Breakdown of the $9.99/mo subscription model, COGS per user ($0.108/mo token cost + $0.59 Stripe fee = **~93% Gross Margin**), financial scale tables (100 to 10,000 subscribers), CAC/LTV targets, and usage guardrails.
* **[Go-To-Market & Commercial Launch Plan](marketing/go-to-market-plan.md)**: Product positioning, Chrome Web Store Optimization (ASO), Product Hunt launch strategy, viral demo clips, and referral loops.
* **[Production Deployment & Stripe Billing Guide](marketing/deployment-and-billing-guide.md)**: 1-click cloud deployment on Railway/Render, Stripe recurring product setup, webhook automation (`checkout.session.completed`), and Chrome Web Store publishing.
* **[Product Roadmap & Multi-Year Vision](marketing/product-roadmap.md)**: Milestones across Q1-Q4 including multimodal vision reasoning, Firefox/Safari support, and Team/Enterprise workspaces ($79/mo).

To build a clean zip package for Chrome Web Store Developer Dashboard upload:
```bash
npm run package:extension
# Outputs: dist/wayfinder-ai-chrome-extension.zip
```

---

## 📄 License

Wayfinder AI is free and open-source software licensed under the [MIT License](LICENSE).

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
