/**
 * Wayfinder AI — Chrome Web Store Packaging Script
 * Bundles only production extension files into a clean .zip ready for Developer Dashboard upload.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const OUTPUT_ZIP = path.join(DIST_DIR, "wayfinder-ai-chrome-extension.zip");

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

if (fs.existsSync(OUTPUT_ZIP)) {
  fs.unlinkSync(OUTPUT_ZIP);
}

console.log("[Packaging] Building Wayfinder AI Chrome Web Store package...");

// Files and folders strictly required by Chrome
const includedFiles = [
  "manifest.json",
  "src",
  "icons",
  "LICENSE",
  "PRIVACY.md"
];

const cmd = `zip -r "${OUTPUT_ZIP}" ${includedFiles.join(" ")} -x "*.DS_Store" "*__tests__*" "*.spec.js*"`;

try {
  execSync(cmd, { cwd: ROOT_DIR, stdio: "inherit" });
  const stats = fs.statSync(OUTPUT_ZIP);
  const sizeKb = (stats.size / 1024).toFixed(1);
  console.log(`\n🎉 Success! Extension package created at:`);
  console.log(`   ${OUTPUT_ZIP} (${sizeKb} KB)`);
  console.log(`\nReady to upload to Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole\n`);
} catch (err) {
  console.error("Failed to build extension package:", err);
  process.exit(1);
}
