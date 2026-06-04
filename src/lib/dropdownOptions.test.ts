import { describe, expect, it } from "vitest";
import { defaultDropdownOptions, resizeOptionList } from "./dropdownOptions";

describe("dropdownOptions", () => {
  it("creates default labels", () => {
    expect(defaultDropdownOptions(3)).toEqual(["Option 1", "Option 2", "Option 3"]);
  });

  it("preserves labels when shrinking", () => {
    expect(resizeOptionList(["A", "B", "C"], 2)).toEqual(["A", "B"]);
  });

  it("adds labels when growing", () => {
    expect(resizeOptionList(["A"], 3)).toEqual(["A", "Option 2", "Option 3"]);
  });
});
