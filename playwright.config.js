import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  retries: 0,
  workers: 1,
  use: {
    headless: false, // Chrome extensions in Manifest V3 require headful or new headless mode
    viewport: { width: 1280, height: 800 }
  }
});
