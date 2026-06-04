import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/** jsdom does not implement PromiseRejectionEvent (used by logging bootstrap tests). */
if (typeof globalThis.PromiseRejectionEvent === "undefined") {
  class PromiseRejectionEventPolyfill extends Event {
    readonly promise: Promise<unknown>;
    readonly reason: unknown;
    constructor(
      type: string,
      init: { promise: Promise<unknown>; reason: unknown },
    ) {
      super(type);
      this.promise = init.promise;
      this.reason = init.reason;
    }
  }
  globalThis.PromiseRejectionEvent =
    PromiseRejectionEventPolyfill as unknown as typeof PromiseRejectionEvent;
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
