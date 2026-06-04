import type { Page } from "@playwright/test";

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

export async function openLogPanel(page: Page): Promise<void> {
  await openViewMenu(page);
  const logMenu = page.getByTestId("menu-log-panel");
  await logMenu.waitFor({ state: "visible", timeout: 10_000 });
  await logMenu.click(menuClick);
  await page.getByTestId("log-viewer").waitFor({ state: "visible", timeout: 10_000 });
}
