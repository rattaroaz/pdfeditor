import { useEffect, useRef, useState } from "react";

import { openPdfFromDialog, savePdf, revertToSaved } from "@/services/documentService";
import { applyContentEdits } from "@/services/contentEditService";
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
  splitPdfByRanges,
} from "@/services/assemblyService";

import { useDocumentStore } from "@/stores/documentStore";

import { useUiStore } from "@/stores/uiStore";

import { useAnnotationStore } from "@/stores/annotationStore";

import { persistAnnotations } from "@/services/documentService";
import {
  protectDocumentOnNextSave,
  removeDocumentPasswordProtection,
} from "@/services/securityService";



export function MenuBar() {

  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const navRef = useRef<HTMLElement>(null);

  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const isPasswordProtected = useDocumentStore((s) => s.isPasswordProtected);
  const pendingSavePassword = useDocumentStore((s) => s.pendingSavePassword);
  const flattenOnSave = useUiStore((s) => s.flattenOnSave);
  const setFlattenOnSave = useUiStore((s) => s.setFlattenOnSave);

  const toggleSearch = useUiStore((s) => s.toggleSearch);

  const pastLength = useAnnotationStore((s) => s.past.length);
  const futureLength = useAnnotationStore((s) => s.future.length);



  useEffect(() => {

    const onPointerDown = (e: PointerEvent) => {

      if (!navRef.current?.contains(e.target as Node)) {

        setOpenMenu(null);

      }

    };

    window.addEventListener("pointerdown", onPointerDown);

    return () => window.removeEventListener("pointerdown", onPointerDown);

  }, []);



  const run = (action: () => void) => {

    setOpenMenu(null);

    action();

  };



  return (

    <nav ref={navRef} className="flex items-center gap-1 border-b border-zinc-700 bg-zinc-950 px-2 py-1 text-sm">

      <MenuDropdown

        label="File"

        open={openMenu === "file"}

        onToggle={() => setOpenMenu((m) => (m === "file" ? null : "file"))}

      >

        <MenuItem onClick={() => run(() => void openPdfFromDialog())}>Open…</MenuItem>

        <MenuItem disabled={!hasDocument} onClick={() => run(() => void savePdf(false))}>

          Save

        </MenuItem>

        <MenuItem disabled={!hasDocument} onClick={() => run(() => void savePdf(true))}>

          Save As…

        </MenuItem>

        <MenuItem
          disabled={!hasDocument}
          onClick={() => run(() => setFlattenOnSave(!flattenOnSave))}
        >
          {flattenOnSave ? "✓ Flatten markup on save" : "Flatten markup on save"}
        </MenuItem>

        <MenuItem disabled={!hasDocument} onClick={() => run(protectDocumentOnNextSave)}>
          Protect with Password…
        </MenuItem>

        <MenuItem
          disabled={!hasDocument || (!isPasswordProtected && !pendingSavePassword)}
          onClick={() => run(() => void removeDocumentPasswordProtection())}
        >
          Remove Password Protection
        </MenuItem>

        <MenuItem

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
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void splitPdfByRanges())}>
          Split by range…
        </MenuItem>
      </MenuDropdown>

      <MenuDropdown
        label="Tools"
        open={openMenu === "tools"}
        onToggle={() => setOpenMenu((m) => (m === "tools" ? null : "tools"))}
      >
        <MenuItem disabled={!hasDocument} onClick={() => run(() => void applyContentEdits())}>
          Apply content edits
        </MenuItem>
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

        label="Edit"

        open={openMenu === "edit"}

        onToggle={() => setOpenMenu((m) => (m === "edit" ? null : "edit"))}

      >

        <MenuItem

          disabled={pastLength === 0}

          onClick={() =>

            run(() => {

              useAnnotationStore.getState().undo();

              void persistAnnotations();

            })

          }

        >

          Undo

        </MenuItem>

        <MenuItem

          disabled={futureLength === 0}

          onClick={() =>

            run(() => {

              useAnnotationStore.getState().redo();

              void persistAnnotations();

            })

          }

        >

          Redo

        </MenuItem>

        <MenuItem disabled={!hasDocument} onClick={() => run(toggleSearch)}>

          Find…

        </MenuItem>

      </MenuDropdown>

      <MenuDropdown

        label="View"

        open={openMenu === "view"}

        onToggle={() => setOpenMenu((m) => (m === "view" ? null : "view"))}

      >

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

        <MenuItem onClick={() => run(() => useDocumentStore.getState().toggleSidebar())}>

          Toggle sidebar

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

      </MenuDropdown>

    </nav>

  );

}



function MenuDropdown({

  label,

  open,

  onToggle,

  children,

}: {

  label: string;

  open: boolean;

  onToggle: () => void;

  children: React.ReactNode;

}) {

  return (

    <div className="relative">

      <button

        type="button"

        onClick={onToggle}

        className={`rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 ${open ? "bg-zinc-800" : ""}`}

      >

        {label}

      </button>

      {open && (

        <div className="absolute left-0 top-full z-30 min-w-40 rounded border border-zinc-700 bg-zinc-900 py-1 shadow-lg">

          {children}

        </div>

      )}

    </div>

  );

}



function MenuItem({

  children,

  onClick,

  disabled,

}: {

  children: React.ReactNode;

  onClick?: () => void;

  disabled?: boolean;

}) {

  return (

    <button

      type="button"

      disabled={disabled}

      onClick={onClick}

      className="block w-full px-3 py-1.5 text-left text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"

    >

      {children}

    </button>

  );

}

