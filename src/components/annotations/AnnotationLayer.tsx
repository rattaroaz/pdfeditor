import { useState, useRef, useEffect } from "react";
import { usePageCoordMapper } from "@/hooks/usePageCoordMapper";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useDocumentStore } from "@/stores/documentStore";
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
import { layoutTextBoxFromDrag, markupTextBoxStyle } from "@/lib/textEditBox";
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
  const rotation = useDocumentStore((s) => s.rotation);
  const coordMapper = usePageCoordMapper(pageIndex + 1, rotation);
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

  const pointOnCanvas = (x: number, y: number) => {
    const p = coordMapper ? coordMapper.toDisplay(x, y) : { x, y };
    return { x: p.x * scale, y: p.y * scale };
  };

  const rectOnCanvas = (x: number, y: number, width: number, height: number) => {
    const r = coordMapper
      ? coordMapper.displayRect(x, y, width, height)
      : { x, y, width, height };
    return {
      x: r.x * scale,
      y: r.y * scale,
      width: r.width * scale,
      height: r.height * scale,
    };
  };

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
      const box = rectOnCanvas(r.x, r.y, r.width, r.height);
      ctx.fillStyle =
        color ??
        (type === "highlight"
          ? "rgba(255, 235, 59, 0.4)"
          : type === "underline"
            ? "rgba(33, 150, 243, 0.5)"
            : "rgba(244, 67, 54, 0.5)");
      if (type === "highlight") {
        ctx.fillRect(box.x, box.y, box.width, box.height);
      } else {
        const bandY = lineMarkupBandY(r, type);
        const band = pointOnCanvas(r.x, bandY);
        ctx.fillRect(band.x, band.y, box.width, MARKUP_LINE_THICKNESS * scale);
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
        const first = pointOnCanvas(fh.points[0].x, fh.points[0].y);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < fh.points.length; i++) {
          const p = pointOnCanvas(fh.points[i].x, fh.points[i].y);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      if (ann.type === "note") {
        const note = ann as NoteAnnotation;
        ctx.fillStyle = "#FFC107";
        ctx.beginPath();
        const notePoint = pointOnCanvas(note.x, note.y);
        ctx.arc(notePoint.x, notePoint.y, 8, 0, Math.PI * 2);
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
        const stampBox = rectOnCanvas(stamp.x, stamp.y, sw, sh);
        const x = stampBox.x;
        const y = stampBox.y;
        const w = stampBox.width;
        const h = stampBox.height;
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
          drawSelectionOutline(ctx, shape);
        }
      }
    }

    if (selectedId) {
      const selected = pageAnnotations.find((a) => a.id === selectedId);
      if (selected && selected.type !== "stamp" && selected.type !== "shape") {
        drawSelectionForAnnotation(ctx, selected);
      }
      if (selected && canResizeAnnotation(selected)) {
        drawResizeHandle(ctx, selected);
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
      const preview = rectOnCanvas(x, y, width, height);
      ctx.strokeRect(preview.x, preview.y, preview.width, preview.height);
    }

    if (drawing && start && current && activeTool === "freehand" && points.length > 1) {
      ctx.strokeStyle = "#E91E63";
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      const firstPoint = pointOnCanvas(points[0].x, points[0].y);
      ctx.moveTo(firstPoint.x, firstPoint.y);
      for (let i = 1; i < points.length; i++) {
        const p = pointOnCanvas(points[i].x, points[i].y);
        ctx.lineTo(p.x, p.y);
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
  ) {
    ctx.save();
    ctx.strokeStyle = "#2196F3";
    ctx.lineWidth = 2;
    const p1 = pointOnCanvas(shape.x1, shape.y1);
    const p2 = pointOnCanvas(shape.x2, shape.y2);
    const x1 = p1.x;
    const y1 = p1.y;
    const x2 = p2.x;
    const y2 = p2.y;
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
  ) {
    ctx.save();
    ctx.strokeStyle = "#2196F3";
    ctx.lineWidth = 2;
    if (ann.type === "highlight" || ann.type === "underline" || ann.type === "strikeout") {
      for (const r of (ann as RectAnnotation).rects) {
        const box = rectOnCanvas(r.x, r.y, r.width, r.height);
        ctx.strokeRect(box.x - 2, box.y - 2, box.width + 4, box.height + 4);
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
      const box = rectOnCanvas(minX, minY, maxX - minX, maxY - minY);
      ctx.strokeRect(box.x - 4, box.y - 4, box.width + 8, box.height + 8);
    } else if (ann.type === "note") {
      const note = ann as NoteAnnotation;
      const notePoint = pointOnCanvas(note.x, note.y);
      ctx.beginPath();
      ctx.arc(notePoint.x, notePoint.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    } else if (ann.type === "text") {
      const text = ann as TextAnnotation;
      const box = rectOnCanvas(text.x, text.y, text.width, text.height);
      ctx.strokeRect(box.x - 2, box.y - 2, box.width + 4, box.height + 4);
    }
    ctx.restore();
  }

  function drawResizeHandle(ctx: CanvasRenderingContext2D, ann: Annotation) {
    const b = annotationBounds(ann);
    const handle = pointOnCanvas(b.x + b.width, b.y + b.height);
    const hx = handle.x;
    const hy = handle.y;
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
    const p1 = pointOnCanvas(shape.x1, shape.y1);
    const p2 = pointOnCanvas(shape.x2, shape.y2);
    const x1 = p1.x;
    const y1 = p1.y;
    const x2 = p2.x;
    const y2 = p2.y;

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
  }, [pageAnnotations, scale, drawing, start, current, points, activeTool, selectedId, transform, coordMapper]);

  const hitTest = (x: number, y: number): Annotation | null =>
    hitTestAnnotation(annotations, pageIndex, x, y);

  const localCoords = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const displayX = (e.clientX - rect.left) / scale;
    const displayY = (e.clientY - rect.top) / scale;
    return coordMapper
      ? coordMapper.toStorage(displayX, displayY)
      : { x: displayX, y: displayY };
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
    const { fontSize, height: boxHeight } = layoutTextBoxFromDrag(height);
    addAnnotation({
      type: "text",
      pageIndex,
      author: "User",
      color: "#212121",
      x,
      y,
      width,
      height: boxHeight,
      content: content.trim(),
      fontSize,
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
        {pageAnnotations
          .filter((a) => a.type === "text")
          .map((ann) => {
            const text = ann as TextAnnotation;
            const box = rectOnCanvas(text.x, text.y, text.width, text.height);
            return (
              <div
                key={ann.id}
                className="pointer-events-none absolute overflow-hidden rounded border border-zinc-400 bg-white/90 px-1 text-black leading-none"
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  fontSize: text.fontSize * scale,
                  ...markupTextBoxStyle(scale),
                }}
              >
                {text.content}
              </div>
            );
          })}
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
          const notePoint = pointOnCanvas(note.x, note.y);
          return (
            <div
              key={ann.id}
              title={note.content}
              className={`pointer-events-none absolute max-w-48 truncate rounded bg-yellow-400/90 px-1.5 py-0.5 text-[10px] text-black shadow ${
                selectedId === ann.id ? "ring-2 ring-blue-500" : ""
              }`}
              style={{
                left: notePoint.x + 10,
                top: notePoint.y - 8,
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
          const stampBox = rectOnCanvas(stamp.x, stamp.y, sw, sh);
          return (
            <button
              key={ann.id}
              type="button"
              tabIndex={-1}
              className={`pointer-events-none absolute border-2 px-2 py-1 text-xs font-bold ${
                selectedId === ann.id ? "ring-2 ring-blue-500" : ""
              }`}
              style={{
                left: stampBox.x,
                top: stampBox.y,
                width: stampBox.width,
                height: stampBox.height,
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
          const box = rectOnCanvas(text.x, text.y, text.width, text.height);
          return (
            <div
              key={ann.id}
              className={`pointer-events-none absolute overflow-hidden rounded border border-zinc-400 bg-white/90 px-1 text-black leading-none ${
                selectedId === ann.id ? "ring-2 ring-blue-500" : ""
              }`}
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                fontSize: text.fontSize * scale,
                ...markupTextBoxStyle(scale),
              }}
            >
              {text.content}
            </div>
          );
        })}
    </div>
  );
}
