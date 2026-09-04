import { renderPageToCanvas } from "@/lib/pdf/pdfEngine";
import { createErrorReporter, log } from "@/lib/logging";
import { useDocumentStore } from "@/stores/documentStore";
import type { PrintPageMode } from "@shared/types";

const showError = createErrorReporter("document", "print");

export interface PrintRange {
  mode: PrintPageMode;
  from?: number;
  to?: number;
}

export function resolvePrintPages(
  range: PrintRange,
  pageCount: number,
  currentPage: number,
): number[] {
  if (pageCount < 1) return [];
  if (range.mode === "current") {
    const page = Math.min(Math.max(1, currentPage), pageCount);
    return [page];
  }
  if (range.mode === "range") {
    const from = Math.min(Math.max(1, range.from ?? 1), pageCount);
    const to = Math.min(Math.max(from, range.to ?? pageCount), pageCount);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  return Array.from({ length: pageCount }, (_, i) => i + 1);
}

function waitForImages(doc: Document): Promise<void> {
  const images = [...doc.images];
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

export async function printDocument(range: PrintRange = { mode: "all" }): Promise<void> {
  const docStore = useDocumentStore.getState();
  const pdfDoc = docStore.pdfDoc;
  if (!pdfDoc) {
    showError(new Error("No document open to print"));
    return;
  }

  const pages = resolvePrintPages(range, pdfDoc.numPages, docStore.currentPage);
  if (pages.length === 0) {
    showError(new Error("No pages selected to print"));
    return;
  }

  docStore.setLoading(true);
  try {
    const pageHtml: string[] = [];
    for (const pageNumber of pages) {
      const page = await pdfDoc.getPage(pageNumber);
      const canvas = document.createElement("canvas");
      await renderPageToCanvas(page, canvas, 2, undefined, docStore.rotation);
      const viewport = page.getViewport({ scale: 1, rotation: docStore.rotation });
      const widthIn = viewport.width / 72;
      const heightIn = viewport.height / 72;
      pageHtml.push(
        `<div class="sheet" style="width:${widthIn}in;height:${heightIn}in"><img src="${canvas.toDataURL("image/jpeg", 0.92)}" alt="Page ${pageNumber}" /></div>`,
      );
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-testid", "print-frame");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument;
    const frameWin = iframe.contentWindow;
    if (!frameDoc || !frameWin) {
      iframe.remove();
      throw new Error("Could not open the print preview");
    }

    frameDoc.open();
    frameDoc.write(`<!DOCTYPE html>
<html>
<head>
  <title>${docStore.fileName || "Document"}</title>
  <style>
    @page { margin: 0; size: auto; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .sheet { page-break-after: always; page-break-inside: avoid; overflow: hidden; }
    .sheet:last-child { page-break-after: auto; }
    img { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>${pageHtml.join("")}</body>
</html>`);
    frameDoc.close();
    await waitForImages(frameDoc);

    await new Promise<void>((resolve) => {
      const cleanup = () => {
        iframe.remove();
        resolve();
      };
      frameWin.addEventListener("afterprint", cleanup, { once: true });
      window.setTimeout(cleanup, 120_000);
      frameWin.focus();
      frameWin.print();
    });

    log.document.info("Printed document", {
      userAction: "print",
      metadata: { pages: pages.length, mode: range.mode },
    });
    docStore.setStatusMessage(`Sent ${pages.length} page(s) to the printer`);
  } catch (err) {
    showError(err);
  } finally {
    docStore.setLoading(false);
  }
}
