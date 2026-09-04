/**
 * Forwards to the Tauri CLI with a Windows-safe Cargo target dir.
 * Shared `src-tauri/target` plus rust-analyzer has produced rustc E0786
 * (corrupt .rmeta) and LNK1207 PDB failures on this machine.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriCli = join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

const env = { ...process.env };
if (process.platform === "win32") {
  env.CARGO_INCREMENTAL ??= "0";
  env.CARGO_TARGET_DIR ??= join(
    process.env.LOCALAPPDATA || homedir(),
    "pdfeditor-cargo-target",
  );
}

const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
