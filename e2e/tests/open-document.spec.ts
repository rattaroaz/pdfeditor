import { test, expect } from "@playwright/test";
import { waitForE2eBridge, getSessionLogs, openFixtureDocument } from "../helpers/bridge";
import { openDocumentFromMenu, waitForPageReady } from "../helpers/ui";

test.describe("open document", () => {
  test("opens fixture PDF from File menu", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);

    await openDocumentFromMenu(page);
    await waitForPageReady(page);

    const logs = await getSessionLogs(page);
    const opened = logs.some(
      (e) =>
        e.context.userAction === "open" ||
        e.message.toLowerCase().includes("document opened"),
    );
    expect(opened).toBe(true);
  });

  test("bridge can open fixture without dialog", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await expect(page.getByTestId("pdf-viewer")).toBeVisible({ timeout: 30_000 });
  });
});
