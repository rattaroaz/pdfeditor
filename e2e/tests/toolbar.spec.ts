import { test, expect } from "@playwright/test";
import { waitForE2eBridge } from "../helpers/bridge";
import { dragToolbarItemBefore, getToolbarItemOrder } from "../helpers/ui";

const STORAGE_KEY = "pdfeditor.toolbarOrder";

test.describe("toolbar reorder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();
    await waitForE2eBridge(page);
  });

  test("persists reordered toolbar groups after reload", async ({ page }) => {
    const initial = await getToolbarItemOrder(page);
    expect(initial[0]).toBe("toolbar-modes");

    await dragToolbarItemBefore(page, "toolbar-sidebar", "toolbar-modes");

    const reordered = await getToolbarItemOrder(page);
    expect(reordered[0]).toBe("toolbar-sidebar");
    expect(reordered).not.toEqual(initial);

    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toContain("toolbar-sidebar");

    await page.reload();
    await waitForE2eBridge(page);

    const afterReload = await getToolbarItemOrder(page);
    expect(afterReload[0]).toBe("toolbar-sidebar");
  });
});
