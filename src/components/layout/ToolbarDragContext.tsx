import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import {
  findToolbarInsertBeforeId,
  reorderToolbarOrder,
  type ToolbarItemId,
} from "@/lib/toolbarOrder";
import { useUiStore } from "@/stores/uiStore";

const DRAG_THRESHOLD_PX = 5;

interface ToolbarDragContextValue {
  dragFrom: ToolbarItemId | null;
  dropBeforeId: ToolbarItemId | null;
  beginDrag: (itemId: ToolbarItemId, e: React.PointerEvent<HTMLElement>) => void;
}

const ToolbarDragContext = createContext<ToolbarDragContextValue | null>(null);

export function ToolbarDragProvider({ children }: { children: ReactNode }) {
  const toolbarOrder = useUiStore((s) => s.toolbarOrder);
  const setToolbarOrder = useUiStore((s) => s.setToolbarOrder);
  const dragFrom = useUiStore((s) => s.toolbarDragFrom);
  const dropBeforeId = useUiStore((s) => s.toolbarDropBeforeId);
  const setToolbarDragState = useUiStore((s) => s.setToolbarDragState);

  const dragStateRef = useRef<{
    itemId: ToolbarItemId;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
    captureEl: HTMLElement | null;
  } | null>(null);
  const dropBeforeRef = useRef<ToolbarItemId | null>(null);

  const releasePointerCapture = (el: HTMLElement | null, pointerId: number) => {
    if (el && typeof el.hasPointerCapture === "function" && el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  };

  const clearDrag = useCallback(() => {
    const drag = dragStateRef.current;
    releasePointerCapture(drag?.captureEl ?? null, drag?.pointerId ?? -1);
    dragStateRef.current = null;
    dropBeforeRef.current = null;
    setToolbarDragState({ dragFrom: null, dropBeforeId: null });
  }, [setToolbarDragState]);

  const updateDropTarget = useCallback(
    (clientX: number) => {
      const container = document.querySelector('[data-toolbar-zone="toolbar"]');
      if (!container) return;
      const beforeId = findToolbarInsertBeforeId(
        clientX,
        toolbarOrder,
        container as HTMLElement,
      );
      dropBeforeRef.current = beforeId;
      setToolbarDragState({ dropBeforeId: beforeId });
    },
    [setToolbarDragState, toolbarOrder],
  );

  const beginDrag = useCallback(
    (itemId: ToolbarItemId, e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      dragStateRef.current = {
        itemId,
        startX: e.clientX,
        startY: e.clientY,
        active: false,
        pointerId: e.pointerId,
        captureEl: e.currentTarget,
      };
      if (typeof e.currentTarget.setPointerCapture === "function") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;

      if (
        !drag.active &&
        Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX
      ) {
        drag.active = true;
        setToolbarDragState({ dragFrom: drag.itemId });
      }

      if (drag.active) {
        updateDropTarget(e.clientX);
      }
    };

    const onUp = () => {
      const drag = dragStateRef.current;
      if (drag?.active) {
        const next = reorderToolbarOrder(
          toolbarOrder,
          drag.itemId,
          dropBeforeRef.current,
        );
        if (next.join() !== toolbarOrder.join()) {
          setToolbarOrder(next);
        }
      }
      clearDrag();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [clearDrag, setToolbarOrder, setToolbarDragState, toolbarOrder, updateDropTarget]);

  return (
    <ToolbarDragContext.Provider value={{ dragFrom, dropBeforeId, beginDrag }}>
      {children}
    </ToolbarDragContext.Provider>
  );
}

function useToolbarDrag() {
  const context = useContext(ToolbarDragContext);
  if (!context) {
    throw new Error("useToolbarDrag must be used within ToolbarDragProvider");
  }
  return context;
}

export function DraggableToolbarItem({
  id,
  className = "",
  title = "Drag to reorder",
  children,
}: {
  id: ToolbarItemId;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const { beginDrag, dragFrom, dropBeforeId } = useToolbarDrag();
  const isDragging = dragFrom === id;
  const isDropTarget = dragFrom !== null && dragFrom !== id && dropBeforeId === id;

  return (
    <div
      data-toolbar-id={id}
      title={title}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement;
        if (target !== e.currentTarget && target.closest("button, input, select, textarea, a")) {
          return;
        }
        beginDrag(id, e);
      }}
      className={`rounded transition ${isDragging ? "opacity-50" : ""} ${
        isDropTarget ? "ring-1 ring-blue-500" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
