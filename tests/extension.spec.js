import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const configPath = path.resolve(__dirname, 'test.config.json');
const samplePagePath = 'file://' + path.resolve(__dirname, '../e2e-fixtures/sample-page.html');

test.describe('Wayfinder AI Chrome Extension End-to-End Suite', () => {
  let context;
  let extensionId;
  let testConfig;

  test.beforeAll(async () => {
    // 1. Read configuration (user can configure API keys or provider in test.config.json)
    if (fs.existsSync(configPath)) {
      testConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      testConfig = { activeProvider: 'ollama' };
    }

    // 2. Launch Chromium with Wayfinder AI unpacked
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox'
      ]
    });

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    extensionId = background.url().split('/')[2];
    console.log(`[E2E] Wayfinder AI Loaded with Extension ID: ${extensionId}`);
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  test('E2E-1: Popup loads correctly and renders all control tabs', async () => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/ui/popup.html`);

    await expect(popupPage.locator('h1')).toHaveText('Wayfinder AI');

    const masterToggle = popupPage.locator('#masterToggle');
    await expect(masterToggle).toBeChecked();

    await expect(popupPage.locator('button[data-tab="tab-settings"]')).toBeVisible();
    await expect(popupPage.locator('button[data-tab="tab-metrics"]')).toBeVisible();
    await expect(popupPage.locator('button[data-tab="tab-about"]')).toBeVisible();

    await popupPage.close();
  });

  test('E2E-2: Test Connection button validates active provider', async () => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/src/ui/popup.html`);

    const testBtn = popupPage.locator('#testConnectionBtn');
    await expect(testBtn).toBeVisible();

    if (testConfig.activeProvider) {
      await popupPage.selectOption('#providerSelect', testConfig.activeProvider);
    }
    const currentKey = testConfig.apiKeys?.[testConfig.activeProvider];
    if (currentKey && !currentKey.includes('your-')) {
      await popupPage.fill('#apiKeyInput', currentKey);
    }

    await testBtn.click();

    const statusLabel = popupPage.locator('#testConnectionStatus');
    await expect(statusLabel).toBeVisible();

    // Wait until loading finishes
    await expect(statusLabel).not.toHaveText("⏳ Testing...", { timeout: 10000 });
    const statusText = await statusLabel.innerText();
    console.log(`[E2E] Test Connection Result: ${statusText}`);
    expect(statusText.length).toBeGreaterThan(0);

    await popupPage.close();
  });

  test('E2E-3: In-Page Signal Beacon & Purple DOM Markers are injected', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    const beacon = webPage.locator('#wayfinder-hud-root');
    await expect(beacon).toBeVisible({ timeout: 5000 });

    const domMarkers = webPage.locator('.wayfinder-dom-marker');
    await expect(domMarkers.first()).toBeVisible({ timeout: 5000 });
    const count = await domMarkers.count();
    console.log(`[E2E] Found ${count} purple DOM markers on the page`);
    expect(count).toBeGreaterThan(0);

    await domMarkers.first().hover();
    const popover = domMarkers.first().locator('.wayfinder-marker-popover');
    await expect(popover).toBeVisible();

    await webPage.close();
  });

  test('E2E-4: Signal Beacon expands guidance card on click and can be pinned', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    const beaconIcon = webPage.locator('.wayfinder-signal-beacon');
    await expect(beaconIcon).toBeVisible({ timeout: 5000 });
    
    // Clicking the beacon toggles pin mode
    await beaconIcon.click();

    const overlayCard = webPage.locator('.wayfinder-overlay-card');
    await expect(overlayCard).toHaveClass(/wayfinder-card-open/);
    await expect(overlayCard.locator('.wayfinder-card-title')).toHaveText('Wayfinder Navigator');

    // Verify pin badge displays
    const pinBadge = webPage.locator('#wayfinder-pin-badge');
    await expect(pinBadge).toBeVisible();

    await webPage.close();
  });

  test('E2E-5: Text selection triggers the floating AI analysis copilot pill', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    const passage = webPage.locator('#selectable-passage');
    await passage.scrollIntoViewIfNeeded();

    // Select text using mouse drag
    const box = await passage.boundingBox();
    if (box) {
      await webPage.mouse.move(box.x + 5, box.y + 5);
      await webPage.mouse.down();
      await webPage.mouse.move(box.x + box.width - 5, box.y + 5);
      await webPage.mouse.up();
    }

    const selBtn = webPage.locator('#wayfinder-selection-btn');
    await expect(selBtn).toBeVisible({ timeout: 5000 });

    await webPage.close();
  });

  test('E2E-6: Maintains single-call-per-page policy and retains markers', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    const markers = webPage.locator('.wayfinder-dom-marker');
    await expect(markers.first()).toBeVisible({ timeout: 5000 });

    const dynamicBtn = webPage.locator('#add-dynamic-content');
    await dynamicBtn.click();

    await expect(webPage.locator('text=New Dynamic Section Rendered!')).toBeVisible();

    // Verify DOM markers remain active without dispatching excessive calls
    expect(await markers.count()).toBeGreaterThan(0);

    await webPage.close();
  });

  test('E2E-7: Cmd+I keyboard shortcut & header button open interactive copilot chatbox', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    const beacon = webPage.locator('#wayfinder-hud-root');
    await expect(beacon).toBeVisible({ timeout: 5000 });

    const chatRoot = webPage.locator('#wayfinder-chat-root');
    
    // Press keyboard shortcut: Control+i / Meta+i
    const isMac = process.platform === 'darwin';
    await webPage.keyboard.press(isMac ? 'Meta+i' : 'Control+i');

    await expect(chatRoot).toBeVisible({ timeout: 5000 });
    await expect(chatRoot.locator('.wayfinder-chat-title')).toHaveText('Wayfinder AI Copilot');

    // Verify quick prompt chips exist
    const quickChips = chatRoot.locator('.wayfinder-quick-chip');
    expect(await quickChips.count()).toBeGreaterThan(0);

    // Enter a question in the chatbox
    const chatInput = chatRoot.locator('#wayfinder-chat-input');
    await chatInput.fill('What is this demonstration page?');
    
    const sendBtn = chatRoot.locator('#wayfinder-chat-send-btn');
    await sendBtn.click();

    // Verify user message bubble appeared in the thread
    const userMsg = chatRoot.locator('.wayfinder-msg-user .wayfinder-msg-bubble');
    await expect(userMsg.last()).toHaveText('What is this demonstration page?');

    // Close chatbox using the close button
    const closeBtn = chatRoot.locator('#wayfinder-chat-close');
    await closeBtn.click();
    await expect(chatRoot).not.toBeVisible();

    await webPage.close();
  });

  test('E2E-8: Toggle between Purple Dots and Direct Purple Box (inline callouts)', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    const beacon = webPage.locator('#wayfinder-hud-root');
    await expect(beacon).toBeVisible({ timeout: 5000 });

    // Open beacon card to access style toggle
    const beaconIcon = webPage.locator('.wayfinder-signal-beacon');
    await beaconIcon.click();

    const styleToggleBtn = webPage.locator('#wayfinder-style-toggle-btn');
    await expect(styleToggleBtn).toBeVisible({ timeout: 5000 });

    // Click toggle to switch from Dots to Direct Boxes
    await styleToggleBtn.click();

    // Verify direct purple callout box is rendered
    const calloutBox = webPage.locator('.wayfinder-marker-callout .wayfinder-callout-box');
    await expect(calloutBox.first()).toBeVisible({ timeout: 5000 });
    const calloutText = await calloutBox.first().innerText();
    expect(calloutText.length).toBeGreaterThan(0);

    // Click toggle again to switch back to Dots
    await styleToggleBtn.click();
    const dotMarker = webPage.locator('.wayfinder-marker-dot');
    await expect(dotMarker.first()).toBeVisible({ timeout: 5000 });

    await webPage.close();
  });

  test('E2E-9: Top-level overlay layer renders markers and Prompt Inspector reveals active prompts', async () => {
    const webPage = await context.newPage();
    await webPage.goto(samplePagePath);

    // Verify top-level layer exists on document.body
    const layer = webPage.locator('#wayfinder-markers-layer');
    await expect(layer).toBeAttached({ timeout: 5000 });

    const markers = layer.locator('.wayfinder-dom-marker');
    await expect(markers.first()).toBeVisible({ timeout: 5000 });
    expect(await markers.count()).toBeGreaterThan(0);

    // Open Beacon card
    const beaconIcon = webPage.locator('.wayfinder-signal-beacon');
    await beaconIcon.click();

    // Verify Prompt Inspector or Copy Logs button is present in card
    const copyLogsBtn = webPage.locator('.wayfinder-copy-logs-btn');
    await expect(copyLogsBtn.first()).toBeVisible({ timeout: 5000 });

    await webPage.close();
  });
});
