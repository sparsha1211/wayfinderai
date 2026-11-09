# Wayfinder AI - Smart Web Navigation AI Assistant (Chrome Extension)

A lightweight, professional Chrome Extension (Manifest V3) that acts as an intelligent co-pilot for web navigation. Wayfinder AI learns user navigation patterns, synthesizes page context, and updates the in-page HTML DOM with clean visual beacons, interactive cards, and direct element highlighting.

---

## ✨ Features

- **Multi-Provider AI Architecture**:
  - **Ollama (Local AI)**: Completely private, runs offline (`llama3.2`, `mistral`, `qwen2.5`).
  - **OpenAI**: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`.
  - **Anthropic Claude**: `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`.
  - **OpenRouter**: Access hundreds of open-source and proprietary models (`meta-llama/llama-3.1-8b-instruct:free`, etc.).
  - **Meta / Muse (Llama API)**: Fast Llama inference via Groq or custom Meta endpoints.
- **Local Behavioral Learning Engine**:
  - Preserves navigation history and detects recurring workflows (e.g., `github.com -> docs`).
  - Discovers user topic interests and frequent hubs entirely in local Chrome storage.
  - Feeds behavioral patterns into the AI prompt so advice is tailored to the user's workflow without leaking full web history.
- **In-Page DOM Beacon & HUD**:
  - Unobtrusive floating pulse signal beacon at the bottom right of web pages.
  - **Hover or Click** to open the interactive guidance card.
  - Summarizes page goal, provides contextual hints, and generates one-click navigation actions.
  - Interactive action chips scroll to and pulse-highlight target buttons or links directly on the page.
- **Clean Master Enable / Disable Toggle**:
  - Instant toggle in the popup to pause or enable the assistant across tabs.
- **Privacy First**:
  - All keys and navigation patterns are saved strictly on your local machine via `chrome.storage.local`.

---

## 📁 Project Structure

```
ai_assist_chrome/
├── manifest.json                  # Manifest V3 extension configuration
├── icons/                         # 16px, 48px, 128px extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js              # Service worker (AI dispatch & pattern hub)
│   ├── content.js                 # Content script (DOM extraction & HUD injection)
│   ├── content.css                # In-page beacon, tooltip, and overlay styling
│   ├── services/
│   │   ├── aiProviders.js         # Provider integrations (Ollama, OpenAI, Claude, OpenRouter, Meta)
│   │   └── patternLearner.js      # Local history & workflow pattern learning engine
│   └── ui/
│       ├── popup.html             # Control center UI (Tabs, Provider switcher, Keys, Patterns)
│       ├── popup.css              # Clean, modern popup design
│       └── popup.js               # Popup controller & storage sync
└── README.md                      # Documentation & installation guide
```

---

## 🚀 Installation Guide

1. Clone or download this repository to your local computer:
   ```bash
   cd /Volumes/Workspace/ai_assist_chrome
   ```
2. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the `ai_assist_chrome` folder.
6. The **Wayfinder AI** extension is now installed and active!

---

## ⚙️ Configuration & Setup

Click the Wayfinder AI extension icon in your Chrome toolbar to open the control panel:

### 1. Using Ollama (Local AI - Default & Recommended for Privacy)
1. Ensure Ollama is running locally:
   ```bash
   ollama run llama3.2
   ```
2. By default, Ollama allows local requests. If Chrome extensions encounter CORS blocks, launch Ollama with:
   ```bash
   OLLAMA_ORIGINS="*" ollama serve
   ```
3. In the Wayfinder AI popup, ensure **Ollama** is selected as the Active Provider. No API key is required.

### 2. Using Cloud Providers (OpenAI, Claude, OpenRouter, Meta)
1. Select your desired provider from the dropdown.
2. Enter your API Key.
3. (Optional) Customize the model name or custom API endpoint.
4. Click **Save & Apply**.

---

## 🧭 How to Use Wayfinder AI

1. **Browse any website** (e.g., GitHub, documentation sites, e-commerce, news).
2. Wayfinder AI automatically analyzes the page context and correlates it with your frequent workflows.
3. Look for the **purple signal beacon** in the bottom-right corner:
   - **Hover** over the beacon to peek at the recommendations.
   - **Click** the beacon to pin the card open.
   - **Click any Suggested Action** chip: Wayfinder AI will smoothly scroll to and illuminate the target element on the page.
4. Open the **Learned Patterns** tab in the popup anytime to see top visited hubs, detected workflow paths, or clear your history with one click.
5. Toggle the master switch off anytime to pause the beacon.

---

## 🔒 Security & Privacy

- **No Remote Telemetry**: Wayfinder AI does not have any analytics or third-party tracking.
- **Local Storage**: API keys and browsing patterns are stored inside Chrome's sandboxed `chrome.storage.local`.
- When using **Ollama**, no webpage data leaves your local machine.
