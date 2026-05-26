import { useState, useRef, useEffect } from "react";
import { useAnnotationStore } from "@/stores/annotationStore";
import { useUiStore } from "@/stores/uiStore";
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
  const activeTool = useAnnotationStore((s) => s.activeTool);
  const appMode = useUiStore((s) => s.appMode);
  const annotations = useAnnotationStore((s) => s.annotations);
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  const addAnnotation = useAnnotationStore((s) => s.addAnnotation);
  const activeStamp = useAnnotationStore((s) => s.activeStamp);
  const selectedId = useAnnotationStore((s) => s.selectedId);
  const selectAnnotation = useAnnotationStore((s) => s.selectAnnotation);
  const removeAnnotation = useAnnotationStore((s) => s.removeAnnotation);
  const [drawing, setDrawing] = useState(false);
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
        const y = type === "underline" ? r.y + r.height - 2 : r.y + r.height / 2;
        ctx.fillRect(r.x * scale, y * scale, r.width * scale, 2 * scale);
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
        ctx.font = `bold ${14 * scale}px sans-serif`;
        ctx.fillStyle = stamp.color || "#D32F2F";
        ctx.strokeStyle = stamp.color || "#D32F2F";
        ctx.lineWidth = 2 * scale;
        const w = ctx.measureText(label).width + 16 * scale;
        const h = 24 * scale;
        const x = stamp.x * scale;
        const y = stamp.y * scale;
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
        drawShape(ctx, shape, scale, shape.color);
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
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const width = Math.abs(current.x - start.x);
      const height = Math.abs(current.y - start.y);
      drawRect(
        { x, y, width, height },
        activeTool as "highlight" | "underline" | "strikeout",
      );
    }
  };

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
  }, [pageAnnotations, scale, drawing, start, current, points, activeTool, selectedId]);

  const hitTest = (x: number, y: number): Annotation | null => {
    for (let i = pageAnnotations.length - 1; i >= 0; i--) {
      const ann = pageAnnotations[i];
      if (ann.type === "note") {
        const note = ann as NoteAnnotation;
        const dx = x - note.x;
        const dy = y - note.y;
        if (dx * dx + dy * dy < 100) return ann;
      }
      if (ann.type === "stamp") {
        const stamp = ann as StampAnnotation;
        if (x >= stamp.x && x <= stamp.x + 120 && y >= stamp.y && y <= stamp.y + 30) {
          return ann;
        }
      }
      if (
        ann.type === "highlight" ||
        ann.type === "underline" ||
        ann.type === "strikeout"
      ) {
        for (const r of (ann as RectAnnotation).rects) {
          if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
            return ann;
          }
        }
      }
    }
    return null;
  };

  const localCoords = (e: React.MouseEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === "select") {
      const pt = localCoords(e);
      const hit = hitTest(pt.x, pt.y);
      selectAnnotation(hit?.id ?? null);
      if (hit && e.detail === 2) {
        removeAnnotation(hit.id);
        void persistAnnotations();
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
    if (!drawing) return;
    const pt = localCoords(e);
    setCurrent(pt);
    if (activeTool === "freehand") {
      setPoints((prev) => [...prev, pt]);
    }
  };

  const finishRect = async (end: { x: number; y: number }) => {
    if (!start) return;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 4 || height < 4) return;

    const type =
      activeTool === "highlight"
        ? "highlight"
        : activeTool === "underline"
          ? "underline"
          : "strikeout";

    addAnnotation({
      type,
      pageIndex,
      author: "User",
      color: "#FFEB3B",
      rects: [{ x, y, width, height }],
    });
    await persistAnnotations();
  };

  const finishTextBox = async (end: { x: number; y: number }) => {
    if (!start) return;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
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

  const finishShape = async (end: { x: number; y: number }) => {
    if (!start || !SHAPE_TOOLS.includes(activeTool)) return;
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    if (dx < 4 && dy < 4) return;
    const shapeKind =
      activeTool === "rectangle"
        ? "rectangle"
        : activeTool === "ellipse"
          ? "ellipse"
          : activeTool === "line"
            ? "line"
            : "arrow";
    addAnnotation({
      type: "shape",
      shape: shapeKind,
      pageIndex,
      author: "User",
      color: "#2196F3",
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      strokeWidth: 2,
    });
    await persistAnnotations();
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    if (!drawing || activeTool === "note") return;
    const end = localCoords(e);
    if (activeTool === "freehand" && points.length > 1) {
      addAnnotation({
        type: "freehand",
        pageIndex,
        author: "User",
        color: "#E91E63",
        points,
        strokeWidth: 2,
      });
      await persistAnnotations();
    } else if (["highlight", "underline", "strikeout"].includes(activeTool)) {
      await finishRect(end);
    } else if (activeTool === "text") {
      await finishTextBox(end);
    } else if (SHAPE_TOOLS.includes(activeTool)) {
      await finishShape(end);
    }
    setDrawing(false);
    setStart(null);
    setCurrent(null);
    setPoints([]);
  };

  const interactive =
    appMode === "markup" && activeTool !== "hand" && activeTool !== "select";
  const selectMode = appMode === "markup" && activeTool === "select";

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: interactive ? "auto" : "none" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ pointerEvents: interactive ? "auto" : "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (drawing && start && current) {
            if (["highlight", "underline", "strikeout"].includes(activeTool)) {
              void finishRect(current);
            } else if (activeTool === "text") {
              void finishTextBox(current);
            } else if (SHAPE_TOOLS.includes(activeTool)) {
              void finishShape(current);
            }
          }
          setDrawing(false);
          setStart(null);
          setCurrent(null);
          setPoints([]);
        }}
      />
      {pageAnnotations
        .filter((a) => a.type === "note")
        .map((ann) => {
          const note = ann as NoteAnnotation;
          return (
            <div
              key={ann.id}
              title={note.content}
              onClick={() => selectAnnotation(ann.id)}
              onDoubleClick={() => {
                removeAnnotation(ann.id);
                void persistAnnotations();
              }}
              className={`absolute max-w-48 truncate rounded bg-yellow-400/90 px-1.5 py-0.5 text-[10px] text-black shadow ${
                selectMode ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
              } ${selectedId === ann.id ? "ring-2 ring-blue-500" : ""}`}
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
          return (
            <button
              key={ann.id}
              type="button"
              onClick={() => selectAnnotation(ann.id)}
              onDoubleClick={() => {
                removeAnnotation(ann.id);
                void persistAnnotations();
              }}
              className={`absolute border-2 px-2 py-1 text-xs font-bold ${
                selectMode ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
              } ${selectedId === ann.id ? "ring-2 ring-blue-500" : ""}`}
              style={{
                left: stamp.x * scale,
                top: stamp.y * scale,
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
              onClick={() => selectAnnotation(ann.id)}
              className={`absolute overflow-hidden rounded border border-zinc-400 bg-white/90 p-1 text-black ${
                selectMode ? "pointer-events-auto cursor-pointer" : "pointer-events-none"
              } ${selectedId === ann.id ? "ring-2 ring-blue-500" : ""}`}
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
