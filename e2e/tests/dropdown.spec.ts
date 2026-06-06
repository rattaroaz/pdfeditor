import { test, expect } from "@playwright/test";
import { waitForE2eBridge, openFixtureDocument } from "../helpers/bridge";

test.describe("dropdown form fields", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForE2eBridge(page);
    await openFixtureDocument(page);
    await expect(page.getByTestId("pdf-viewer")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("toolbar-mode-forms").click();
    await page.getByTestId("tool-form-dropdown").click();
  });

  test("places, resizes, and keeps descender text visible", async ({ page }) => {
    const viewer = page.getByTestId("pdf-viewer");
    const box = await viewer.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await expect(page.getByTestId("dropdown-options-dialog")).toBeVisible();
    const dialog = page.getByTestId("dropdown-options-dialog");

    await dialog.getByTestId("dropdown-option-0").fill("gy");
    await dialog.getByTestId("dropdown-option-1").fill("jump");
    await dialog.getByTestId("dropdown-options-confirm").click();
    await expect(page.getByTestId("dropdown-options-dialog")).toBeHidden();

    const dropdown = page.locator('[aria-haspopup="listbox"]').first();
    await expect(dropdown).toHaveText("gy");

    const resizeHandle = page.getByTestId("form-field-resize-handle");
    await expect(resizeHandle).toBeVisible();
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!handleBox) return;

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 40, {
      steps: 8,
    });
    await page.mouse.up();

    const metrics = await dropdown.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        text: el.textContent ?? "",
        clientHeight: el.clientHeight,
        overflow: style.overflow,
        paddingBottom: style.paddingBottom,
        fontSize: style.fontSize,
      };
    });

    expect(metrics.text).toContain("gy");
    expect(metrics.overflow).toBe("hidden");
    expect(parseFloat(metrics.paddingBottom)).toBeGreaterThan(0);
    expect(parseFloat(metrics.fontSize)).toBeGreaterThan(12);

    await dropdown.click();
    const openOption = page.getByRole("button", { name: "jump" });
    await expect(openOption).toBeVisible();
    const optionMetrics = await openOption.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        paddingBottom: style.paddingBottom,
        overflow: style.overflow,
      };
    });
    expect(parseFloat(optionMetrics.paddingBottom)).toBeGreaterThan(0);
    expect(optionMetrics.overflow).toBe("hidden");
  });
});
