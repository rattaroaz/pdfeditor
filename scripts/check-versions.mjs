import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function readText(path) {
  return readFileSync(join(root, path), "utf8");
}

function matchVersion(path, regex) {
  const match = readText(path).match(regex);
  if (!match?.[1]) throw new Error(`Could not read version from ${path}`);
  return match[1];
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ['package-lock.json packages[""]', packageLock.packages?.[""]?.version],
  ["src-tauri/Cargo.toml", matchVersion("src-tauri/Cargo.toml", /^version = "([^"]+)"/m)],
  [
    "src-tauri/Cargo.lock pdfeditor",
    matchVersion("src-tauri/Cargo.lock", /name = "pdfeditor"\s+version = "([^"]+)"/m),
  ],
  [
    "src-tauri/tauri.conf.json",
    readJson("src-tauri/tauri.conf.json").version,
  ],
]);

const expected = packageJson.version;
const mismatches = [...versions].filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error(`Version mismatch. Expected ${expected} everywhere:`);
  for (const [source, version] of mismatches) {
    console.error(`- ${source}: ${version ?? "<missing>"}`);
  }
  process.exit(1);
}

console.log(`Version contract OK (${expected})`);
