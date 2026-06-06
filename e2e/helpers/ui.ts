import { expect, type Page } from "@playwright/test";

/** Menus sit under the PDF canvas stack — use force click in E2E. */
const menuClick = { force: true as const };

export async function openFileMenu(page: Page): Promise<void> {
  await page.getByTestId("menu-file").click(menuClick);
}

export async function openViewMenu(page: Page): Promise<void> {
  await page.getByTestId("menu-view").click(menuClick);
}

export async function openDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-open").click(menuClick);
}

export async function saveDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-save").click(menuClick);
}

export async function revertDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-revert").click(menuClick);
}

export async function protectDocumentFromMenu(page: Page): Promise<void> {
  await openFileMenu(page);
  await page.getByTestId("menu-protect-password").click(menuClick);
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
