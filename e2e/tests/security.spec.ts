import { test, expect } from "@playwright/test";
import {
  waitForE2eBridge,
  openFixtureDocument,
  getInvokeLog,
  clearInvokeLog,
} from "../helpers/bridge";
import {
  expectDocumentDirty,
  expectStatusMessage,
  protectDocumentFromMenu,
  saveDocumentFromMenu,
  waitForPageReady,
} from "../helpers/ui";

test.describe("document security", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);
    await clearInvokeLog(page);
  });

  test("schedules password protection and applies it on save", async ({ page }) => {
    let promptCount = 0;
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") {
        promptCount += 1;
        await dialog.accept(promptCount === 1 ? "secret123" : "secret123");
        return;
      }
      await dialog.accept();
    });

    await protectDocumentFromMenu(page);
    await expectStatusMessage(page, "Password protection will be applied when you save");
    await expect(page.getByTestId("status-bar")).toContainText("Will protect on save");
    await expectDocumentDirty(page, true);

    await saveDocumentFromMenu(page);
    await expectStatusMessage(page, "Saved");

    const invokeLog = await getInvokeLog(page);
    expect(invokeLog).toContain("encrypt_pdf");
    expect(invokeLog).toContain("save_pdf_with_annotations");
    await expect(page.getByTestId("status-bar")).toContainText("Password protected");
  });
});
