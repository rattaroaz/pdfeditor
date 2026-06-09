import { test, expect } from "@playwright/test";
import { waitForE2eBridge, getSessionLogs } from "../helpers/bridge";
import { openHelpMenu } from "../helpers/ui";

test.describe("check for updates", () => {
  test("help menu shows up to date dialog and logs update check", async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);

    await openHelpMenu(page);
    await page.getByTestId("menu-check-updates").click({ force: true });

    await expect(page.getByRole("dialog")).toContainText("Up to date");
    await expect(page.getByText("PDF Editor is up to date")).toBeVisible();

    const logs = await getSessionLogs(page);
    expect(logs.some((entry) => entry.context?.category === "update")).toBe(true);
    expect(logs.some((entry) => entry.context?.userAction === "check_for_updates")).toBe(
      true,
    );

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
