/**
 * Validates a Tauri updater latest.json has Windows x64 and ARM64 NSIS entries.
 * Usage: node scripts/verify-latest-json.mjs <url-or-path>
 */
import { readFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/verify-latest-json.mjs <url-or-path>");
  process.exit(1);
}

async function loadJson() {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch latest.json (${response.status})`);
    }
    return response.json();
  }
  return JSON.parse(readFileSync(source, "utf8"));
}

const required = ["windows-x86_64-nsis", "windows-aarch64-nsis"];
const data = await loadJson();
const platforms = data?.platforms ?? {};
const missing = required.filter((key) => !platforms[key]?.url || !platforms[key]?.signature);

if (missing.length) {
  console.error(`latest.json is missing required platform entries: ${missing.join(", ")}`);
  console.error(`Found platforms: ${Object.keys(platforms).sort().join(", ") || "(none)"}`);
  process.exit(1);
}

console.log(`latest.json OK (version ${data.version}, platforms: ${Object.keys(platforms).sort().join(", ")})`);
