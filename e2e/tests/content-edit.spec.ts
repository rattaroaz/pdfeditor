import { test, expect } from "@playwright/test";
import {
  waitForE2eBridge,
  openFixtureDocument,
  getInvokeLog,
  clearInvokeLog,
} from "../helpers/bridge";
import {
  addTextBlockOnPage,
  expectDocumentDirty,
  expectStatusMessage,
  saveDocumentFromMenu,
  switchToStandardMode,
  waitForPageReady,
} from "../helpers/ui";

test.describe("content edit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);
    await clearInvokeLog(page);
  });

  test("adds text in edit mode, previews in standard view, and saves", async ({ page }) => {
    const addedText = "E2E added text";
    await addTextBlockOnPage(page, addedText);
    await expectDocumentDirty(page, true);

    await switchToStandardMode(page);
    await expect(
      page.getByTestId("pdf-viewer").locator(".font-medium").filter({ hasText: addedText }),
    ).toBeVisible({ timeout: 10_000 });

    await saveDocumentFromMenu(page);
    await expectStatusMessage(page, "Saved");
    await expectDocumentDirty(page, false);

    const invokeLog = await getInvokeLog(page);
    expect(invokeLog).toContain("apply_content_edits");
    expect(invokeLog).toContain("save_pdf_with_annotations");
  });

  test("syncs typed text before leaving edit mode", async ({ page }) => {
    const addedText = "Live sync text";
    await addTextBlockOnPage(page, addedText);

    await switchToStandardMode(page);
    await expect(
      page.getByTestId("pdf-viewer").locator(".font-medium").filter({ hasText: addedText }),
    ).toBeVisible({ timeout: 10_000 });
    await expectDocumentDirty(page, true);
  });
});
