# Privacy Policy & Security Architecture — Wayfinder AI

*Last updated: November 2026*

Wayfinder AI is an open-source, user-first browser copilot. Our foundational architecture is built on the principle of **Zero Surveillance**: we do not operate telemetry servers, we do not track your browsing history, and we never monetize your data.

---

## 1. Local Processing vs. External Cloud Providers

Wayfinder AI gives you 100% control over how and where your AI inference happens.

### Option A: Local & Completely Offline (Recommended for Total Privacy)
- **Ollama / Local LLM (`localhost:11434`)**: When configured with Ollama (e.g., Llama 3.2, Mistral, Qwen), **all processing happens locally on your computer**.
- **Zero Network Traffic**: No web page content, URLs, or prompts ever leave your machine. It operates fully offline and private.

### Option B: External Cloud AI Providers
- **Supported Providers**: OpenAI (`api.openai.com`), Anthropic Claude (`api.anthropic.com`), Meta / Groq, OpenRouter.
- **Data Transmission**: When you explicitly configure a cloud provider and supply your personal API key, Wayfinder AI sends an excerpt of the active webpage to that provider's official endpoint over encrypted HTTPS.
- **Your Own API Keys**: Requests are authenticated with your personal API key. Your usage is governed by your agreement with that provider (e.g., OpenAI API Data Usage Policy, which explicitly states that API data is not used to train models).

---

## 2. What Data Is Processed

When analyzing a webpage to provide contextual guidance and purple DOM callouts, Wayfinder AI extracts an in-memory structural summary:
- **Page Context**: Page title, domain name, URL, headings (`h1`-`h3`), and high-level visible body text (condensed up to 1,500 characters).
- **Semantic Entities**: Schema.org JSON-LD microdata (e.g. flight route, hotel name, product name, price/fare) to identify what you are viewing.
- **Action Candidates**: Button and navigation link labels (e.g., "Select Flight", "Add to Cart", "Documentation").

---

## 3. Automatic PII & Sensitive Data Sanitization

Wayfinder AI enforces strict client-side sanitization **before** any data is sent to an AI provider:

1. **Passwords & Form Inputs**: All password fields (`input[type="password"]`), text inputs, textareas, and hidden form fields are completely stripped from extraction.
2. **Payment & Financial Details**: Any input or element with attributes matching credit cards, CVVs, payment methods, or banking information is permanently excluded.
3. **Regex PII Redaction**:
   - Email addresses are sanitized (`[EMAIL_REDACTED]`).
   - Credit card number patterns are sanitized (`[CARD_REDACTED]`).
   - Social Security Numbers are sanitized (`[SSN_REDACTED]`).
   - API tokens and Bearer credentials are sanitized (`[KEY_REDACTED]`).

---

## 4. How Credentials & Preferences Are Stored

- **Sandboxed Local Storage**: Your API keys, model selections, and UI preferences are stored exclusively in `chrome.storage.local`.
- **No Cloud Sync**: We do **not** use `chrome.storage.sync` for credentials. Your keys never leave your local browser profile.
- **Masked in UI & Logs**: Diagnostic logs and UI fields mask API keys (e.g., `sk-...3f9a`) to prevent shoulder-surfing and accidental exposure.

---

## 5. Chrome Permissions Justification

Wayfinder AI uses Manifest V3 with minimal necessary permissions:
- `storage`: To save your provider preferences and API keys locally in your browser.
- `activeTab`: To analyze the structure of the currently focused tab only when enabled.
- `scripting`: To safely inject the beacon and purple DOM markers.
- `<all_urls>`: Required to allow universal assistance across any website (flights, hotels, shopping, documentation) without hardcoded domain limits.

---

## 6. Zero Telemetry & User Controls

- **No Remote Telemetry**: Wayfinder AI does not embed Google Analytics, Mixpanel, Sentry, or any third-party tracking scripts.
- **Reset & Deletion**:
  - Click **"Clear History"** in the popup to wipe learned workflow transitions and cached visits instantly.
  - Uninstalling the extension completely removes all stored data from your disk.

---

## 7. Open Source Transparency

Wayfinder AI is open-source under the **MIT License**. The entire codebase is auditable on GitHub:
[https://github.com/sparsha1211/wayfinderai](https://github.com/sparsha1211/wayfinderai)

For security disclosures or questions, please open an issue on the repository.
