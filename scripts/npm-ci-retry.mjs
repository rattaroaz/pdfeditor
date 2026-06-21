import { spawnSync } from "node:child_process";

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNpmCi() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npmCmd, ["ci", "--no-audit", "--fund=false"], {
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_fetch_retries: "5",
      npm_config_fetch_retry_mintimeout: "20000",
      npm_config_fetch_retry_maxtimeout: "120000",
    },
    shell: process.platform === "win32",
  });
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`npm ci attempt ${attempt}/${MAX_ATTEMPTS}`);
  const result = runNpmCi();
  if (result.status === 0) {
    process.exit(0);
  }

  const signal = result.signal ? ` signal ${result.signal}` : "";
  console.error(`npm ci failed with exit code ${result.status ?? "unknown"}${signal}`);

  if (attempt < MAX_ATTEMPTS) {
    console.warn(`Retrying in ${RETRY_DELAY_MS / 1000}s…`);
    await sleep(RETRY_DELAY_MS);
  }
}

process.exit(1);
