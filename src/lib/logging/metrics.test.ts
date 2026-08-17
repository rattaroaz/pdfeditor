import { beforeEach, describe, expect, it } from "vitest";
import { getMetricsSnapshot, recordMetric, resetMetrics } from "./metrics";

describe("metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  it("counts outcomes and duration stats", () => {
    recordMetric({ name: "open_pdf", durationMs: 10, outcome: "ok" });
    recordMetric({ name: "open_pdf", durationMs: 20, outcome: "ok" });
    recordMetric({ name: "open_pdf", durationMs: 40, outcome: "fail" });

    const snapshot = getMetricsSnapshot();
    expect(snapshot.totals).toEqual({ events: 3, ok: 2, fail: 1 });
    const open = snapshot.operations.find((op) => op.name === "open_pdf");
    expect(open).toMatchObject({
      count: 3,
      ok: 2,
      fail: 1,
      minMs: 10,
      maxMs: 40,
      lastDurationMs: 40,
    });
    expect(open?.avgMs).toBe(23);
    expect(open?.p95Ms).toBe(40);
  });

  it("ignores blank names and sorts by count", () => {
    recordMetric({ name: "  ", durationMs: 5, outcome: "ok" });
    recordMetric({ name: "save_pdf", durationMs: 8, outcome: "ok" });
    recordMetric({ name: "save_pdf", durationMs: 12, outcome: "ok" });
    recordMetric({ name: "open_pdf", durationMs: 3, outcome: "ok" });

    const names = getMetricsSnapshot().operations.map((op) => op.name);
    expect(names).toEqual(["save_pdf", "open_pdf"]);
  });
});
