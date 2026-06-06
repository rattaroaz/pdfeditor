import { useEffect, useRef, useState } from "react";

import { closeDocument, openPdfFromDialog, savePdf, revertToSaved } from "@/services/documentService";
import {
  applyFormChanges,
  exportFormDataCsv,
  exportFormDataFdfFile,
  flattenForms,
  importFormDataCsv,
} from "@/services/formService";
import {
  mergeIntoCurrentDocument,
  mergePdfFromDialog,
} from "@/services/assemblyService";

import { useDocumentStore } from "@/stores/documentStore";

import { useUiStore } from "@/stores/uiStore";

import {
  protectDocumentOnNextSave,
  removeDocumentPasswordProtection,
} from "@/services/securityService";
import { isLogViewerEnabled } from "@/lib/logging";
import { openLogDirectory } from "@/services/loggingService";



export function MenuBar() {

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const navRef = useRef<HTMLElement>(null);

  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const isPasswordProtected = useDocumentStore((s) => s.isPasswordProtected);
  const pendingSavePassword = useDocumentStore((s) => s.pendingSavePassword);
  const flattenOnSave = useUiStore((s) => s.flattenOnSave);
  const setFlattenOnSave = useUiStore((s) => s.setFlattenOnSave);

  const toggleSearch = useUiStore((s) => s.toggleSearch);
  const toggleLogViewer = useUiStore((s) => s.toggleLogViewer);
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const setShowSidebar = useDocumentStore((s) => s.setShowSidebar);



  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (navRef.current?.contains(e.target as Node)) return;
      setOpenMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, []);

  const run = (action: () => void) => {
    action();
    setOpenMenu(null);
  };



  return (

    <nav ref={navRef} className="flex items-center gap-1 border-b border-zinc-700 bg-zinc-950 px-2 py-1 text-sm">

      <MenuDropdown

        label="File"

        menuTestId="menu-file"

        open={openMenu === "file"}

        onToggle={() => setOpenMenu((m) => (m === "file" ? null : "file"))}

      >

        <MenuItem testId="menu-open" onClick={() => run(() => void openPdfFromDialog())}>Open…</MenuItem>

        <MenuItem testId="menu-save" disabled={!hasDocument} onClick={() => run(() => void savePdf(false))}>

          Save

        </MenuItem>

        <MenuItem disabled={!hasDocument} onClick={() => run(() => void savePdf(true))}>

          Save As…

        </MenuItem>

        <MenuItem
          testId="menu-close"
          disabled={!hasDocument}
          onClick={() => run(() => void closeDocument())}
        >
          Close
        </MenuItem>

        <MenuItem
          disabled={!hasDocument}
          onClick={() => run(() => setFlattenOnSave(!flattenOnSave))}
        >
          {flattenOnSave ? "✓ Flatten markup on save" : "Flatten markup on save"}
        </MenuItem>

        <MenuItem
          testId="menu-protect-password"
          disabled={!hasDocument}
          onClick={() => run(protectDocumentOnNextSave)}
        >
          Protect with Password…
        </MenuItem>

        <MenuItem
          disabled={!hasDocument || (!isPasswordProtected && !pendingSavePassword)}
          onClick={() => run(() => void removeDocumentPasswordProtection())}
        >
          Remove Password Protection
        </MenuItem>

        <MenuItem
          testId="menu-revert"
          disabled={!hasDocument}
          onClick={() => run(() => void revertToSaved())}
        >
          Revert to Saved
        </MenuItem>

      </MenuDropdown>

      <MenuDropdown
        label="Document"
        open={openMenu === "document"}
        onToggle={() => setOpenMenu((m) => (m === "document" ? null : "document"))}
      >
        <MenuItem onClick={() => run(() => void mergePdfFromDialog())}>Merge PDFs…</MenuItem>
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void mergeIntoCurrentDocument())}>
          Append to current…
        </MenuItem>
        <MenuItem
          disabled={!hasDocument}
          onClick={() =>
            run(() => {
              useDocumentStore.getState().setSidebarTab("document");
              useUiStore.getState().openSplitDialog();
            })
          }
        >
          Split PDF…
        </MenuItem>
      </MenuDropdown>

      <MenuDropdown
        label="Tools"
        open={openMenu === "tools"}
        onToggle={() => setOpenMenu((m) => (m === "tools" ? null : "tools"))}
      >
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void applyFormChanges())}>
          Save form field values
        </MenuItem>
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void flattenForms())}>
          Flatten form
        </MenuItem>
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void exportFormDataCsv())}>
          Export form data (CSV)…
        </MenuItem>
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void importFormDataCsv())}>
          Import form data (CSV)…
        </MenuItem>
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void exportFormDataFdfFile())}>
          Export form data (XFDF)…
        </MenuItem>
      </MenuDropdown>

      <MenuDropdown

        label="View"

        menuTestId="menu-view"

        open={openMenu === "view"}

        onToggle={() => setOpenMenu((m) => (m === "view" ? null : "view"))}

      >

        <MenuItem testId="menu-find" disabled={!hasDocument} onClick={() => run(toggleSearch)}>

          Find…

        </MenuItem>

        <div className="my-1 border-t border-zinc-700" />

        <MenuItem

          onClick={() =>

            run(() => useDocumentStore.getState().setViewMode("continuous"))

          }

        >

          Continuous scroll

        </MenuItem>

        <MenuItem

          onClick={() => run(() => useDocumentStore.getState().setViewMode("single"))}

        >

          Single page

        </MenuItem>

        <MenuItem

          onClick={() => run(() => useDocumentStore.getState().setViewMode("spread"))}

        >

          Two-page spread

        </MenuItem>

        <MenuItem
          testId="menu-toggle-sidebar"
          onClick={() => run(() => setShowSidebar(!showSidebar))}
        >
          {showSidebar ? "✓ Hide sidebar" : "Show sidebar"}
        </MenuItem>

        <MenuItem

          onClick={() => run(() => useDocumentStore.getState().setSidebarTab("outline"))}

        >

          Bookmarks / outline

        </MenuItem>

        <MenuItem

          onClick={() => run(() => useDocumentStore.getState().rotateClockwise())}

        >

          Rotate clockwise

        </MenuItem>

        <MenuItem

          onClick={() => run(() => useDocumentStore.getState().rotateCounterClockwise())}

        >

          Rotate counter-clockwise

        </MenuItem>

        <MenuItem

          onClick={() => run(() => useDocumentStore.getState().togglePresentationMode())}

        >

          Presentation mode

        </MenuItem>

        <div className="my-1 border-t border-zinc-700" />

        {isLogViewerEnabled() && (
          <MenuItem testId="menu-log-panel" onClick={() => run(toggleLogViewer)}>View log panel</MenuItem>
        )}

        <MenuItem onClick={() => run(() => void openLogDirectory())}>Open log folder…</MenuItem>

      </MenuDropdown>

    </nav>

  );

}



function MenuDropdown({

  label,

  menuTestId,

  open,

  onToggle,

  children,

}: {

  label: string;

  menuTestId?: string;

  open: boolean;

  onToggle: () => void;

  children: React.ReactNode;

}) {

  return (

    <div className="relative">

      <button

        type="button"

        data-testid={menuTestId}

        onClick={onToggle}

        className={`rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 ${open ? "bg-zinc-800" : ""}`}

      >

        {label}

      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 min-w-40 rounded border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}

    </div>

  );

}



function MenuItem({

  children,

  testId,

  onClick,

  disabled,

}: {

  children: React.ReactNode;

  testId?: string;

  onClick?: () => void;

  disabled?: boolean;

}) {

  return (

    <button

      type="button"

      data-testid={testId}

      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onClick?.();
      }}
      className="block w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"

    >

      {children}

    </button>

  );

}

