import { describe, expect, it } from "vitest";
import { fieldNameError, suggestUniqueFieldName } from "./formFieldName";

describe("formFieldName", () => {
  it("suggests Field 1, Field 2, …", () => {
    expect(suggestUniqueFieldName([])).toBe("Field 1");
    expect(suggestUniqueFieldName(["Field 1"])).toBe("Field 2");
    expect(suggestUniqueFieldName(["Field 1", "Field 2"])).toBe("Field 3");
  });

  it("skips taken names case-insensitively", () => {
    expect(suggestUniqueFieldName(["field 1"])).toBe("Field 2");
  });

  it("rejects duplicate names", () => {
    expect(fieldNameError("Field 2", ["Field 1", "Field 2"])).toBeTruthy();
    expect(fieldNameError("Field 2", ["Field 1", "Field 2"], "Field 2")).toBeNull();
  });
});
