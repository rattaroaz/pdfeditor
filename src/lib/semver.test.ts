import { describe, expect, it } from "vitest";
import { isVersionNewer, parseSemver } from "./semver";

describe("semver", () => {
  it("parses versions with or without a v prefix", () => {
    expect(parseSemver("1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseSemver("1.2")).toEqual([1, 2, 0]);
  });

  it("rejects invalid versions", () => {
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("abc")).toBeNull();
    expect(parseSemver("1")).toBeNull();
  });

  it("compares versions numerically", () => {
    expect(isVersionNewer("1.2.0", "1.1.9")).toBe(true);
    expect(isVersionNewer("1.1.1", "1.1.0")).toBe(true);
    expect(isVersionNewer("2.0.0", "1.9.9")).toBe(true);
    expect(isVersionNewer("1.1.0", "1.1.0")).toBe(false);
    expect(isVersionNewer("1.0.9", "1.1.0")).toBe(false);
    expect(isVersionNewer("v1.2.0", "1.1.0")).toBe(true);
  });
});
