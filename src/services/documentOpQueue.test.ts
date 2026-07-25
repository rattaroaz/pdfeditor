import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetDocumentOperationQueueForTests,
  runDocumentOperation,
} from "./documentOpQueue";

describe("documentOpQueue", () => {
  beforeEach(() => {
    __resetDocumentOperationQueueForTests();
  });

  afterEach(() => {
    __resetDocumentOperationQueueForTests();
  });

  it("serializes top-level operations in order", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runDocumentOperation("first", async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
      return 1;
    });
    const second = runDocumentOperation("second", async () => {
      order.push("second");
      return 2;
    });

    await Promise.resolve();
    expect(order).toEqual(["first-start"]);
    releaseFirst();
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  it("runs nested operations inline without waiting for the outer promise", async () => {
    const order: string[] = [];
    await runDocumentOperation("outer", async () => {
      order.push("outer-start");
      await runDocumentOperation("inner", async () => {
        order.push("inner");
        return "ok";
      });
      order.push("outer-end");
    });
    expect(order).toEqual(["outer-start", "inner", "outer-end"]);
  });

  it("continues the queue after a failed operation", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      runDocumentOperation("fail", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(
      runDocumentOperation("recover", async () => "recovered"),
    ).resolves.toBe("recovered");
    warnSpy.mockRestore();
  });
});
