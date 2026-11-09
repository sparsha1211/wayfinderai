# Wayfinder AI - Smart Web Navigation AI Assistant (Chrome Extension)

A lightweight, professional Chrome Extension (Manifest V3) that acts as an intelligent in-page co-pilot for web navigation. Wayfinder AI features 3 distinct interaction modes, in-page DOM marker overlays, text-selection AI explanations, detailed usage/token metrics, and a dedicated **Developer Debug Mode** for inspecting raw requests and responses.

---

## ✨ Key Features & 3 Modes of Interaction

1. **Floating Signal Beacon & Guidance HUD**:
   - Subtle pulse beacon positioned at the bottom right.
   - **Hover** over the beacon to preview page analysis — seamlessly moving the mouse into the panel keeps it open.
   - **Click** the beacon or the pin button to pin the panel open permanently.
   - **Click suggested action chips**: Wayfinder smoothly scrolls to the element and runs an illuminated spotlight pulse animation.

2. **In-Page DOM Purple Markers (Toggleable in Settings)**:
   - When enabled, Wayfinder identifies interesting items on the page (key buttons, primary links, actions).
   - Injects animated purple beacon markers directly beside those DOM elements.
   - **Hovering or clicking on any marker** reveals an instant contextual advice tooltip.

3. **In-Page Text Selection AI Copilot**:
   - Highlight any text or sentence on any webpage.
   - A floating *"Analyze with AI"* button pops up beside your selection.
   - Click to get an instant TL;DR and decision/navigation insight right on the page without opening another tab.

4. **Metrics & Token Usage Dashboard**:
   - Track **Total AI Calls Made**, **Total Tokens**, **Input/Prompt Tokens**, and **Output/Completion Tokens**.
   - View per-provider request breakdown (e.g., Ollama vs. OpenAI vs. Claude).
   - Real-time updates with one-click counter reset.

5. **🛠️ Developer Debug Mode (Inspector Panel)**:
   - Toggle **Developer Debug Mode** in the Settings tab.
   - Unlocks a dedicated **"🛠️ Debug Logs"** console tab in the popup.
   - Inspect:
     - Exact latency / duration in milliseconds.
     - Prompt payloads sent to the AI (DOM context, headings, interactive elements).
     - Full raw responses or exact HTTP error messages.
     - Token counts per call.
     - One-click log refresh and purge controls.

---

## 📁 Project Structure

```
ai_assist_chrome/
├── manifest.json                  # Manifest V3 extension configuration
├── icons/                         # 16px, 48px, 128px extension icons
├── src/
│   ├── background.js              # Service worker (AI dispatch, debug logs, metrics)
│   ├── content.js                 # Content script (HUD, DOM markers, Text selection)
│   ├── content.css                # Styling for beacon, cards, DOM markers, and selection popovers
│   ├── services/
│   │   ├── aiProviders.js         # Provider integrations + Token usage parsers
│   │   └── patternLearner.js      # Local history & workflow pattern learner
│   └── ui/
│       ├── popup.html             # Control center UI (Settings, Metrics, Guide, Dev Console)
│       ├── popup.css              # Clean, modern popup design with dev console styles
│       └── popup.js               # Settings, Metrics & Debug Logs controller
└── README.md                      # Documentation & installation guide
```

---

## 🚀 Installation & Testing

1. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
2. Enable **Developer mode** in the top right corner.
3. Click the **Reload** button on the Wayfinder AI card.
4. Click the Wayfinder AI toolbar icon to open settings.
5. Toggle **Developer Debug Mode** ON to unlock the **🛠️ Debug Logs** tab and inspect live requests!

---

## ⚙️ Providers Supported

- **Ollama (Local AI - Free & Offline)**: Default endpoint `http://localhost:11434/api/chat`. Remember to launch Ollama with `OLLAMA_ORIGINS="*" ollama serve` to permit Chrome Extension requests.
- **OpenAI**: `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`.
- **Anthropic Claude**: `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`.
- **OpenRouter**: Aggregator for hundreds of open models.
- **Meta / Muse**: Llama 3.1 & 3.3 models via Groq or custom endpoints.
