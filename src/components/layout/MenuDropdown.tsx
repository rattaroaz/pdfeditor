import { useEffect, useRef, useState } from "react";

import {
  getMenuLabel,
  getMenuTestId,
  useMenuContent,
} from "@/components/layout/chromeMenuContent";
import type { MenuBarMenuId } from "@/lib/menuBarOrder";

export function MenuDropdown({ menuId }: { menuId: MenuBarMenuId }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { renderMenuContent } = useMenuContent(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div ref={rootRef} data-menu-id={menuId} className="relative">
      <button
        type="button"
        data-testid={getMenuTestId(menuId)}
        onClick={() => setOpen((current) => !current)}
        className={`rounded px-2 py-1 text-zinc-300 hover:bg-zinc-800 ${
          open ? "bg-zinc-800" : ""
        }`}
      >
        {getMenuLabel(menuId)}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 min-w-40 rounded border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {renderMenuContent(menuId)}
        </div>
      )}
    </div>
  );
}
