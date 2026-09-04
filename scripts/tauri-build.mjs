/**
 * Local `tauri build` wrapper.
 * - Default: skip updater signing (NSIS/MSI still build).
 * - Signed: set TAURI_SIGNING_PRIVATE_KEY + TAURI_SIGNING_PRIVATE_KEY_PASSWORD,
 *   or run with --signed (reads scripts/tauri-signing.key; password required in env).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
const keyPath = join(root, "scripts", "tauri-signing.key");

const signedFlag = process.argv.includes("--signed");
const extraArgs = process.argv.slice(2).filter((arg) => arg !== "--signed");

const env = { ...process.env };

// Clean up empty CARGO_TARGET_DIR (empty string is not unset, so delete it).
if (env.CARGO_TARGET_DIR === "") {
  delete env.CARGO_TARGET_DIR;
}

if (signedFlag) {
  if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(keyPath)) {
    env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, "utf8").trim();
  }
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    console.error(
      "Signed build: set TAURI_SIGNING_PRIVATE_KEY or place scripts/tauri-signing.key",
    );
    process.exit(1);
  }
  if (!env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
    console.error(
      "Signed build: set TAURI_SIGNING_PRIVATE_KEY_PASSWORD (your signing key password).",
    );
    process.exit(1);
  }
}

const hasSigningKey = Boolean(env.TAURI_SIGNING_PRIVATE_KEY?.trim());
const configArgs = hasSigningKey
  ? []
  : ["-c", JSON.stringify({ bundle: { createUpdaterArtifacts: false } })];

if (!hasSigningKey) {
  console.log(
    "No TAURI_SIGNING_PRIVATE_KEY — building installers without updater signatures.",
  );
  console.log(
    "For a signed release build: set signing env vars and run npm run build:win:signed",
  );
}

const result = spawnSync(
  process.execPath,
  [tauriCli, "build", ...configArgs, ...extraArgs],
  { stdio: "inherit", env, cwd: root },
);

process.exit(result.status ?? 1);
