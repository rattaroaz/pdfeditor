import { test, expect } from "@playwright/test";
import {
  waitForE2eBridge,
  getSessionLogs,
  openFixtureDocument,
  openLogViewer,
  reportTestError,
  setFailNextCommand,
} from "../helpers/bridge";
import { openFileMenu } from "../helpers/ui";

test.describe("logging and errors", () => {
  test("error dialog errorId matches session log", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);

    const payload = await reportTestError(page);

    await expect(page.getByTestId("error-dialog")).toBeVisible();
    await expect(page.getByTestId("error-id")).toContainText(payload.errorId);

    const logs = await getSessionLogs(page);
    const match = logs.find(
      (e) => e.level === "error" && e.context.errorId === payload.errorId,
    );
    expect(match).toBeDefined();
    expect(match?.context.userAction).toBe("e2e_test_error");

    await page.getByTestId("error-dismiss").click();
    await expect(page.getByTestId("error-dialog")).toBeHidden();
  });

  test("log panel shows session entries after invoke", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await expect(page.getByTestId("pdf-viewer")).toBeVisible({ timeout: 30_000 });

    await openLogViewer(page);

    const invokeEntry = page.getByTestId("log-entry").filter({ hasText: /read_pdf_file|invoke/ });
    await expect(invokeEntry.first()).toBeVisible({ timeout: 15_000 });
  });

  test("forced invoke failure surfaces stable error id", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await expect(page.getByTestId("pdf-viewer")).toBeVisible({ timeout: 30_000 });

    await setFailNextCommand(page, "save_pdf_with_annotations");

    await openFileMenu(page);
    await page.getByTestId("menu-save").click({ force: true });

    await expect(page.getByTestId("error-dialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("error-id")).toContainText("e2e-forced-invoke-001");
    await page.getByTestId("error-dismiss").click();

    await openLogViewer(page);
    const failedInvoke = page
      .getByTestId("log-entry")
      .filter({ hasText: /invoke failed: save_pdf_with_annotations|save_pdf/ });
    await expect(failedInvoke.first()).toBeVisible({ timeout: 15_000 });
  });
});
