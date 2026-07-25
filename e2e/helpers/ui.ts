import { expect, type Page } from "@playwright/test";

/** Menus sit under the PDF canvas stack — use force click in E2E. */
const menuClick = { force: true as const };

export async function openFileMenu(page: Page): Promise<void> {
  await page.getByTestId("menu-file").click(menuClick);
}

export async function openViewMenu(page: Page): Promise<void> {
  await page.getByTestId("menu-view").click(menuClick);
}

export async function openHelpMenu(page: Page): Promise<void> {
  await page.getByTestId("menu-help").click(menuClick);
}

export async function openDocumentMenu(page: Page): Promise<void> {
  await page.getByTestId("menu-document").click(menuClick);
}

export async function openSearchFromMenu(page: Page): Promise<void> {
  await openViewMenu(page);
  await page.getByTestId("menu-find").click(menuClick);
  await page.getByTestId("search-bar").waitFor({ state: "visible", timeout: 10_000 });
}

export async function getToolbarItemOrder(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[data-toolbar-zone="toolbar"] [data-toolbar-id]'),
    ).map((el) => el.getAttribute("data-toolbar-id") ?? ""),
  );
}

export async function dragToolbarItemBefore(
  page: Page,
  dragId: string,
  beforeId: string,
): Promise<void> {
  const drag = page.locator(`[data-toolbar-id="${dragId}"]`);
  const target = page.locator(`[data-toolbar-id="${beforeId}"]`);
  const dragBox = await drag.boundingBox();
  const targetBox = await target.boundingBox();
  if (!dragBox || !targetBox) {
    throw new Error(`Toolbar drag targets not found: ${dragId} -> ${beforeId}`);
  }

  const startX = dragBox.x + 4;
  const startY = dragBox.y + dragBox.height / 2;
  const endX = targetBox.x + 2;
  const endY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const order = await getToolbarItemOrder(page);
      return order.indexOf(dragId) < order.indexOf(beforeId);
    }, { timeout: 10_000 })
    .toBe(true);
}

export async function openDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-open").click(menuClick);
  await waitForPageReady(page);
}

export async function saveDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-save").click(menuClick);
  // Save is async; wait so a later edit is not cleared when applySavedDocument runs.
  await expect(page.getByTestId("status-bar")).toContainText("Saved", { timeout: 15_000 });
}

export async function revertDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-revert").click(menuClick);
  await expectDocumentDirty(page, false);
}

export async function protectDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-protect-password").click(menuClick);
}

/** Fill the in-app PasswordDialog (replaces native window.prompt). */
export async function fillPasswordDialog(
  page: Page,
  password: string,
  confirm?: string,
): Promise<void> {
  const dialog = page.getByTestId("password-dialog");
  await dialog.waitFor({ state: "visible", timeout: 10_000 });
  await page.getByTestId("password-input").fill(password);
  if (confirm !== undefined) {
    await page.getByTestId("password-confirm-input").fill(confirm);
  }
  await page.getByTestId("password-submit").click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

export async function openLogPanel(page: Page): Promise<void> {
  await openViewMenu(page);
  const logMenu = page.getByTestId("menu-log-panel");
  await logMenu.waitFor({ state: "visible", timeout: 10_000 });
  await logMenu.click(menuClick);
  await page.getByTestId("log-viewer").waitFor({ state: "visible", timeout: 10_000 });
}

export async function waitForPageReady(page: Page, pageNumber = 1): Promise<void> {
  const pageEl = page.locator(`[data-page="${pageNumber}"]`);
  await pageEl.waitFor({ state: "visible", timeout: 30_000 });
  await expect(pageEl.getByText("Rendering…")).toBeHidden({ timeout: 30_000 });
}

export async function clickPageCenter(page: Page, pageNumber = 1): Promise<void> {
  const pageEl = page.locator(`[data-page="${pageNumber}"]`);
  const box = await pageEl.boundingBox();
  if (!box) throw new Error(`PDF page ${pageNumber} not found`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export async function switchToMarkupMode(page: Page): Promise<void> {
  await page.getByTestId("toolbar-mode-markup").click();
}

export async function switchToEditMode(page: Page): Promise<void> {
  await page.getByTestId("toolbar-mode-edit").click();
}

export async function switchToStandardMode(page: Page): Promise<void> {
  await page.getByTestId("toolbar-mode-document").click();
}

export async function addNoteOnPage(
  page: Page,
  text: string,
  pageNumber = 1,
): Promise<void> {
  await switchToMarkupMode(page);
  await page.getByTestId("tool-note").click();
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("prompt");
    await dialog.accept(text);
  });
  await clickPageCenter(page, pageNumber);
}

export async function addTextBlockOnPage(
  page: Page,
  text: string,
  pageNumber = 1,
): Promise<void> {
  await switchToEditMode(page);
  await page.getByTestId("tool-add-text-block").click();
  await clickPageCenter(page, pageNumber);
  const textarea = page.locator(`[data-page="${pageNumber}"] textarea`);
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill(text);
}

export async function expectDocumentDirty(page: Page, dirty: boolean): Promise<void> {
  const statusBar = page.getByTestId("status-bar");
  if (dirty) {
    await expect(statusBar).toContainText("*");
  } else {
    await expect(statusBar).not.toContainText("*");
  }
}

export async function expectStatusMessage(page: Page, message: string): Promise<void> {
  await expect(page.getByTestId("status-bar")).toContainText(message, { timeout: 15_000 });
}
