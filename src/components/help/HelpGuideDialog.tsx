import { useEffect, useRef } from "react";
import { APP_NAME } from "@/lib/constants";
import { HELP_SECTIONS, type HelpBlock } from "@/content/helpGuide";
import { useUiStore } from "@/stores/uiStore";

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="text-sm leading-relaxed text-zinc-300">{block.text}</p>;
    case "heading":
      return (
        <h3 className="mt-4 text-sm font-semibold text-zinc-100 first:mt-0">{block.text}</h3>
      );
    case "list":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-300">
          {block.items.map((item) => (
            <li key={item} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ul>
      );
    case "tip":
      return (
        <p className="rounded-md border border-sky-800/60 bg-sky-950/40 px-3 py-2 text-sm leading-relaxed text-sky-100">
          {block.text}
        </p>
      );
    case "comparison":
      return (
        <div className="overflow-x-auto rounded-md border border-zinc-700">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-800/80 text-zinc-200">
              <tr>
                {block.headers.map((header) => (
                  <th key={header} className="px-3 py-2 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index} className="border-t border-zinc-800">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="px-3 py-2 align-top text-zinc-300 leading-relaxed"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

export function HelpGuideDialog() {
  const showHelpGuide = useUiStore((s) => s.showHelpGuide);
  const helpSectionId = useUiStore((s) => s.helpSectionId);
  const closeHelpGuide = useUiStore((s) => s.closeHelpGuide);
  const openHelpGuide = useUiStore((s) => s.openHelpGuide);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    if (!showHelpGuide || !helpSectionId) return;
    const el = sectionRefs.current.get(helpSectionId);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "start" });
    }
  }, [showHelpGuide, helpSectionId]);

  if (!showHelpGuide) return null;

  return (
    <div
      data-testid="help-guide-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeHelpGuide();
      }}
    >
      <div
        role="dialog"
        aria-labelledby="help-guide-title"
        className="flex h-[min(85vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h2 id="help-guide-title" className="text-lg font-semibold text-zinc-100">
            {APP_NAME} — User Guide
          </h2>
          <button
            type="button"
            data-testid="help-guide-close"
            onClick={closeHelpGuide}
            className="rounded px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Guide sections"
            className="hidden w-52 shrink-0 overflow-y-auto border-r border-zinc-800 bg-zinc-950/50 p-2 sm:block"
          >
            {HELP_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                data-testid={`help-nav-${section.id}`}
                onClick={() => openHelpGuide(section.id)}
                className={`mb-0.5 block w-full rounded px-2 py-1.5 text-left text-xs leading-snug ${
                  helpSectionId === section.id
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="space-y-6">
              {HELP_SECTIONS.map((section) => (
                <section
                  key={section.id}
                  id={`help-section-${section.id}`}
                  data-testid={`help-section-${section.id}`}
                  ref={(node) => {
                    if (node) sectionRefs.current.set(section.id, node);
                    else sectionRefs.current.delete(section.id);
                  }}
                  className="scroll-mt-4 border-b border-zinc-800 pb-6 last:border-b-0"
                >
                  <h3 className="mb-3 text-base font-semibold text-zinc-100">{section.title}</h3>
                  <div className="space-y-3">
                    {section.blocks.map((block, index) => (
                      <HelpBlockView key={`${section.id}-${index}`} block={block} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
