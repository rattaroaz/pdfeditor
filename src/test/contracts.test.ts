import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("repo contract checks", () => {
  it("keeps version strings and invoke wiring in sync", () => {
    const result = spawnSync(process.execPath, [join(repoRoot, "scripts/check-contracts.mjs")], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
