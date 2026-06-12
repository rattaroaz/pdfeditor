import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const isE2e = process.env.VITE_E2E === "true";
const e2eMocks = path.resolve(__dirname, "./e2e/mocks");
const e2eTauriAliases = isE2e
  ? {
      "@tauri-apps/api/core": path.join(e2eMocks, "tauriCore.ts"),
      "@tauri-apps/api/window": path.join(e2eMocks, "tauriWindow.ts"),
      "@tauri-apps/plugin-dialog": path.join(e2eMocks, "tauriDialog.ts"),
      "@tauri-apps/plugin-opener": path.join(e2eMocks, "tauriOpener.ts"),
      "@tauri-apps/plugin-fs": path.join(e2eMocks, "tauriFs.ts"),
      "@tauri-apps/plugin-updater": path.join(e2eMocks, "tauriUpdater.ts"),
      "@tauri-apps/plugin-process": path.join(e2eMocks, "tauriProcess.ts"),
    }
  : {};

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  define: isE2e
    ? {
        "import.meta.env.VITE_E2E": JSON.stringify("true"),
        "import.meta.env.VITE_ENABLE_LOG_VIEWER": JSON.stringify("true"),
      }
    : undefined,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
      ...e2eTauriAliases,
    },
  },
  optimizeDeps: isE2e
    ? {
        exclude: [
          "@tauri-apps/api/core",
          "@tauri-apps/api/window",
          "@tauri-apps/plugin-dialog",
          "@tauri-apps/plugin-opener",
          "@tauri-apps/plugin-fs",
          "@tauri-apps/plugin-updater",
          "@tauri-apps/plugin-process",
        ],
      }
    : undefined,
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/main.tsx",
        "src/**/*.test.{ts,tsx}",
        "src/components/**",
      ],
      thresholds: {
        "src/lib/logging/**": {
          lines: 85,
          branches: 75,
          functions: 84,
          statements: 85,
        },
        "src/stores/**": {
          lines: 65,
          branches: 55,
          functions: 55,
          statements: 65,
        },
        "src/services/**": {
          lines: 55,
          branches: 50,
          functions: 55,
          statements: 55,
        },
      },
    },
  },
}));
