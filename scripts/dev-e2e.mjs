import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

const env = {
  ...process.env,
  VITE_E2E: "true",
  VITE_ENABLE_LOG_VIEWER: "true",
  VITE_LOG_LEVEL: process.env.VITE_LOG_LEVEL ?? "debug",
};

const child = spawn("node", ["./node_modules/vite/bin/vite.js"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
