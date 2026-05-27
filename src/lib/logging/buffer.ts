import type { LogEntry } from "@shared/types";

const MAX_ENTRIES = 1000;

const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

export function appendLogEntry(entry: LogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
  for (const listener of listeners) {
    listener();
  }
}

export function getLogEntries(): readonly LogEntry[] {
  return entries;
}

export function clearLogBuffer(): void {
  entries.length = 0;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeLogBuffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
