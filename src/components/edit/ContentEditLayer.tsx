import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { findTextAtPoint } from "@/lib/pdf/pdfEngine";

interface ContentEditLayerProps {
  pageIndex: number;
  scale: number;
}

type MovingEdit = {
  id: string;
  kind: "text" | "image";
  offsetX: number;
  offsetY: number;
};

const MIN_DRAG_SIZE = 4;
const DEFAULT_TEXT_WIDTH = 220;
const DEFAULT_TEXT_HEIGHT = 24;
const DRAG_THRESHOLD_PX = 5;

export function ContentEditLayer({ pageIndex, scale }: ContentEditLayerProps) {
  const appMode = useUiStore((s) => s.appMode);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const addTextEdit = useContentEditStore((s) => s.addTextEdit);
  const addImageEdit = useContentEditStore((s) => s.addImageEdit);
  const updateTextEdit = useContentEditStore((s) => s.updateTextEdit);
  const removeTextEdit = useContentEditStore((s) => s.removeTextEdit);
  const updateTextEditPosition = useContentEditStore((s) => s.updateTextEditPosition);
  const updateImageEditPosition = useContentEditStore((s) => s.updateImageEditPosition);
  const textEdits = useContentEditStore((s) => s.textEdits);
  const imageEdits = useContentEditStore((s) => s.imageEdits);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);

  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<MovingEdit | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const skipEditBlurRef = useRef(false);
  const pendingDragRef = useRef<
    (MovingEdit & { startClientX: number; startClientY: number }) | null
  >(null);

  const pageTextEdits = textEdits.filter((e) => e.pageIndex === pageIndex);
  const pageImageEdits = imageEdits.filter((e) => e.pageIndex === pageIndex);

  const localCoords = (e: { clientX: number; clientY: number }) => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const beginMove = (
    e: React.MouseEvent,
    id: string,
    kind: MovingEdit["kind"],
    originX: number,
    originY: number,
  ) => {
    if (editingId === id) return;
    e.stopPropagation();
    e.preventDefault();
    const coords = localCoords(e);
    pendingDragRef.current = {
      id,
      kind,
      offsetX: coords.x - originX,
      offsetY: coords.y - originY,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    setSelectedId(id);
  };

  const finishEditing = (id: string, text: string, opts?: { cancel?: boolean }) => {
    if (opts?.cancel) {
      const existing = textEdits.find((e) => e.id === id);
      if (existing && !existing.newText.trim()) {
        removeTextEdit(id);
        if (selectedId === id) setSelectedId(null);
      }
      setEditingId(null);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      removeTextEdit(id);
      if (selectedId === id) setSelectedId(null);
    } else {
      updateTextEdit(id, { newText: trimmed });
      useDocumentStore.getState().setDirty(true);
    }
    setEditingId(null);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pending = pendingDragRef.current;
      if (pending && !moving) {
        const dx = e.clientX - pending.startClientX;
        const dy = e.clientY - pending.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        setMoving({
          id: pending.id,
          kind: pending.kind,
          offsetX: pending.offsetX,
          offsetY: pending.offsetY,
        });
        pendingDragRef.current = null;
        return;
      }

      if (!moving) return;
      const coords = localCoords(e);
      const x = coords.x - moving.offsetX;
      const y = coords.y - moving.offsetY;
      if (moving.kind === "text") {
        updateTextEditPosition(moving.id, x, y);
      } else {
        updateImageEditPosition(moving.id, x, y);
      }
    };

    const onUp = () => {
      pendingDragRef.current = null;
      if (moving) {
        setMoving(null);
        useDocumentStore.getState().setDirty(true);
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [moving, scale, updateTextEditPosition, updateImageEditPosition]);

  if (appMode !== "edit") return null;

  const placeTextBlock = (x: number, y: number, width: number, height: number) => {
    const id = addTextEdit({
      pageIndex,
      x,
      y,
      width,
      height,
      newText: "",
      fontSize: 12,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: false,
    });
    setSelectedId(id);
    setEditingId(id);
  };

  const finishRect = async (x1: number, y1: number, x2: number, y2: number) => {
    let x = Math.min(x1, x2);
    let y = Math.min(y1, y2);
    let width = Math.abs(x2 - x1);
    let height = Math.abs(y2 - y1);

    if (activeTool === "add-text-block") {
      if (width < MIN_DRAG_SIZE || height < MIN_DRAG_SIZE) {
        width = DEFAULT_TEXT_WIDTH;
        height = DEFAULT_TEXT_HEIGHT;
        x = x1;
        y = y1;
      }
      placeTextBlock(x, y, width, height);
      return;
    }

    if (width < MIN_DRAG_SIZE || height < MIN_DRAG_SIZE) return;

    if (activeTool === "add-image") {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (!selected || Array.isArray(selected)) return;
      const bytes = await readFile(selected);
      const ext = selected.split(".").pop()?.toLowerCase() ?? "png";
      const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      const binary = bytes.reduce((acc, b) => acc + String.fromCharCode(b), "");
      addImageEdit({
        pageIndex,
        x,
        y,
        width,
        height,
        imageBase64: btoa(binary),
        mimeType,
      });
      useDocumentStore.getState().setDirty(true);
    }
  };

  const handleEditTextClick = async (e: React.MouseEvent) => {
    if (activeTool !== "edit-text" || !pdfDoc || moving) return;
    e.stopPropagation();
    const { x, y } = localCoords(e);
    const page = await pdfDoc.getPage(pageIndex + 1);
    const hit = await findTextAtPoint(page, x, y, rotation);
    if (!hit) {
      window.alert("Click on existing text to edit it, or use Add text (T+) to insert new text.");
      return;
    }
    const newText = window.prompt("Edit text:", hit.text);
    if (newText === null || newText === hit.text) return;
    addTextEdit({
      pageIndex,
      x: hit.x,
      y: hit.y,
      width: hit.width,
      height: hit.height,
      oldText: hit.text,
      newText,
      fontSize: hit.fontSize,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: true,
    });
    useDocumentStore.getState().setDirty(true);
  };

  const canPlaceNew = activeTool === "add-text-block" || activeTool === "add-image";

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-[25]"
      style={{ pointerEvents: "auto", cursor: moving ? "grabbing" : undefined }}
      onMouseDown={(e) => {
        if (moving || editingId || activeTool === "edit-text") return;
        if (canPlaceNew) {
          setSelectedId(null);
          setStart(localCoords(e));
          setCurrent(localCoords(e));
        }
      }}
      onMouseMove={(e) => {
        if (start && !moving) setCurrent(localCoords(e));
      }}
      onMouseUp={(e) => {
        if (moving || !start) return;
        const end = localCoords(e);
        void finishRect(start.x, start.y, end.x, end.y);
        setStart(null);
        setCurrent(null);
      }}
      onClick={(e) => {
        if (activeTool === "edit-text" && !moving) void handleEditTextClick(e);
      }}
    >
      {pageTextEdits.map((edit) => {
        const isSelected = selectedId === edit.id;
        const isDragging = moving?.id === edit.id;
        const isEditing = editingId === edit.id;
        return (
          <div
            key={edit.id}
            title={isEditing ? undefined : "Double-click to edit · drag to move"}
            className={`absolute overflow-hidden border border-dashed border-emerald-500 bg-emerald-500/15 ${
              isEditing ? "ring-2 ring-emerald-400" : ""
            } ${
              isDragging
                ? "cursor-grabbing ring-2 ring-emerald-400"
                : isEditing
                  ? ""
                  : "cursor-grab hover:bg-emerald-500/25"
            } ${isSelected && !isDragging && !isEditing ? "ring-2 ring-emerald-300" : ""}`}
            style={{
              left: edit.x * scale,
              top: edit.y * scale,
              width: edit.width * scale,
              height: edit.height * scale,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => beginMove(e, edit.id, "text", edit.x, edit.y)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              pendingDragRef.current = null;
              setSelectedId(edit.id);
              setEditingId(edit.id);
            }}
          >
            {isEditing ? (
              <textarea
                autoFocus
                defaultValue={edit.newText}
                className="h-full w-full resize-none border-0 bg-white p-1 text-zinc-900 outline-none"
                style={{ fontSize: edit.fontSize * scale, lineHeight: 1.2 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  if (skipEditBlurRef.current) {
                    skipEditBlurRef.current = false;
                    return;
                  }
                  finishEditing(edit.id, e.target.value);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") {
                    e.preventDefault();
                    skipEditBlurRef.current = true;
                    finishEditing(edit.id, edit.newText, { cancel: true });
                  }
                }}
              />
            ) : (
              <div
                className="flex h-full items-start px-1 font-medium text-emerald-900 select-none"
                style={{ fontSize: edit.fontSize * scale, lineHeight: 1.2 }}
              >
                {edit.newText || (
                  <span className="text-emerald-700/60 italic">Double-click to edit</span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {pageImageEdits.map((edit) => {
        const isSelected = selectedId === edit.id;
        const isDragging = moving?.id === edit.id;
        return (
          <div
            key={edit.id}
            title="Drag to move"
            className={`absolute border border-dashed border-purple-500 bg-purple-500/15 ${
              isDragging ? "cursor-grabbing ring-2 ring-purple-400" : "cursor-grab hover:bg-purple-500/25"
            } ${isSelected && !isDragging ? "ring-2 ring-purple-300" : ""}`}
            style={{
              left: edit.x * scale,
              top: edit.y * scale,
              width: edit.width * scale,
              height: edit.height * scale,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => beginMove(e, edit.id, "image", edit.x, edit.y)}
          />
        );
      })}
      {start && current && canPlaceNew && !moving && (
        <div
          className="pointer-events-none absolute border border-blue-400 bg-blue-400/10"
          style={{
            left: Math.min(start.x, current.x) * scale,
            top: Math.min(start.y, current.y) * scale,
            width: Math.abs(current.x - start.x) * scale,
            height: Math.abs(current.y - start.y) * scale,
          }}
        />
      )}
    </div>
  );
}
