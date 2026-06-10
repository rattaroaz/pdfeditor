import { test, expect } from "@playwright/test";
import { waitForE2eBridge, getSessionLogs } from "../helpers/bridge";

test.describe("application boot", () => {
  test("loads shell and initializes logging", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("menu-file")).toBeVisible();

    await waitForE2eBridge(page);
    const logs = await getSessionLogs(page);
    const boot = logs.find(
      (e) => e.context.userAction === "boot" && e.message.includes("logging initialized"),
    );
    expect(boot).toBeDefined();
    expect(boot?.level).toBe("info");
  });
});
