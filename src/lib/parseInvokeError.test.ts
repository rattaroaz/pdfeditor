import { describe, expect, it } from "vitest";
import { normalizeInvokeError } from "./parseInvokeError";

describe("normalizeInvokeError", () => {
  it("parses object errors", () => {
    const result = normalizeInvokeError({
      errorId: "abc",
      message: "failed",
      code: "IO_ERROR",
    });
    expect(result?.errorId).toBe("abc");
    expect(result?.message).toBe("failed");
  });

  it("parses JSON string errors", () => {
    const result = normalizeInvokeError(
      JSON.stringify({ errorId: "xyz", message: "bad pdf" }),
    );
    expect(result?.message).toBe("bad pdf");
  });

  it("wraps plain string errors", () => {
    const result = normalizeInvokeError("something broke");
    expect(result?.message).toBe("something broke");
  });
});
