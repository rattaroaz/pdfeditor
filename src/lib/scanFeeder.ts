import type { ScannerDevice } from "@shared/types";

const FEEDER_NAME = /feeder|adf|document\s*feed/i;
const DEDICATED_FEEDER_NAME = /(?:\(|\s)rr-\d|receipt|epson\s*rr/i;

export function scannerLooksLikeFeeder(name: string): boolean {
  return FEEDER_NAME.test(name) || scannerLooksLikeDedicatedFeeder(name);
}

export function scannerLooksLikeDedicatedFeeder(name: string): boolean {
  return DEDICATED_FEEDER_NAME.test(name);
}

export function scannerNameStem(name: string): string {
  return name.replace(/[\s\-_]*(?:\(|\[)?(?:adf|feeder|document\s*feeder).*$/i, "").trim();
}

export function preferFeederDevice(
  scanners: ScannerDevice[],
  currentId = "",
): string | undefined {
  if (scanners.length === 0) return currentId || undefined;
  const current = scanners.find((scanner) => scanner.id === currentId);
  if (current && scannerLooksLikeDedicatedFeeder(current.name)) return current.id;

  const dedicated = scanners.find((scanner) => scannerLooksLikeDedicatedFeeder(scanner.name));
  if (dedicated) return dedicated.id;

  if (current && scannerLooksLikeFeeder(current.name)) return current.id;

  const stem = current ? scannerNameStem(current.name) : "";
  const matchingAdf = scanners.find(
    (scanner) =>
      scannerLooksLikeFeeder(scanner.name) &&
      (!stem || scanner.name.toLowerCase().includes(stem.toLowerCase())),
  );
  if (matchingAdf) return matchingAdf.id;

  const anyAdf = scanners.find((scanner) => scannerLooksLikeFeeder(scanner.name));
  return anyAdf?.id ?? (currentId || scanners[0]?.id);
}
