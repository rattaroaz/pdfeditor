import { test, expect } from "@playwright/test";
import {
  waitForE2eBridge,
  openFixtureDocument,
  getInvokeLog,
  clearInvokeLog,
} from "../helpers/bridge";
import {
  addNoteOnPage,
  expectDocumentDirty,
  expectStatusMessage,
  saveDocumentFromMenu,
  waitForPageReady,
} from "../helpers/ui";

test.describe("save document", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);
    await clearInvokeLog(page);
  });

  test("saves a dirty document and clears the dirty marker", async ({ page }) => {
    await addNoteOnPage(page, "Save me");
    await expect(page.getByTitle("Save me")).toBeVisible({ timeout: 10_000 });
    await expectDocumentDirty(page, true);

    await saveDocumentFromMenu(page);
    await expectStatusMessage(page, "Saved");
    await expectDocumentDirty(page, false);

    const invokeLog = await getInvokeLog(page);
    expect(invokeLog).toContain("save_pdf_with_annotations");
    expect(invokeLog).toContain("save_annotations");
  });

  test("saves a clean document without pending edits", async ({ page }) => {
    await saveDocumentFromMenu(page);
    await expectStatusMessage(page, "Saved");

    const invokeLog = await getInvokeLog(page);
    expect(invokeLog.filter((c) => c === "save_pdf_with_annotations")).toHaveLength(1);
  });
});
