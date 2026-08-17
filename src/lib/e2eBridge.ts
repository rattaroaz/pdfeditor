import type { AppErrorPayload, LogEntry } from "@shared/types";
import { getLogEntries } from "@/lib/logging/buffer";
import { getMetricsSnapshot, type MetricsSnapshot } from "@/lib/logging/metrics";
import { reportError } from "@/lib/reportError";
import { openPdfFromPath } from "@/services/documentService";
import { useUiStore } from "@/stores/uiStore";

const E2E_PDF_PATH = "e2e://minimal.pdf";

export interface PdfEditorE2eBridge {
  readonly enabled: true;
  getLogEntries(): readonly LogEntry[];
  getMetricsSnapshot(): MetricsSnapshot;
  getInvokeLog(): readonly string[];
  clearInvokeLog(): void;
  reportTestError(message?: string): AppErrorPayload;
  openFixtureDocument(): Promise<void>;
  openLogViewer(): void;
  setFailNextCommand(command: string | null): void;
}

declare global {
  interface Window {
    __PDFEDITOR_E2E__?: PdfEditorE2eBridge;
  }
}

export function registerE2eBridge(): void {
  if (!import.meta.env.VITE_E2E) return;

  void import("../../e2e/mocks/invokeHandlers").then((handlers) => {
    window.__PDFEDITOR_E2E__ = {
      enabled: true,
      getLogEntries: () => getLogEntries(),
      getMetricsSnapshot,
      getInvokeLog: () => handlers.getE2eInvokeLog(),
      clearInvokeLog: () => handlers.clearE2eInvokeLog(),
      reportTestError: (message = "E2E test error") =>
        reportError(new Error(message), {
          category: "app",
          userAction: "e2e_test_error",
        }),
      openFixtureDocument: () => openPdfFromPath(E2E_PDF_PATH),
      openLogViewer: () => {
        if (!useUiStore.getState().showLogViewer) {
          useUiStore.getState().toggleLogViewer();
        }
      },
      setFailNextCommand: handlers.setFailNextCommand,
    };
  });
}
