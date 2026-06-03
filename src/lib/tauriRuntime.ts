import { isTauri } from "@tauri-apps/api/core";

export function requireTauriDesktop(feature: string): void {
  if (!isTauri()) {
    throw new Error(
      `${feature} requires the desktop app. Run "npm run tauri dev" instead of the browser-only dev server.`,
    );
  }
}
