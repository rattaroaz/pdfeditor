import { beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "./logger";
import {
  appendLogEntry,
  clearLogBuffer,
  getLogEntries,
  subscribeLogBuffer,
} from "./buffer";
import type { LogEntry } from "@shared/types";

function makeEntry(message: string): LogEntry {
  return {
    id: message,
    timestamp: new Date().toISOString(),
    level: "info",
    message,
    sessionId: "test-session",
    context: { category: "app" },
  };
}

describe("log buffer", () => {
  beforeEach(() => {
    clearLogBuffer();
  });

  it("notifies subscribers when entries are appended", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLogBuffer(listener);

    log.app.info("hello", { userAction: "test" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLogEntries()).toHaveLength(1);

    unsubscribe();
    log.app.info("after unsubscribe", { userAction: "test" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLogEntries()).toHaveLength(2);
  });

  it("trims to the most recent 1000 entries", () => {
    for (let i = 0; i < 1005; i++) {
      appendLogEntry(makeEntry(`entry-${i}`));
    }
    const entries = getLogEntries();
    expect(entries).toHaveLength(1000);
    expect(entries[0]?.message).toBe("entry-5");
    expect(entries.at(-1)?.message).toBe("entry-1004");
  });

  it("clears entries and notifies subscribers", () => {
    const listener = vi.fn();
    subscribeLogBuffer(listener);
    appendLogEntry(makeEntry("one"));
    clearLogBuffer();
    expect(getLogEntries()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
