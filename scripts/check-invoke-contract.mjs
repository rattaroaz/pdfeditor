import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function unique(values) {
  return [...new Set(values)].sort();
}

function collectFrontendInvokes() {
  const files = [
    "src/lib/logging/logger.ts",
    "src/lib/pdf/pdfStorage.ts",
    "src/services/assemblyService.ts",
    "src/services/contentEditService.ts",
    "src/services/documentService.ts",
    "src/services/formService.ts",
    "src/services/pageService.ts",
    "src/services/securityService.ts",
    "src/components/viewer/RecentFilesPanel.tsx",
  ];
  const commands = [];
  for (const file of files) {
    const text = read(file);
    commands.push(...[...text.matchAll(/invoke(?:Logged)?(?:<[^>]+>)?\(\s*"([^"]+)"/g)].map((m) => m[1]));
  }
  return unique(commands);
}

const rustCommands = unique(
  [...read("src-tauri/src/lib.rs").matchAll(/commands::([a-zA-Z0-9_]+)/g)].map((m) => m[1]),
);

const e2eCommands = unique(
  [...read("e2e/mocks/invokeHandlers.ts").matchAll(/case "([^"]+)":/g)].map((m) => m[1]),
);

const frontendCommands = collectFrontendInvokes();

const missingInRust = frontendCommands.filter((command) => !rustCommands.includes(command));
const missingInE2e = rustCommands.filter((command) => !e2eCommands.includes(command));

if (missingInRust.length || missingInE2e.length) {
  if (missingInRust.length) {
    console.error("Frontend invokes commands not registered by Rust:");
    for (const command of missingInRust) console.error(`- ${command}`);
  }
  if (missingInE2e.length) {
    console.error("Rust commands missing from E2E invoke mock:");
    for (const command of missingInE2e) console.error(`- ${command}`);
  }
  process.exit(1);
}

console.log(
  `Invoke contract OK (${rustCommands.length} Rust commands, ${frontendCommands.length} frontend call sites covered)`,
);
