import { test, expect } from "@playwright/test";
import { waitForE2eBridge, openFixtureDocument } from "../helpers/bridge";
import { openDocumentMenu, waitForPageReady } from "../helpers/ui";

test.describe("split PDF", () => {
  test("opens split dialog and blocks single-page documents", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await waitForPageReady(page);

    await openDocumentMenu(page);
    await page.getByTestId("menu-split-pdf").click({ force: true });

    const dialog = page.getByTestId("split-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/only one page/i)).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("split-dialog")).toBeHidden();
  });
});
