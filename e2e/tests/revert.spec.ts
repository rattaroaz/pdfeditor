import { test, expect } from "@playwright/test";
import { waitForE2eBridge, openFixtureDocument } from "../helpers/bridge";
import {
  addNoteOnPage,
  expectDocumentDirty,
  revertDocumentFromMenu,
  saveDocumentFromMenu,
  waitForPageReady,
} from "../helpers/ui";

test.describe("revert document", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);
  });

  test("discards unsaved markup and restores the saved version", async ({ page }) => {
    await saveDocumentFromMenu(page);
    await expectDocumentDirty(page, false);

    await addNoteOnPage(page, "Temporary note");
    await expect(page.getByTitle("Temporary note")).toBeVisible({ timeout: 10_000 });
    await expectDocumentDirty(page, true);

    await revertDocumentFromMenu(page);
    await expect(page.getByTitle("Temporary note")).toBeHidden({ timeout: 15_000 });
    await expectDocumentDirty(page, false);
  });
});
