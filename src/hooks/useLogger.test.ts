import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { clearLogBuffer, getLogEntries } from "@/lib/logging";
import { useLogger } from "./useLogger";

describe("useLogger", () => {
  it("returns a stable scoped logger per component name", () => {
    clearLogBuffer();
    const { result, rerender } = renderHook(() => useLogger("TestPanel"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    result.current.info("hook test", { userAction: "test" });
    const entry = getLogEntries()[getLogEntries().length - 1];
    expect(entry?.context?.component).toBe("TestPanel");
    expect(entry?.context?.category).toBe("ui");
  });
});
