import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useContentEditStore } from "@/stores/contentEditStore";
import { recordHistory } from "@/stores/historyStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUiStore } from "@/stores/uiStore";
import { findTextAtPoint } from "@/lib/pdf/pdfEngine";
import { encodeBase64Pdf } from "@/lib/pdf/pdfBinary";
import {
  computeTextEditBox,
  coverLayoutMinimums,
  boxHeightFromFontSize,
  DEFAULT_TEXT_FONT_SIZE,
  fontSizeFromBoxHeight,
  layoutCoverTextEdit,
  measureTextBoxFromTextarea,
  textBoxContentStyle,
} from "@/lib/textEditBox";

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

type ResizingImage = {
  id: string;
  originX: number;
  originY: number;
};

const MIN_DRAG_SIZE = 4;
const DRAG_THRESHOLD_PX = 5;

function syncTextBoxSize(
  edit: {
    fontSize: number;
    coverOld: boolean;
    coverWidth?: number;
    coverHeight?: number;
    oldText?: string;
  },
  el: HTMLTextAreaElement,
  scale: number,
  update: (patch: { width: number; height: number }) => void,
) {
  const { minWidth, minHeight } = coverLayoutMinimums(edit, el.value);
  update(
    measureTextBoxFromTextarea(el, edit.fontSize, scale, {
      coverOld: edit.coverOld,
      minWidth,
      minHeight,
    }),
  );
  el.scrollLeft = 0;
  el.scrollTop = 0;
}

