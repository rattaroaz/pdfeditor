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
  fillPasswordDialog,
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
    await protectDocumentFromMenu(page);
    await fillPasswordDialog(page, "secret123", "secret123");

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

  test("cancelling password dialog does not schedule protection", async ({ page }) => {
    await protectDocumentFromMenu(page);
    await page.getByTestId("password-dialog").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("password-cancel").click();
    await expect(page.getByTestId("password-dialog")).toBeHidden();
    await expect(page.getByTestId("status-bar")).not.toContainText("Will protect on save");
  });
});
