export type SemverTriple = readonly [major: number, minor: number, patch: number];

/** Parse `1.2.3` or `v1.2.3` into numeric parts. Returns null if invalid. */
export function parseSemver(version: string): SemverTriple | null {
  const trimmed = version.trim().replace(/^[vV]/, "");
  const core = trimmed.split("-")[0]?.split("+")[0] ?? "";
  const parts = core.split(".");
  if (parts.length < 2 || parts.length > 3) return null;

  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2] ?? "0");

  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }
  if (major < 0 || minor < 0 || patch < 0) return null;

  return [major, minor, patch];
}

/** True only when `candidate` is a strictly newer semver than `installed`. */
export function isVersionNewer(candidate: string, installed: string): boolean {
  const next = parseSemver(candidate);
  const current = parseSemver(installed);
  if (!next || !current) return false;

  if (next[0] !== current[0]) return next[0] > current[0];
  if (next[1] !== current[1]) return next[1] > current[1];
  return next[2] > current[2];
}
