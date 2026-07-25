import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("security config contracts", () => {
  it("keeps a restrictive CSP and scoped FS permissions", () => {
    const tauriConf = JSON.parse(
      readFileSync(join(repoRoot, "src-tauri/tauri.conf.json"), "utf8"),
    ) as {
      app: { security: { csp: Record<string, string> | null } };
    };
    const csp = tauriConf.app.security.csp;
    expect(csp).not.toBeNull();
    expect(csp?.["default-src"]).toContain("'self'");
    expect(csp?.["object-src"]).toBe("'none'");
    expect(csp?.["frame-src"]).toBe("'none'");
    expect(csp?.["connect-src"]).toMatch(/ipc:/);
    expect(csp?.["script-src"]).not.toContain("*");

    const capabilities = JSON.parse(
      readFileSync(join(repoRoot, "src-tauri/capabilities/default.json"), "utf8"),
    ) as { permissions: Array<string | { identifier: string; allow?: Array<{ path: string }> }> };

    const fsRead = capabilities.permissions.find(
      (p) => typeof p === "object" && p.identifier === "fs:allow-read-file",
    );
    const fsWrite = capabilities.permissions.find(
      (p) => typeof p === "object" && p.identifier === "fs:allow-write-file",
    );
    expect(fsRead && typeof fsRead === "object").toBe(true);
    expect(fsWrite && typeof fsWrite === "object").toBe(true);
    if (typeof fsRead === "object" && typeof fsWrite === "object") {
      for (const entry of [...(fsRead.allow ?? []), ...(fsWrite.allow ?? [])]) {
        expect(entry.path).not.toBe("**");
      }
    }
  });
});
