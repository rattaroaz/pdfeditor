import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/** jsdom does not implement PointerEvent (toolbar drag and viewer pointer tests). */
if (typeof globalThis.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "";
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

if (
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.setPointerCapture !== "function"
) {
  HTMLElement.prototype.setPointerCapture = function setPointerCapture() {};
  HTMLElement.prototype.releasePointerCapture = function releasePointerCapture() {};
  HTMLElement.prototype.hasPointerCapture = function hasPointerCapture() {
    return false;
  };
}

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
  ask: vi.fn().mockResolvedValue(true),
  open: vi.fn(),
  save: vi.fn(),
}));