export function ContentEditLayer({ pageIndex, scale }: ContentEditLayerProps) {
  const appMode = useUiStore((s) => s.appMode);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const addTextEdit = useContentEditStore((s) => s.addTextEdit);
  const addImageEdit = useContentEditStore((s) => s.addImageEdit);
  const updateTextEdit = useContentEditStore((s) => s.updateTextEdit);
  const updateTextEditContent = useContentEditStore((s) => s.updateTextEditContent);
  const updateTextEditLayout = useContentEditStore((s) => s.updateTextEditLayout);
  const removeTextEdit = useContentEditStore((s) => s.removeTextEdit);
  const updateTextEditPosition = useContentEditStore((s) => s.updateTextEditPosition);
  const updateImageEditPosition = useContentEditStore((s) => s.updateImageEditPosition);
  const updateImageEditSize = useContentEditStore((s) => s.updateImageEditSize);
  const textEdits = useContentEditStore((s) => s.textEdits);
  const imageEdits = useContentEditStore((s) => s.imageEdits);
  const pdfDoc = useDocumentStore((s) => s.pdfDoc);
  const rotation = useDocumentStore((s) => s.rotation);

  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [moving, setMoving] = useState<MovingEdit | null>(null);
  const [resizing, setResizing] = useState<ResizingImage | null>(null);
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

  const beginResize = (
    e: React.MouseEvent,
    id: string,
    originX: number,
    originY: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    recordHistory();
    setSelectedId(id);
    setResizing({ id, originX, originY });
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
    const existing = textEdits.find((e) => e.id === id);
    if (!trimmed) {
      removeTextEdit(id);
      if (selectedId === id) setSelectedId(null);
    } else {
      const { minWidth, minHeight } = coverLayoutMinimums(existing!, trimmed);
      const box = computeTextEditBox(trimmed, existing!.fontSize, {
        coverOld: existing!.coverOld,
        minWidth,
        minHeight: existing!.coverOld
          ? minHeight
          : Math.max(minHeight ?? 0, existing!.height),
      });
      updateTextEdit(id, {
        newText: trimmed,
        width: existing!.coverOld
          ? Math.max(existing!.coverWidth ?? 0, box.width)
          : box.width,
        height: box.height,
      });
      useDocumentStore.getState().setDirty(true);
    }
    setEditingId(null);
  };

  useEffect(() => {
    if (appMode === "edit" || !editingId) return;
    const edit = useContentEditStore.getState().textEdits.find((e) => e.id === editingId);
    if (!edit) {
      setEditingId(null);
      return;
    }
    finishEditing(editingId, edit.newText);
  }, [appMode, editingId]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizing) {
        const coords = localCoords(e);
        const width = Math.max(MIN_DRAG_SIZE, coords.x - resizing.originX);
        const height = Math.max(MIN_DRAG_SIZE, coords.y - resizing.originY);
        updateImageEditSize(resizing.id, width, height);
        return;
      }

      const pending = pendingDragRef.current;
      if (pending && !moving) {
        const dx = e.clientX - pending.startClientX;
        const dy = e.clientY - pending.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        recordHistory();
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
      if (resizing) {
        setResizing(null);
        useDocumentStore.getState().setDirty(true);
        return;
      }
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
  }, [moving, resizing, scale, updateTextEditPosition, updateImageEditPosition, updateImageEditSize]);

  if (appMode !== "edit") {
    if (appMode !== "document") return null;
    return (
      <div className="pointer-events-none absolute inset-0 z-[50]">
        {pageTextEdits
          .filter((edit) => edit.newText.trim() || edit.coverOld)
          .map((edit) => (
            <div
              key={edit.id}
              className="absolute overflow-hidden"
              style={{
                left: edit.x * scale,
                top: edit.y * scale,
                width: edit.width * scale,
                height: edit.height * scale,
                backgroundColor: edit.coverOld ? "#ffffff" : "transparent",
              }}
            >
              <div
                className="block whitespace-pre font-medium"
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  color: edit.color,
                  fontSize: edit.fontSize * scale,
                  ...textBoxContentStyle(edit.fontSize, scale),
                }}
              >
                {edit.newText}
              </div>
            </div>
          ))}
        {pageImageEdits.map((edit) => (
          <div
            key={edit.id}
            className="absolute"
            style={{
              left: edit.x * scale,
              top: edit.y * scale,
              width: edit.width * scale,
              height: edit.height * scale,
            }}
          >
            <img
              src={`data:${edit.mimeType};base64,${edit.imageBase64}`}
              alt=""
              draggable={false}
              className="block h-full w-full object-fill select-none"
            />
          </div>
        ))}
      </div>
    );
  }

  const placeTextBlock = (
    x: number,
    y: number,
    opts?: { fontSize?: number; width?: number },
  ) => {
    const fontSize = opts?.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
    const minBox = computeTextEditBox("", fontSize);
    const id = addTextEdit({
      pageIndex,
      x,
      y,
      width: Math.max(opts?.width ?? minBox.width, minBox.width),
      height: boxHeightFromFontSize(fontSize),
      newText: "",
      fontSize,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: false,
    });
    setSelectedId(id);
    setEditingId(id);
  };

  const finishRect = async (x1: number, y1: number, x2: number, y2: number) => {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);

    if (activeTool === "add-text-block") {
      if (width < MIN_DRAG_SIZE || height < MIN_DRAG_SIZE) {
        placeTextBlock(x1, y1);
      } else {
        const fontSize = fontSizeFromBoxHeight(height);
        placeTextBlock(x, y, { fontSize, width });
      }
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
      const id = addImageEdit({
        pageIndex,
        x,
        y,
        width,
        height,
        imageBase64: encodeBase64Pdf(bytes),
        mimeType,
      });
      setSelectedId(id);
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
      const { hasExtractableText, setStatusMessage } = useDocumentStore.getState();
      setStatusMessage(
        hasExtractableText === false
          ? "This PDF has no selectable text (likely scanned). Use Add text (T+) to place text on the page."
          : "No text here — click directly on existing letters.",
      );
      return;
    }

    const placed = layoutCoverTextEdit(hit.text, hit.fontSize, hit);
    const id = addTextEdit({
      pageIndex,
      x: placed.x,
      y: placed.y,
      width: placed.width,
      height: placed.height,
      oldText: hit.text,
      newText: hit.text,
      fontSize: hit.fontSize,
      fontFamily: "Helvetica",
      color: "#000000",
      coverOld: true,
      coverWidth: placed.width,
      coverHeight: placed.height,
    });
    setSelectedId(id);
    setEditingId(id);
    useDocumentStore.getState().setDirty(true);
  };

  const canPlaceNew = activeTool === "add-text-block" || activeTool === "add-image";

  return (
    <div
      ref={layerRef}
      className="absolute inset-0 z-[50]"
      title={
        activeTool === "add-text-block"
          ? "Click for default text size, or drag a box — height sets font size"
          : activeTool === "edit-text"
            ? "Click existing text to edit it"
            : undefined
      }
      style={{ pointerEvents: "auto", cursor: resizing ? "se-resize" : moving ? "grabbing" : undefined }}
      onMouseDown={(e) => {
        if (moving || resizing || editingId) return;
        if (activeTool === "edit-text") {
          void handleEditTextClick(e);
          return;
        }
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
        if (moving || resizing || !start || activeTool === "edit-text") return;
        const end = localCoords(e);
        void finishRect(start.x, start.y, end.x, end.y);
        setStart(null);
        setCurrent(null);
      }}
    >
      {pageTextEdits.map((edit) => {
        const isSelected = selectedId === edit.id;
        const isDragging = moving?.id === edit.id;
        const isEditing = editingId === edit.id;
        const replacing = edit.coverOld;
        return (
          <div
            key={edit.id}
            title={isEditing ? undefined : "Double-click to edit · drag to move"}
            className={`absolute overflow-hidden border border-dashed ${
              replacing
                ? "border-emerald-600 bg-white"
                : "border-emerald-500 bg-emerald-500/15"
            } ${isEditing ? "ring-2 ring-emerald-400" : ""} ${
              isDragging
                ? "cursor-grabbing ring-2 ring-emerald-400"
                : isEditing
                  ? ""
                  : "cursor-grab"
            } ${isSelected && !isDragging && !isEditing ? "ring-2 ring-emerald-300" : ""} ${
              !replacing && !isEditing && !isDragging ? "hover:bg-emerald-500/25" : ""
            }`}
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
                wrap="off"
                rows={1}
                defaultValue={edit.newText}
                className="block resize-none border-0 bg-white text-zinc-900 outline-none"
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: edit.fontSize * scale,
                  whiteSpace: "pre",
                  overflowWrap: "normal",
                  ...textBoxContentStyle(edit.fontSize, scale),
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onInput={(e) => {
                  const el = e.currentTarget;
                  updateTextEditContent(edit.id, el.value);
                  if (el.value.trim()) {
                    useDocumentStore.getState().setDirty(true);
                  }
                  flushSync(() => {
                    syncTextBoxSize(edit, el, scale, (patch) =>
                      updateTextEditLayout(edit.id, patch),
                    );
                  });
                }}
                onCompositionEnd={(e) => {
                  const el = e.currentTarget;
                  updateTextEditContent(edit.id, el.value);
                  if (el.value.trim()) {
                    useDocumentStore.getState().setDirty(true);
                  }
                  flushSync(() => {
                    syncTextBoxSize(edit, el, scale, (patch) =>
                      updateTextEditLayout(edit.id, patch),
                    );
                  });
                }}
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
                className={`block whitespace-pre font-medium select-none ${
                  replacing ? "text-zinc-900" : "text-emerald-900"
                }`}
                style={{
                  fontFamily: "Helvetica, Arial, sans-serif",
                  fontSize: edit.fontSize * scale,
                  ...textBoxContentStyle(edit.fontSize, scale),
                }}
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
        const isResizing = resizing?.id === edit.id;
        return (
          <div
            key={edit.id}
            title="Drag to move · grab corner to resize"
            className={`absolute overflow-visible border border-dashed border-purple-500 ${
              isDragging ? "cursor-grabbing ring-2 ring-purple-400" : "cursor-grab hover:ring-2 hover:ring-purple-300/60"
            } ${isSelected && !isDragging ? "ring-2 ring-purple-300" : ""} ${isResizing ? "ring-2 ring-purple-400" : ""}`}
            style={{
              left: edit.x * scale,
              top: edit.y * scale,
              width: edit.width * scale,
              height: edit.height * scale,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => beginMove(e, edit.id, "image", edit.x, edit.y)}
          >
            <img
              src={`data:${edit.mimeType};base64,${edit.imageBase64}`}
              alt=""
              draggable={false}
              className="pointer-events-none block h-full w-full object-fill select-none"
            />
            {(isSelected || isResizing) && (
              <div
                role="presentation"
                title="Resize"
                className="absolute -bottom-1 -right-1 z-10 h-3 w-3 cursor-se-resize border border-purple-700 bg-white shadow-sm"
                onMouseDown={(e) => beginResize(e, edit.id, edit.x, edit.y)}
              />
            )}
          </div>
        );
      })}
      {start && current && canPlaceNew && !moving && (
        <div
          className={`pointer-events-none absolute border ${
            activeTool === "add-text-block"
              ? "border-emerald-400 bg-emerald-400/10"
              : "border-blue-400 bg-blue-400/10"
          }`}
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
