import { test, expect } from "@playwright/test";
import { waitForE2eBridge, getSessionLogs, openFixtureDocument } from "../helpers/bridge";
import { openDocumentFromMenu } from "../helpers/ui";

test.describe("open document", () => {
  test("opens fixture PDF from File menu", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);

    await openDocumentFromMenu(page);
    await expect(page.getByTestId("pdf-viewer")).toBeVisible({ timeout: 30_000 });

    const logs = await getSessionLogs(page);
    const openLogs = logs.filter((e) => e.context.userAction === "open");
    expect(openLogs.length).toBeGreaterThan(0);
  });

  test("bridge can open fixture without dialog", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await expect(page.getByTestId("pdf-viewer")).toBeVisible({ timeout: 30_000 });
  });
});
