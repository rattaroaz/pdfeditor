import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "./uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUiStore.setState({
      appMode: "markup",
      showErrorDialog: false,
      lastError: null,
      showLogViewer: false,
      showSearch: false,
      showSplitDialog: false,
    });
  });

  it("shows and dismisses errors", () => {
    useUiStore.getState().showError({
      errorId: "err-1",
      message: "Something failed",
      code: "PDF_ERROR",
    });
    expect(useUiStore.getState().showErrorDialog).toBe(true);
    expect(useUiStore.getState().lastError?.errorId).toBe("err-1");

    useUiStore.getState().dismissError();
    expect(useUiStore.getState().showErrorDialog).toBe(false);
  });

  it("toggles search and log viewer", () => {
    useUiStore.getState().toggleSearch();
    expect(useUiStore.getState().showSearch).toBe(true);
    useUiStore.getState().toggleLogViewer();
    expect(useUiStore.getState().showLogViewer).toBe(true);
  });

  it("switches app mode", () => {
    useUiStore.getState().setAppMode("forms");
    expect(useUiStore.getState().appMode).toBe("forms");
  });

  it("manages search and split dialog state", () => {
    useUiStore.getState().setSearchQuery("hello");
    expect(useUiStore.getState().searchQuery).toBe("hello");
    useUiStore.getState().setSearchMatches([{ pageIndex: 0, matchIndex: 0 }]);
    expect(useUiStore.getState().searchMatches).toHaveLength(1);
    useUiStore.getState().openSplitDialog();
    expect(useUiStore.getState().showSplitDialog).toBe(true);
    useUiStore.getState().closeSplitDialog();
    expect(useUiStore.getState().showSplitDialog).toBe(false);
    useUiStore.getState().setFlattenOnSave(true);
    expect(useUiStore.getState().flattenOnSave).toBe(true);
  });
});
