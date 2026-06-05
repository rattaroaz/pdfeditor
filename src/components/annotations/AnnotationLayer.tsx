import { useState, useRef, useEffect } from "react";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
import { recordHistory } from "@/stores/historyStore";
import { hitTestAnnotation, MARKUP_COLOR, lineMarkupBandY, MARKUP_LINE_THICKNESS, normalizeMarkupRect } from "@/lib/annotationHitTest";
import { annotationBounds, type PdfBounds } from "@/lib/annotationBounds";
import {
  canResizeAnnotation,
  hitTestResizeHandle,
  moveAnnotation,
  resizeAnnotation,
  RESIZE_HANDLE_PX,
  stampSize,
} from "@/lib/annotationTransform";
import { persistAnnotations } from "@/services/documentService";
import type {
  FreehandAnnotation,
  NoteAnnotation,
  RectAnnotation,
  StampAnnotation,
  ShapeAnnotation,
  TextAnnotation,
  Annotation,
  Tool,
} from "@shared/types";

const SHAPE_TOOLS: Tool[] = ["rectangle", "ellipse", "line", "arrow"];
const DRAG_THRESHOLD_PX = 5;

type TransformSession = {
  id: string;
  kind: "move" | "resize";
  startPointer: { x: number; y: number };
  snapshot: Annotation;
  anchorBounds: PdfBounds;
};

const STAMP_LABELS: Record<StampAnnotation["stamp"], string> = {
  approved: "APPROVED",
  draft: "DRAFT",
  confidential: "CONFIDENTIAL",
  "not-approved": "NOT APPROVED",
};

interface Props {
  pageIndex: number;
  scale: number;
}

