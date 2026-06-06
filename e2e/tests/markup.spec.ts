import { test, expect } from "@playwright/test";
import { waitForE2eBridge, openFixtureDocument } from "../helpers/bridge";
import { switchToMarkupMode, waitForPageReady } from "../helpers/ui";

test.describe("markup tools", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);
    await switchToMarkupMode(page);
  });

  test("selects highlight and strikeout tools", async ({ page }) => {
    await page.getByTestId("tool-highlight").click();
    await expect(page.getByTestId("tool-highlight")).toHaveClass(/bg-blue-600/);

    await page.getByTestId("tool-strikeout").click();
    await expect(page.getByTestId("tool-strikeout")).toHaveClass(/bg-blue-600/);
  });
});
