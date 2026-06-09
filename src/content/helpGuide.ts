export type HelpBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "tip"; text: string }
  | {
      type: "comparison";
      headers: [string, string, string];
      rows: [string, string, string][];
    };

export interface HelpSection {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: "overview",
    title: "Overview",
    blocks: [
      {
        type: "paragraph",
        text: "PDF Editor is a desktop app for opening, viewing, annotating, editing, and filling PDF documents. Work flows through four toolbar modes — Standard, Markup, Edit, and Forms — plus menus for file operations, document assembly, and view options.",
      },
      {
        type: "heading",
        text: "Typical workflow",
      },
      {
        type: "list",
        items: [
          "Open a PDF (File → Open, Ctrl+O, or drag a file onto the window).",
          "Choose a mode on the toolbar that matches your task.",
          "Make changes; use Undo (Ctrl+Z) if needed.",
          "Save (Ctrl+S) or Save As (Ctrl+Shift+S). Content edits, form values, page changes, and annotations are written when you save.",
        ],
      },
      {
        type: "tip",
        text: "Unsaved changes are tracked. Closing the window or choosing File → Revert to Saved will discard edits made since the last save.",
      },
    ],
  },
  {
    id: "adding-text",
    title: "Adding text: which tool?",
    blocks: [
      {
        type: "paragraph",
        text: "You can place text on a PDF in three different ways — Markup text boxes, Edit mode (change or add page content), and Forms text fields. They look similar on screen but behave very differently after saving.",
      },
      {
        type: "comparison",
        headers: ["Your goal", "Use this", "Use something else when…"],
        rows: [
          [
            "Leave a comment, label, or note for a reviewer",
            "Markup → Text box (T)",
            "You need to change the original document text (use Edit text) or collect typed answers from someone else (use Forms).",
          ],
          [
            "Fix a typo or reword existing paragraph text",
            "Edit → Edit text (✎), click the word, type",
            "The PDF is scanned with no selectable text (use Add text). You only want a non-destructive overlay (use Markup text box).",
          ],
          [
            "Add new wording on a scanned or image-only page",
            "Edit → Add text (T+), drag a box, type",
            "There is real text you can click and replace (use Edit text). You want a fillable field for a recipient (use Forms).",
          ],
          [
            "Build a form someone will fill in and return",
            "Forms → Text field (Tx), draw the field, set name in sidebar",
            "You are annotating for review (Markup) or permanently editing content yourself (Edit).",
          ],
          [
            "Stamp “Approved” or highlight contract language",
            "Markup → Stamp or Highlight",
            "You need the change baked into page content streams (Edit) or user-entered values (Forms).",
          ],
        ],
      },
      {
        type: "heading",
        text: "Quick decision guide",
      },
      {
        type: "list",
        items: [
          "Markup text sits on top of the page as an annotation. It is ideal for review comments and callouts. Enable File → Flatten markup on save if recipients should not edit annotations separately.",
          "Edit text rewrites the PDF’s own text layer when you save. Use it when the final PDF should read as if it were typeset that way originally.",
          "Add text (Edit mode) writes new text into the page content — best for scans, blanks, or extra lines you add yourself.",
          "Form text fields stay interactive until you flatten the form (Tools → Flatten form). Use them when multiple people will type answers into the same template.",
        ],
      },
    ],
  },
  {
    id: "toolbar-modes",
    title: "Toolbar modes",
    blocks: [
      {
        type: "heading",
        text: "Standard",
      },
      {
        type: "paragraph",
        text: "Browse and read PDFs without placing new objects. Use zoom, page navigation, the sidebar, and search. Switch here when you only need to view or present the file.",
      },
      {
        type: "heading",
        text: "Markup",
      },
      {
        type: "paragraph",
        text: "Add review annotations: highlights, underlines, strikeouts, sticky notes, freehand drawing, shapes, arrows, stamps, and text boxes. Annotations can be selected, moved, resized, and listed in the sidebar Marks tab.",
      },
      {
        type: "heading",
        text: "Edit",
      },
      {
        type: "paragraph",
        text: "Change page content: click existing text to replace it (Edit text), or draw a new text box (Add text). You can also place images. Changes become part of the PDF when saved — not separate annotation layers.",
      },
      {
        type: "heading",
        text: "Forms",
      },
      {
        type: "paragraph",
        text: "Create or fill interactive fields: text boxes, checkboxes, and dropdowns. The Forms sidebar tab lists fields, exports data, and supports CSV/XFDF import and export via the Tools menu.",
      },
    ],
  },
  {
    id: "markup-tools",
    title: "Markup tools",
    blocks: [
      {
        type: "paragraph",
        text: "Select a tool in the second toolbar row while Markup mode is active. Click or drag on the page to create an annotation; use Select (↖) to move or resize existing ones.",
      },
      {
        type: "list",
        items: [
          "Select (↖) — pick, move, resize, or delete annotations (Delete key).",
          "Hand (✋) — pan the page without selecting.",
          "Highlight / Underline / Strikeout — mark existing text; drag over words or click a line.",
          "Note (💬) — sticky comment icon; double-click or use the sidebar to read/edit comment text.",
          "Text box (T) — free-floating text overlay; choose font size/color in the property bar when selected.",
          "Draw (✏) — freehand ink paths.",
          "Rectangle / Ellipse / Line / Arrow — vector shapes for diagrams or emphasis.",
          "Stamp (🏷) — preset labels (Approved, Draft, Confidential, Not Approved); pick the stamp style when Stamp is active.",
        ],
      },
      {
        type: "tip",
        text: "File → Flatten markup on save merges annotations into the page so they print exactly as shown and cannot be edited as separate objects in other viewers.",
      },
    ],
  },
  {
    id: "edit-mode",
    title: "Edit mode",
    blocks: [
      {
        type: "heading",
        text: "Edit text (✎)",
      },
      {
        type: "paragraph",
        text: "Click a word in the PDF to edit that text run. Works when the document has an extractable text layer (most born-digital PDFs). Replacements are applied to the PDF content stream on save. If text reflows oddly on dense layouts, the app may show a warning banner — review the page before saving.",
      },
      {
        type: "heading",
        text: "Add text (T+)",
      },
      {
        type: "paragraph",
        text: "Drag a rectangle on the page and type. Use for scanned pages, filling blank lines, or adding paragraphs where no text exists to click. Resize handles adjust the box; vertical resize grows equally above and below the text.",
      },
      {
        type: "heading",
        text: "Add image (🖼)",
      },
      {
        type: "paragraph",
        text: "Place PNG, JPEG, or WebP images on the page. Useful for logos, signatures pasted as images, or diagrams. Image edits are saved into the PDF content like text edits.",
      },
      {
        type: "tip",
        text: "If Edit text is unavailable (banner: “no selectable text layer”), the PDF is likely scanned — use Add text instead of trying to click existing wording.",
      },
    ],
  },
  {
    id: "forms-mode",
    title: "Forms mode",
    blocks: [
      {
        type: "heading",
        text: "Fill (✓)",
      },
      {
        type: "paragraph",
        text: "Default tool for entering data into existing fields. Click text fields to type, checkboxes to toggle, dropdowns to choose an option.",
      },
      {
        type: "heading",
        text: "Creating fields",
      },
      {
        type: "list",
        items: [
          "Text field (Tx) — single-line or multi-line typed input; name each field in the Forms sidebar.",
          "Checkbox (☑) — on/off toggle; set export value if needed.",
          "Dropdown (▾) — list of choices; edit options from the field properties or options dialog.",
        ],
      },
      {
        type: "heading",
        text: "Tools menu (forms)",
      },
      {
        type: "list",
        items: [
          "Save form field values — writes current values into the PDF without flattening.",
          "Flatten form — converts fields to static text/shapes; recipients can no longer edit them.",
          "Export / Import form data (CSV) — bulk fill templates from spreadsheets.",
          "Export form data (XFDF) — interchange with other PDF tools that support XFDF.",
        ],
      },
      {
        type: "comparison",
        headers: ["Situation", "Use Forms", "Use Edit or Markup instead"],
        rows: [
          [
            "Job application others will fill online/offline",
            "Named form fields + export/import",
            "Edit Add text — not interactive for recipients.",
          ],
          [
            "One-time correction to printed text",
            "—",
            "Edit text — no need for a fillable field.",
          ],
          [
            "Reviewer note “fix spelling here”",
            "—",
            "Markup note or text box — not a form field.",
          ],
        ],
      },
    ],
  },
  {
    id: "file-menu",
    title: "File menu",
    blocks: [
      {
        type: "list",
        items: [
          "Open… — pick a PDF; password-protected files prompt for a password.",
          "Save — write all pending edits to the current file.",
          "Save As… — save to a new path.",
          "Close — close the document (prompts if unsaved).",
          "Flatten markup on save — when checked, annotations merge into page content on the next save.",
          "Protect with Password… — encrypt the PDF on next save (open password).",
          "Remove Password Protection — clears encryption on next save when the document is protected.",
          "Revert to Saved — reload the last saved version from disk; discards unsaved work.",
        ],
      },
    ],
  },
  {
    id: "document-menu",
    title: "Document menu & pages",
    blocks: [
      {
        type: "heading",
        text: "Document menu",
      },
      {
        type: "list",
        items: [
          "Merge PDFs — combine the open document with other PDFs into one new document.",
          "Append to current… — add another PDF’s pages to the end of the open file.",
          "Split PDF… — save page ranges as new files (also in sidebar Document tab).",
        ],
      },
      {
        type: "heading",
        text: "Sidebar → Pages tab",
      },
      {
        type: "list",
        items: [
          "Click a thumbnail to jump to that page.",
          "Ctrl+click to multi-select; Shift+click for a range.",
          "Drag the grip (⋮⋮) to reorder pages.",
          "+ Blank — insert a blank page after the selection.",
          "Extract — save selected pages as a new PDF.",
          "PNG — export one page as an image.",
          "Delete — remove selected pages (at least one page must remain).",
        ],
      },
      {
        type: "tip",
        text: "View → Rotate clockwise, or the toolbar ↺ / ↻ buttons, rotate the view for reading. View rotation is temporary and does not change the saved PDF.",
      },
    ],
  },
  {
    id: "view-search",
    title: "View & search",
    blocks: [
      {
        type: "heading",
        text: "View menu",
      },
      {
        type: "list",
        items: [
          "Find… (Ctrl+F) — search bar across document text and optionally comment text.",
          "Single page (default) / Two-page spread — switch reading layout (View menu shows the other mode when one is active).",
          "Show or hide sidebar — toggle the left panel; drag its right edge to resize.",
          "Bookmarks / outline — jump via the PDF outline tree (sidebar Outline tab).",
          "Rotate view — temporary on-screen rotation for reading.",
          "Presentation mode (F11) — fullscreen slide-style view; Esc to exit.",
          "Show logs — open the right-side log panel (session buffer and on-disk log file tail).",
        ],
      },
      {
        type: "heading",
        text: "Search bar options",
      },
      {
        type: "list",
        items: [
          "Match case / Whole words — tighten text matching.",
          "Comments — include markup note text and text-box content in results.",
          "Enter — next match; Shift+Enter — previous match.",
        ],
      },
    ],
  },
  {
    id: "sidebar",
    title: "Sidebar tabs",
    blocks: [
      {
        type: "list",
        items: [
          "Pages — thumbnails and page operations.",
          "Document — merge, append, and split controls.",
          "Marks — list of annotations; click to select on the page.",
          "Forms — field list, names, and field-focused actions.",
          "Outline — PDF bookmarks/table of contents.",
          "Recent — reopen files from history.",
          "Info — metadata (title, author, page count, file size).",
        ],
      },
    ],
  },
  {
    id: "undo-save",
    title: "Undo, redo & saving",
    blocks: [
      {
        type: "paragraph",
        text: "Undo (Ctrl+Z) and Redo (Ctrl+Y) cover annotations, content edits, form layout changes, and many page operations. Saving commits everything to disk: annotation layers (or flattened content), edited text streams, form field definitions and values, page order, and security settings.",
      },
      {
        type: "list",
        items: [
          "Markup annotations persist as PDF annotations unless flattened.",
          "Edit-mode text and images rewrite page content on save.",
          "Form values can be saved with Tools → Save form field values or with a normal Save.",
          "Password protection applies on the save after you choose Protect with Password.",
        ],
      },
    ],
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    blocks: [
      {
        type: "list",
        items: [
          "Ctrl+O — Open",
          "Ctrl+S — Save",
          "Ctrl+Shift+S — Save As",
          "Ctrl+Z — Undo",
          "Ctrl+Y or Ctrl+Shift+Z — Redo",
          "Ctrl+F — Find",
          "Ctrl+G — Go to page",
          "Ctrl++ / Ctrl+- / Ctrl+0 — Zoom in, out, reset",
          "Ctrl+A — Select all text on page (when not typing in a field)",
          "Ctrl+C — Copy selected text",
          "Page Up / Page Down — Previous / next page",
          "F11 — Presentation mode",
          "Esc — Exit presentation mode or close search bar",
          "Delete / Backspace — Delete selected annotation",
        ],
      },
    ],
  },
];

export const HELP_MENU_LINKS: { sectionId: string; label: string }[] = [
  { sectionId: "overview", label: "User Guide…" },
  { sectionId: "adding-text", label: "Adding text: which tool?" },
  { sectionId: "markup-tools", label: "Markup tools" },
  { sectionId: "edit-mode", label: "Edit mode" },
  { sectionId: "forms-mode", label: "Forms mode" },
  { sectionId: "shortcuts", label: "Keyboard shortcuts" },
];

export function getHelpSection(id: string): HelpSection | undefined {
  return HELP_SECTIONS.find((section) => section.id === id);
}
