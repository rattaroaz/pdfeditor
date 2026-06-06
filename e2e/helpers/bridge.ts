import type { Page } from "@playwright/test";
import type { LogEntry } from "@shared/types";

export async function waitForE2eBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__PDFEDITOR_E2E__?.enabled === true);
}

export async function getSessionLogs(page: Page): Promise<readonly LogEntry[]> {
  return page.evaluate(() => window.__PDFEDITOR_E2E__?.getLogEntries() ?? []);
}

export async function openFixtureDocument(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__PDFEDITOR_E2E__!.openFixtureDocument();
  });
}

export async function openLogViewer(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__PDFEDITOR_E2E__!.openLogViewer();
  });
  await page.getByTestId("log-viewer").waitFor({ state: "visible", timeout: 10_000 });
}

export async function reportTestError(
  page: Page,
  message = "E2E correlation check",
): Promise<{ errorId: string; message: string }> {
  return page.evaluate((msg) => window.__PDFEDITOR_E2E__!.reportTestError(msg), message);
}

export async function setFailNextCommand(page: Page, command: string): Promise<void> {
  await page.waitForFunction(() => typeof window.__PDFEDITOR_E2E__?.setFailNextCommand === "function");
  await page.evaluate((cmd) => {
    window.__PDFEDITOR_E2E__!.setFailNextCommand(cmd);
  }, command);
}

export async function getInvokeLog(page: Page): Promise<string[]> {
  return page.evaluate(() => [...(window.__PDFEDITOR_E2E__?.getInvokeLog() ?? [])]);
}

export async function clearInvokeLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__PDFEDITOR_E2E__?.clearInvokeLog();
  });
}
