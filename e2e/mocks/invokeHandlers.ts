import type { AppErrorPayload } from "@shared/types";
import { E2E_PDF_PATH, MINIMAL_PDF_BASE64 } from "./fixturePdf";

const e2eLogLines: string[] = [];
const invokeLog: string[] = [];

let failNextCommand: string | null = null;

export function getE2eInvokeLog(): readonly string[] {
  return invokeLog;
}

export function clearE2eInvokeLog(): void {
  invokeLog.length = 0;
}

export function setFailNextCommand(command: string | null): void {
  failNextCommand = command;
}

export function getE2eBackendLogLines(): readonly string[] {
  return e2eLogLines;
}

function appError(message: string, code = "E2E_MOCK", errorId = "e2e-mock-error"): never {
  const payload: AppErrorPayload = { errorId, message, code };
  throw JSON.stringify(payload);
}

function takeFail(command: string): void {
  if (failNextCommand === command) {
    failNextCommand = null;
    appError(`E2E forced failure: ${command}`, "E2E_FORCED", "e2e-forced-invoke-001");
  }
}

export async function handleInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  takeFail(command);
  invokeLog.push(command);

  switch (command) {
    case "read_pdf_file": {
      const path = String(args?.path ?? "");
      if (path !== E2E_PDF_PATH) {
        appError(`E2E mock: unknown path ${path}`, "FILE_NOT_FOUND");
      }
      return { dataBase64: MINIMAL_PDF_BASE64 } as T;
    }
    case "prepare_document_bytes":
      return String(args?.pdfBase64 ?? MINIMAL_PDF_BASE64) as T;
    case "load_annotations":
      return null as T;
    case "get_pdf_info":
      return {
        metadata: {
          pageCount: 1,
          fileSize: Math.floor((MINIMAL_PDF_BASE64.length * 3) / 4),
          title: "E2E Minimal",
        },
      } as T;
    case "inspect_pdf_security":
      return { isEncrypted: false, requiresPassword: false } as T;
    case "inspect_pdf_forms":
      return { hasAcroform: false, hasXfa: false, fieldCount: 0 } as T;
    case "get_recent_files":
      return [] as T;
    case "log_frontend_event": {
      const level = String(args?.level ?? "info");
      const message = String(args?.message ?? "");
      e2eLogLines.push(`[${level}] ${message}`);
      if (e2eLogLines.length > 500) e2eLogLines.shift();
      return undefined as T;
    }
    case "get_logging_info":
      return {
        logDirectory: "/tmp/pdfeditor-e2e-logs",
        appVersion: "1.1.6-e2e",
        rustLogFilter: "info",
      } as T;
    case "read_recent_log_lines":
      return [...e2eLogLines].slice(-Number(args?.maxLines ?? 200)) as T;
    case "save_pdf_with_annotations":
      return {
        dataBase64: String(args?.pdfBase64 ?? MINIMAL_PDF_BASE64),
        path: String(args?.targetPath ?? E2E_PDF_PATH),
      } as T;
    case "save_annotations":
    case "write_pdf_file":
    case "add_recent_file":
      return undefined as T;
    case "apply_content_edits":
      return { dataBase64: String(args?.pdfBase64 ?? MINIMAL_PDF_BASE64) } as T;
    case "create_form_fields":
    case "apply_form_values":
    case "flatten_pdf_forms":
      return { dataBase64: String(args?.pdfBase64 ?? MINIMAL_PDF_BASE64) } as T;
    case "encrypt_pdf":
    case "decrypt_pdf":
      return { dataBase64: String(args?.pdfBase64 ?? MINIMAL_PDF_BASE64) } as T;
    default:
      console.warn(`[e2e-mock] unhandled invoke: ${command}`, args);
      return {} as T;
  }
}
