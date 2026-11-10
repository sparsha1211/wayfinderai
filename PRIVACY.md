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

## 3. Critical Security Guard Rails: Passwords & Payment Protection

Wayfinder AI implements a **4-tier client-side defense in depth architecture** to safeguard your security and financial credentials:

### Tier 1: Automatic Privacy Shield on Sensitive Forms & Domains
- **Auto-Detection**: Whenever you visit a page with login/signup forms, password fields (`input[type="password"]`), checkout payment gateways, or billing sections (`/checkout/payment`, `/pay`, Stripe, PayPal, banking URLs), Wayfinder AI **automatically halts all AI analysis**.
- **Visual Shield Indicator**: The floating beacon switches to a green/gold shield (🛡️) reading *"Wayfinder Privacy Shield Active"*.
- **Zero Transmission**: Absolutely zero page data, DOM nodes, or keystrokes are sent to any LLM.
- **Markers Disabled**: In-page purple dots and callout boxes are completely suppressed on sensitive forms.

### Tier 2: Element-Level Scraping & Annotation Blocking
- Interactive candidate extractors strictly ignore all form controls (`input`, `textarea`, `select`) and any element associated with passwords, CVVs, card numbers, expiration dates, or billing fields.
- Purple callout boxes will **never** attach to or obscure password or payment buttons.

### Tier 3: Regex PII & Secret Redaction Engine
Before any text is passed to an AI service (including manual Copilot chats or highlighted text selection), it is filtered through rigorous client-side sanitizers:
- **Payment Cards**: 13-19 digit card patterns $\rightarrow$ `[CARD_REDACTED]`
- **Card Security Codes (CVV / CVC)**: 3-4 digit codes near card terms $\rightarrow$ `[CVV_REDACTED]`
- **Passwords**: Key-value password strings (`password=xyz`, `pwd: xyz`) $\rightarrow$ `[PASSWORD_REDACTED]`
- **Social Security Numbers**: Standard SSN patterns $\rightarrow$ `[SSN_REDACTED]`
- **Bank Accounts (IBAN)**: International Bank Account Numbers $\rightarrow$ `[IBAN_REDACTED]`
- **Cryptocurrency Wallets**: Bitcoin and Ethereum address formats $\rightarrow$ `[CRYPTO_ADDR_REDACTED]`
- **API Keys & Auth Tokens**: Bearer tokens and API keys $\rightarrow$ `[KEY_REDACTED]`
- **Email Addresses**: Standard email formats $\rightarrow$ `[EMAIL_REDACTED]`

### Tier 4: Chatbox & Text Selection Interceptor
When using the in-page Copilot chat (<kbd>⌘I</kbd>) or the floating text selection pill, user input is passed through `sanitizeSensitiveText()` prior to dispatch, preventing accidental leakage if credentials are typed or pasted into chat.

---

## 4. Cost Transparency & Commercial API Guarantees

### A. Commercial API vs. Consumer ChatGPT (Zero Model Training)
- **Zero Training on Your Data**: Wayfinder AI communicates directly with commercial API endpoints (e.g. OpenAI `api.openai.com` via your private `sk-proj-...` key). In accordance with OpenAI and Anthropic Commercial API Data Policies, **API data is NEVER used to train or improve models**.
- **Retention Limit**: Commercial API requests are retained in encrypted logs solely for trust and abuse monitoring for **30 days**, after which they are permanently deleted.

### B. Exact Cost Breakdown
Wayfinder AI enforces a strict **1-call-per-page-load policy**, preventing looping or runaway billing:
- **Average Analysis Size**: ~288 input tokens + ~240 output tokens = **~530 total tokens**.
- **Cost on `gpt-4o-mini`**: $0.15/1M in + $0.60/1M out $\approx$ **$0.00019 per webpage**.
- **Pages per $1.00 USD**: Over **5,200 web pages** per single dollar.
- **Estimated Monthly Cost**: An active daily user browsing 30–50 pages a day will spend **~$0.20 to $0.35 USD per month**.
- **Local AI (Ollama)**: Always **100% free** and runs locally on your machine.

---

## 5. How Credentials & Preferences Are Stored

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
