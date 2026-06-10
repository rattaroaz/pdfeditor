import { test, expect } from "@playwright/test";
import { waitForE2eBridge, openFixtureDocument } from "../helpers/bridge";
import { openSearchFromMenu, waitForPageReady } from "../helpers/ui";

test.describe("search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);
  });

  test("finds text in the open document", async ({ page }) => {
    await openSearchFromMenu(page);
    await page.getByTestId("search-input").fill("Hello");

    await expect(page.getByTestId("search-match-count")).toContainText("1 / 1", {
      timeout: 10_000,
    });
  });

  test("reports no matches for unknown text", async ({ page }) => {
    await openSearchFromMenu(page);
    await page.getByTestId("search-input").fill("zzznomatch");

    await expect(page.getByTestId("search-match-count")).toContainText("No matches", {
      timeout: 10_000,
    });
  });
});