export function AnnotationLayer({ pageIndex, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const finishingDrawingRef = useRef(false);
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const appMode = useUiStore((s) => s.appMode);
  const annotations = useAnnotationStore((s) => s.annotations);
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const activeStamp = useAnnotationStore((s) => s.activeStamp);
  const selectedId = useAnnotationStore((s) => s.selectedId);
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const updateAnnotationLayout = useAnnotationStore((s) => s.updateAnnotationLayout);
  const [drawing, setDrawing] = useState(false);
  const [transform, setTransform] = useState<TransformSession | null>(null);
  const [selectCursor, setSelectCursor] = useState<string>("default");
  const pendingSelectDragRef = useRef<
    (TransformSession & { startClientX: number; startClientY: number }) | null
  >(null);
  const didDragRef = useRef(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);

  const paint = () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const drawRect = (
      r: { x: number; y: number; width: number; height: number },
      type: "highlight" | "underline" | "strikeout",
      color?: string,
    ) => {
      ctx.fillStyle =
        color ??
        (type === "highlight"
          ? "rgba(255, 235, 59, 0.4)"
          : type === "underline"
            ? "rgba(33, 150, 243, 0.5)"
            : "rgba(244, 67, 54, 0.5)");
      if (type === "highlight") {
        ctx.fillRect(r.x * scale, r.y * scale, r.width * scale, r.height * scale);
      } else {
        const bandY = lineMarkupBandY(r, type);
        ctx.fillRect(
          r.x * scale,
          bandY * scale,
          r.width * scale,
          MARKUP_LINE_THICKNESS * scale,
        );
      }
    };

    for (const ann of pageAnnotations) {
      if (
        ann.type === "highlight" ||
        ann.type === "underline" ||
        ann.type === "strikeout"
      ) {
        for (const r of (ann as RectAnnotation).rects) {
          drawRect(r, ann.type, ann.color ? `${ann.color}66` : undefined);
        }
      }
      if (ann.type === "freehand") {
        const fh = ann as FreehandAnnotation;
        if (fh.points.length < 2) continue;
        ctx.strokeStyle = fh.color;
        ctx.lineWidth = fh.strokeWidth * scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(fh.points[0].x * scale, fh.points[0].y * scale);
        for (let i = 1; i < fh.points.length; i++) {
          ctx.lineTo(fh.points[i].x * scale, fh.points[i].y * scale);
        }
        ctx.stroke();
      }
      if (ann.type === "note") {
        const note = ann as NoteAnnotation;
        ctx.fillStyle = "#FFC107";
        ctx.beginPath();
        ctx.arc(note.x * scale, note.y * scale, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ann.type === "stamp") {
        const stamp = ann as StampAnnotation;
        const label = STAMP_LABELS[stamp.stamp];
        const { width: sw, height: sh } = stampSize(stamp);
        ctx.font = `bold ${14 * scale}px sans-serif`;
        ctx.fillStyle = stamp.color || "#D32F2F";
        ctx.strokeStyle = stamp.color || "#D32F2F";
        ctx.lineWidth = 2 * scale;
        const x = stamp.x * scale;
        const y = stamp.y * scale;
        const w = sw * scale;
        const h = sh * scale;
        ctx.strokeRect(x, y, w, h);
        ctx.fillText(label, x + 8 * scale, y + 17 * scale);
        if (selectedId === ann.id) {
          ctx.strokeStyle = "#2196F3";
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        }
      }
      if (ann.type === "shape") {
        const shape = ann as ShapeAnnotation;
        const selected = selectedId === ann.id;
        drawShape(ctx, shape, scale, shape.color);
        if (selected) {
          drawSelectionOutline(ctx, shape, scale);
        }
      }
    }

    if (selectedId) {
      const selected = pageAnnotations.find((a) => a.id === selectedId);
      if (selected && selected.type !== "stamp" && selected.type !== "shape") {
        drawSelectionForAnnotation(ctx, selected, scale);
      }
      if (selected && canResizeAnnotation(selected)) {
        drawResizeHandle(ctx, selected, scale);
      }
    }

    if (drawing && start && current && SHAPE_TOOLS.includes(activeTool)) {
      drawShape(
        ctx,
        {
          type: "shape",
          shape:
            activeTool === "rectangle"
              ? "rectangle"
              : activeTool === "ellipse"
                ? "ellipse"
                : activeTool === "line"
                  ? "line"
                  : "arrow",
          x1: start.x,
          y1: start.y,
          x2: current.x,
          y2: current.y,
          strokeWidth: 2,
          color: "#2196F3",
        } as ShapeAnnotation,
        scale,
        "#2196F3",
      );
    }

    if (drawing && start && current && activeTool === "text") {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const width = Math.abs(current.x - start.x);
      const height = Math.abs(current.y - start.y);
      ctx.strokeStyle = "#2196F3";
      ctx.lineWidth = 1 * scale;
      ctx.strokeRect(x * scale, y * scale, width * scale, height * scale);
    }

    if (drawing && start && current && activeTool === "freehand" && points.length > 1) {
      ctx.strokeStyle = "#E91E63";
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(points[0].x * scale, points[0].y * scale);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * scale, points[i].y * scale);
      }
      ctx.stroke();
    }

    if (drawing && start && current && ["highlight", "underline", "strikeout"].includes(activeTool)) {
      const kind = activeTool as "highlight" | "underline" | "strikeout";
      const rect = normalizeMarkupRect(start, current, kind);
      if (rect) {
        drawRect(rect, kind);
      }
    }
  };

  function drawSelectionOutline(
    ctx: CanvasRenderingContext2D,
    shape: Pick<ShapeAnnotation, "shape" | "x1" | "y1" | "x2" | "y2">,
    scale: number,
  ) {
    ctx.save();
    ctx.strokeStyle = "#2196F3";
    ctx.lineWidth = 2;
    const x1 = shape.x1 * scale;
    const y1 = shape.y1 * scale;
    const x2 = shape.x2 * scale;
    const y2 = shape.y2 * scale;
    if (shape.shape === "rectangle") {
      ctx.strokeRect(
        Math.min(x1, x2) - 2,
        Math.min(y1, y2) - 2,
        Math.abs(x2 - x1) + 4,
        Math.abs(y2 - y1) + 4,
      );
    } else if (shape.shape === "ellipse") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        cy,
        Math.abs(x2 - x1) / 2 + 2,
        Math.abs(y2 - y1) / 2 + 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSelectionForAnnotation(
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    scale: number,
  ) {
    ctx.save();
    ctx.strokeStyle = "#2196F3";
    ctx.lineWidth = 2;
    if (ann.type === "highlight" || ann.type === "underline" || ann.type === "strikeout") {
      for (const r of (ann as RectAnnotation).rects) {
        ctx.strokeRect(
          r.x * scale - 2,
          r.y * scale - 2,
          r.width * scale + 4,
          r.height * scale + 4,
        );
      }
    } else if (ann.type === "freehand") {
      const fh = ann as FreehandAnnotation;
      if (fh.points.length < 2) return;
      let minX = fh.points[0].x;
      let minY = fh.points[0].y;
      let maxX = fh.points[0].x;
      let maxY = fh.points[0].y;
      for (const p of fh.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      ctx.strokeRect(
        minX * scale - 4,
        minY * scale - 4,
        (maxX - minX) * scale + 8,
        (maxY - minY) * scale + 8,
      );
    } else if (ann.type === "note") {
      const note = ann as NoteAnnotation;
      ctx.beginPath();
      ctx.arc(note.x * scale, note.y * scale, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ann.type === "text") {
      const text = ann as TextAnnotation;
      ctx.strokeRect(
        text.x * scale - 2,
        text.y * scale - 2,
        text.width * scale + 4,
        text.height * scale + 4,
      );
    }
    ctx.restore();
  }

  function drawResizeHandle(
    ctx: CanvasRenderingContext2D,
    ann: Annotation,
    scale: number,
  ) {
    const b = annotationBounds(ann);
    const hx = (b.x + b.width) * scale;
    const hy = (b.y + b.height) * scale;
    const s = RESIZE_HANDLE_PX;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#2196F3";
    ctx.lineWidth = 1;
    ctx.fillRect(hx - s / 2, hy - s / 2, s, s);
    ctx.strokeRect(hx - s / 2, hy - s / 2, s, s);
    ctx.restore();
  }

  function drawShape(
    ctx: CanvasRenderingContext2D,
    shape: Pick<ShapeAnnotation, "shape" | "x1" | "y1" | "x2" | "y2" | "strokeWidth">,
    scale: number,
    color: string,
  ) {
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}22`;
    ctx.lineWidth = shape.strokeWidth * scale;
    const x1 = shape.x1 * scale;
    const y1 = shape.y1 * scale;
    const x2 = shape.x2 * scale;
    const y2 = shape.y2 * scale;

    if (shape.shape === "rectangle") {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      ctx.strokeRect(x, y, Math.abs(x2 - x1), Math.abs(y2 - y1));
    } else if (shape.shape === "ellipse") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (shape.shape === "arrow") {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const len = 10 * scale;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - len * Math.cos(angle - Math.PI / 6),
          y2 - len * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
          x2 - len * Math.cos(angle + Math.PI / 6),
          y2 - len * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
  }

  useEffect(() => {
    paint();
  }, [pageAnnotations, scale, drawing, start, current, points, activeTool, selectedId, transform]);

  const hitTest = (x: number, y: number): Annotation | null =>
    hitTestAnnotation(annotations, pageIndex, x, y);

  const localCoords = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  useEffect(() => {
    if (activeTool !== "select") return;

    const onMove = (e: MouseEvent) => {
      const pt = localCoords(e);

      if (!transform && !pendingSelectDragRef.current) {
        const hit = hitTest(pt.x, pt.y);
        if (
          hit &&
          canResizeAnnotation(hit) &&
          hitTestResizeHandle(hit, pt.x, pt.y, scale)
        ) {
          setSelectCursor("nwse-resize");
        } else if (hit) {
          setSelectCursor("move");
        } else {
          setSelectCursor("default");
        }
      }

      const pending = pendingSelectDragRef.current;
      if (pending && !transform) {
        const dx = e.clientX - pending.startClientX;
        const dy = e.clientY - pending.startClientY;
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        recordHistory();
        const session: TransformSession = {
          id: pending.id,
          kind: pending.kind,
          startPointer: pending.startPointer,
          snapshot: pending.snapshot,
          anchorBounds: pending.anchorBounds,
        };
        pendingSelectDragRef.current = null;
        setTransform(session);
        const next =
          session.kind === "move"
            ? moveAnnotation(
                session.snapshot,
                pt.x - session.startPointer.x,
                pt.y - session.startPointer.y,
              )
            : resizeAnnotation(
                session.snapshot,
                session.anchorBounds,
                pt.x,
                pt.y,
              );
        updateAnnotationLayout(session.id, next);
        return;
      }

      if (!transform) return;
      const dx = pt.x - transform.startPointer.x;
      const dy = pt.y - transform.startPointer.y;
      const next =
        transform.kind === "move"
          ? moveAnnotation(transform.snapshot, dx, dy)
          : resizeAnnotation(
              transform.snapshot,
              transform.anchorBounds,
              pt.x,
              pt.y,
            );
      updateAnnotationLayout(transform.id, next);
    };

    const onUp = () => {
      pendingSelectDragRef.current = null;
      if (transform) {
        didDragRef.current = true;
        setTransform(null);
        void persistAnnotations();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    activeTool,
    pageAnnotations,
    scale,
    selectedId,
    transform,
    updateAnnotationLayout,
  ]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === "select") {
      e.preventDefault();
      e.stopPropagation();
      const pt = localCoords(e);
      const hit = hitTest(pt.x, pt.y);

      if (
        hit &&
        canResizeAnnotation(hit) &&
        hitTestResizeHandle(hit, pt.x, pt.y, scale)
      ) {
        recordHistory();
        setTransform({
          id: hit.id,
          kind: "resize",
          startPointer: pt,
          snapshot: hit,
          anchorBounds: annotationBounds(hit),
        });
        selectAnnotation(hit.id);
        return;
      }

      selectAnnotation(hit?.id ?? null);
      if (hit) {
        pendingSelectDragRef.current = {
          id: hit.id,
          kind: "move",
          startPointer: pt,
          snapshot: hit,
          anchorBounds: annotationBounds(hit),
          startClientX: e.clientX,
          startClientY: e.clientY,
        };
      }
      return;
    }
    if (activeTool === "hand") return;
    e.preventDefault();
    e.stopPropagation();
    const pt = localCoords(e);
    if (activeTool === "stamp") {
      addAnnotation({
        type: "stamp",
        pageIndex,
        author: "User",
        color: "#D32F2F",
        x: pt.x,
        y: pt.y,
        stamp: activeStamp,
      });
      void persistAnnotations();
      return;
    }
    setDrawing(true);
    setStart(pt);
    setCurrent(pt);
    if (activeTool === "freehand") setPoints([pt]);
    if (activeTool === "note") {
      void (async () => {
        const content = window.prompt("Note text:");
        if (content?.trim()) {
          addAnnotation({
            type: "note",
            pageIndex,
            author: "User",
            color: "#FFC107",
            x: pt.x,
            y: pt.y,
            content: content.trim(),
          });
          await persistAnnotations();
        }
        setDrawing(false);
        setStart(null);
        setCurrent(null);
      })();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeTool === "select") return;
    if (!drawing) return;
    const pt = localCoords(e);
    setCurrent(pt);
    if (activeTool === "freehand") {
      setPoints((prev) => [...prev, pt]);
    }
  };

  const finishRect = async (
    dragStart: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const type =
      activeTool === "highlight"
        ? "highlight"
        : activeTool === "underline"
          ? "underline"
          : "strikeout";

    const rect = normalizeMarkupRect(dragStart, end, type);
    if (!rect) return;

    addAnnotation({
      type,
      pageIndex,
      author: "User",
      color: MARKUP_COLOR[type],
      rects: [rect],
    });
    await persistAnnotations();
  };

  const finishTextBox = async (
    dragStart: { x: number; y: number },
    end: { x: number; y: number },
  ) => {
    const x = Math.min(dragStart.x, end.x);
    const y = Math.min(dragStart.y, end.y);
    const width = Math.abs(end.x - dragStart.x);
    const height = Math.abs(end.y - dragStart.y);
    if (width < 8 || height < 8) return;
    const content = window.prompt("Text box content:");
    if (!content?.trim()) return;
    addAnnotation({
      type: "text",
      pageIndex,
      author: "User",
      color: "#212121",
      x,
      y,
      width,
      height,
      content: content.trim(),
      fontSize: 12,
    });
    await persistAnnotations();
  };

  const finishShape = async (
    dragStart: { x: number; y: number },
    end: { x: number; y: number },
    tool: Tool,
  ) => {
    if (!SHAPE_TOOLS.includes(tool)) return;
    const dx = Math.abs(end.x - dragStart.x);
    const dy = Math.abs(end.y - dragStart.y);
    if (dx < 4 && dy < 4) return;
    const shapeKind =
      tool === "rectangle"
        ? "rectangle"
        : tool === "ellipse"
          ? "ellipse"
          : tool === "line"
            ? "line"
            : "arrow";
    addAnnotation({
      type: "shape",
      shape: shapeKind,
      pageIndex,
      author: "User",
      color: "#2196F3",
      x1: dragStart.x,
      y1: dragStart.y,
      x2: end.x,
      y2: end.y,
      strokeWidth: 2,
    });
    await persistAnnotations();
  };

  const finishDrawingAt = async (end: { x: number; y: number }) => {
    if (!drawing || activeTool === "note" || finishingDrawingRef.current || !start) return;

    finishingDrawingRef.current = true;
    const dragStart = start;
    const dragPoints = points;
    const tool = activeTool;

    setDrawing(false);
    setStart(null);
    setCurrent(null);
    setPoints([]);

    try {
      if (tool === "freehand" && dragPoints.length > 1) {
        addAnnotation({
          type: "freehand",
          pageIndex,
          author: "User",
          color: "#E91E63",
          points: dragPoints,
          strokeWidth: 2,
        });
        await persistAnnotations();
      } else if (["highlight", "underline", "strikeout"].includes(tool)) {
        await finishRect(dragStart, end);
      } else if (tool === "text") {
        await finishTextBox(dragStart, end);
      } else if (SHAPE_TOOLS.includes(tool)) {
        await finishShape(dragStart, end, tool);
      }
    } finally {
      finishingDrawingRef.current = false;
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (activeTool === "select") return;
    await finishDrawingAt(localCoords(e));
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (activeTool !== "select") return;
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const pt = localCoords(e);
    const hit = hitTest(pt.x, pt.y);
    if (hit) {
      removeAnnotation(hit.id);
      void persistAnnotations();
    }
  };

  const drawingMode =
    appMode === "markup" && activeTool !== "hand" && activeTool !== "select";
  const selectMode = appMode === "markup" && activeTool === "select";
  const layerInteractive = appMode === "markup" && activeTool !== "hand";

  if (appMode !== "markup") {
    return (
      <div ref={containerRef} className="pointer-events-none absolute inset-0">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[40]"
      style={{
        pointerEvents: layerInteractive ? "auto" : "none",
        cursor: selectMode ? selectCursor : drawingMode ? "crosshair" : undefined,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onMouseLeave={() => {
        if (activeTool === "select") return;
        if (drawing && start && current && !finishingDrawingRef.current) {
          void finishDrawingAt(current);
          return;
        }
        setDrawing(false);
        setStart(null);
        setCurrent(null);
        setPoints([]);
      }}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full touch-none"
      />
      {pageAnnotations
        .filter((a) => a.type === "note")
        .map((ann) => {
          const note = ann as NoteAnnotation;
          return (
            <div
              key={ann.id}
              title={note.content}
              className={`pointer-events-none absolute max-w-48 truncate rounded bg-yellow-400/90 px-1.5 py-0.5 text-[10px] text-black shadow ${
                selectedId === ann.id ? "ring-2 ring-blue-500" : ""
              }`}
              style={{
                left: note.x * scale + 10,
                top: note.y * scale - 8,
              }}
            >
              {note.content}
            </div>
          );
        })}
      {pageAnnotations
        .filter((a) => a.type === "stamp")
        .map((ann) => {
          const stamp = ann as StampAnnotation;
          const { width: sw, height: sh } = stampSize(stamp);
          return (
            <button
              key={ann.id}
              type="button"
              tabIndex={-1}
              className={`pointer-events-none absolute border-2 px-2 py-1 text-xs font-bold ${
                selectedId === ann.id ? "ring-2 ring-blue-500" : ""
              }`}
              style={{
                left: stamp.x * scale,
                top: stamp.y * scale,
                width: sw * scale,
                height: sh * scale,
                color: stamp.color,
                borderColor: stamp.color,
              }}
            >
              {STAMP_LABELS[stamp.stamp]}
            </button>
          );
        })}
      {pageAnnotations
        .filter((a) => a.type === "text")
        .map((ann) => {
          const text = ann as TextAnnotation;
          return (
            <div
              key={ann.id}
              className={`pointer-events-none absolute overflow-hidden rounded border border-zinc-400 bg-white/90 p-1 text-black ${
                selectedId === ann.id ? "ring-2 ring-blue-500" : ""
              }`}
              style={{
                left: text.x * scale,
                top: text.y * scale,
                width: text.width * scale,
                height: text.height * scale,
                fontSize: text.fontSize * scale,
              }}
            >
              {text.content}
            </div>
          );
        })}
    </div>
  );
}
