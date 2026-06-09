import { type ReactNode } from "react";

import { HELP_MENU_LINKS } from "@/content/helpGuide";
import { APP_VERSION } from "@/lib/constants";
import type { MenuBarMenuId } from "@/lib/menuBarOrder";
import {
  mergeIntoCurrentDocument,
  mergePdfFromDialog,
} from "@/services/assemblyService";
import {
  closeDocument,
  openPdfFromDialog,
  revertToSaved,
  savePdf,
} from "@/services/documentService";
import {
  applyFormChanges,
  exportFormDataCsv,
  exportFormDataFdfFile,
  flattenForms,
  importFormDataCsv,
} from "@/services/formService";
import { checkForUpdatesAndApply } from "@/services/updateService";
import {
  protectDocumentOnNextSave,
  removeDocumentPasswordProtection,
} from "@/services/securityService";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";

const MENU_LABELS = {
  file: "File",
  document: "Document",
  tools: "Tools",
  view: "View",
  help: "Help",
} as const;

const MENU_TEST_IDS: Partial<Record<keyof typeof MENU_LABELS, string>> = {
  file: "menu-file",
  view: "menu-view",
  help: "menu-help",
};

export function getMenuLabel(menuId: MenuBarMenuId): string {
  return MENU_LABELS[menuId];
}

export function getMenuTestId(menuId: MenuBarMenuId): string | undefined {
  return MENU_TEST_IDS[menuId];
}

function MenuItem({
  children,
  testId,
  onClick,
  disabled,
}: {
  children: ReactNode;
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

export function useMenuContent(onAction: () => void) {
  const hasDocument = useDocumentStore((s) => !!s.pdfDoc);
  const isPasswordProtected = useDocumentStore((s) => s.isPasswordProtected);
  const pendingSavePassword = useDocumentStore((s) => s.pendingSavePassword);
  const flattenOnSave = useUiStore((s) => s.flattenOnSave);
  const setFlattenOnSave = useUiStore((s) => s.setFlattenOnSave);
  const toggleSearch = useUiStore((s) => s.toggleSearch);
  const toggleLogViewer = useUiStore((s) => s.toggleLogViewer);
  const showLogViewer = useUiStore((s) => s.showLogViewer);
  const showSidebar = useDocumentStore((s) => s.showSidebar);
  const setShowSidebar = useDocumentStore((s) => s.setShowSidebar);
  const openHelpGuide = useUiStore((s) => s.openHelpGuide);

  const run = (action: () => void) => {
    action();
    onAction();
  };

  const renderMenuContent = (menuId: MenuBarMenuId): ReactNode => {
    switch (menuId) {
      case "file":
        return (
          <>
            <MenuItem testId="menu-open" onClick={() => run(() => void openPdfFromDialog())}>
              Open…
            </MenuItem>
            <MenuItem
              testId="menu-save"
              disabled={!hasDocument}
              onClick={() => run(() => void savePdf(false))}
            >
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
          </>
        );
      case "document":
        return (
          <>
            <MenuItem
              disabled={!hasDocument}
              onClick={() => run(() => void mergePdfFromDialog())}
            >
              Merge PDFs
            </MenuItem>
            <MenuItem
              disabled={!hasDocument}
              onClick={() => run(() => void mergeIntoCurrentDocument())}
            >
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
          </>
        );
      case "tools":
        return (
          <>
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
            <MenuItem
              disabled={!hasDocument}
              onClick={() => run(() => void exportFormDataFdfFile())}
            >
              Export form data (XFDF)…
            </MenuItem>
          </>
        );
      case "view":
        return (
          <>
            <MenuItem testId="menu-find" disabled={!hasDocument} onClick={() => run(toggleSearch)}>
              Find…
            </MenuItem>
            <div className="my-1 border-t border-zinc-700" />
            <MenuItem
              onClick={() => run(() => useDocumentStore.getState().setViewMode("continuous"))}
            >
              Continuous scroll
            </MenuItem>
            <MenuItem onClick={() => run(() => useDocumentStore.getState().setViewMode("single"))}>
              Single page
            </MenuItem>
            <MenuItem onClick={() => run(() => useDocumentStore.getState().setViewMode("spread"))}>
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
            <MenuItem onClick={() => run(() => useDocumentStore.getState().rotateClockwise())}>
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
            <MenuItem testId="menu-log-panel" onClick={() => run(toggleLogViewer)}>
              {showLogViewer ? "✓ Hide logs" : "Show logs"}
            </MenuItem>
          </>
        );
      case "help":
        return (
          <>
            {HELP_MENU_LINKS.map((link, index) => (
              <MenuItem
                key={link.sectionId}
                testId={index === 0 ? "menu-help-guide" : undefined}
                onClick={() => run(() => openHelpGuide(link.sectionId))}
              >
                {link.label}
              </MenuItem>
            ))}
            <div className="my-1 border-t border-zinc-700" />
            <MenuItem
              testId="menu-check-updates"
              onClick={() => run(() => void checkForUpdatesAndApply())}
            >
              Check for updates
            </MenuItem>
            <p
              data-testid="menu-help-version"
              className="border-t border-zinc-700 px-3 py-1.5 text-xs text-zinc-500"
            >
              Version {APP_VERSION}
            </p>
          </>
        );
      default:
        return null;
    }
  };

  return { renderMenuContent };
}
