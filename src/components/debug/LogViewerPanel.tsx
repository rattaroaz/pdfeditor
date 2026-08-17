import { useCallback, useEffect, useState } from "react";
import type { LogEntry, LogLevel } from "@shared/types";
import {
  clearLogBuffer,
  getLogEntries,
  getMetricsSnapshot,
  logger,
  resetMetrics,
  subscribeLogBuffer,
  subscribeMetrics,
} from "@/lib/logging";
import type { MetricsSnapshot } from "@/lib/logging";
import { fetchLoggingInfo, readBackendLogTail } from "@/services/loggingService";

const LEVEL_CLASS: Record<LogLevel, string> = {
  debug: "text-zinc-500",
  info: "text-sky-400",
  warn: "text-amber-400",
  error: "text-red-400",
};

interface LogViewerPanelProps {
  onClose: () => void;
}

export function LogViewerPanel({ onClose }: LogViewerPanelProps) {
  const [entries, setEntries] = useState<readonly LogEntry[]>(() => getLogEntries());
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [logDir, setLogDir] = useState("");
  const [backendTail, setBackendTail] = useState<string[]>([]);
  const [tab, setTab] = useState<"session" | "file" | "metrics">("session");
  const [metrics, setMetrics] = useState<MetricsSnapshot>(() => getMetricsSnapshot());

  const refresh = useCallback(() => {
    setEntries(getLogEntries());
  }, []);

  useEffect(() => {
    return subscribeLogBuffer(refresh);
  }, [refresh]);

  useEffect(() => {
    return subscribeMetrics(() => setMetrics(getMetricsSnapshot()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchLoggingInfo()
      .then((i) => {
        if (!cancelled) setLogDir(i.logDirectory);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLogDir(
            err instanceof Error ? err.message : "Log directory unavailable",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFileTail = () => {
    void readBackendLogTail(300)
      .then(setBackendTail)
      .catch(() => setBackendTail([]));
  };

  const filtered = entries.filter((e) => filter === "all" || e.level === filter);

  return (
    <div
      data-testid="log-viewer"
      className="flex h-full w-80 min-w-72 max-w-md shrink-0 flex-col border-l border-zinc-700 bg-zinc-950"
    >
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-100">Logs</h2>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
          onClick={onClose}
        >
          Close
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as LogLevel | "all")}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
          aria-label="Filter log level"
        >
          <option value="all">All levels</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <button
          type="button"
          className={`rounded px-2 py-1 ${tab === "session" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"}`}
          onClick={() => setTab("session")}
        >
          Session
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 ${tab === "file" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"}`}
          onClick={() => {
            setTab("file");
            loadFileTail();
          }}
        >
          Log file
        </button>
        <button
          type="button"
          data-testid="log-tab-metrics"
          className={`rounded px-2 py-1 ${tab === "metrics" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500"}`}
          onClick={() => {
            setTab("metrics");
            setMetrics(getMetricsSnapshot());
          }}
        >
          Metrics
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800"
          onClick={() => {
            if (tab === "metrics") {
              resetMetrics();
              setMetrics(getMetricsSnapshot());
            } else {
              clearLogBuffer();
              refresh();
            }
          }}
        >
          Clear
        </button>
      </div>

      <p className="truncate border-b border-zinc-800 px-3 py-1 font-mono text-[10px] text-zinc-600">
        session {logger.sessionId} · {logDir}
      </p>

      <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
        {tab === "session" &&
          filtered.map((e) => (
            <div key={e.id} data-testid="log-entry" className="mb-1 border-b border-zinc-900/80 pb-1">
              <span className="text-zinc-600">{e.timestamp.slice(11, 23)}</span>{" "}
              <span className={LEVEL_CLASS[e.level]}>[{e.level}]</span>
              {e.context?.category && (
                <span className="text-violet-400">[{e.context.category}]</span>
              )}{" "}
              <span className="text-zinc-200">{e.message}</span>
              {e.context?.userAction && (
                <span className="text-zinc-500"> · {e.context.userAction}</span>
              )}
              {e.context?.outcome && (
                <span className={e.context.outcome === "fail" ? "text-red-400" : "text-emerald-500"}>
                  {" "}
                  · {e.context.outcome}
                </span>
              )}
              {e.context?.durationMs != null && (
                <span className="text-zinc-600"> · {e.context.durationMs}ms</span>
              )}
              {e.context?.correlationId && (
                <div className="text-[10px] text-zinc-600">
                  corr {e.context.correlationId.slice(0, 8)}…
                </div>
              )}
              {e.context?.errorId && (
                <div className="text-[10px] text-red-300/80">err {e.context.errorId}</div>
              )}
            </div>
          ))}
        {tab === "file" &&
          backendTail.map((line, i) => (
            <div key={i} className="mb-0.5 whitespace-pre-wrap break-all text-zinc-400">
              {line}
            </div>
          ))}
        {tab === "metrics" && (
          <div data-testid="metrics-panel">
            <p className="mb-2 text-zinc-400">
              {metrics.totals.events} events · {metrics.totals.ok} ok · {metrics.totals.fail} fail
            </p>
            {metrics.operations.length === 0 && (
              <p className="text-zinc-600">No metrics yet. Open or save a PDF to populate this view.</p>
            )}
            {metrics.operations.map((op) => (
              <div key={op.name} className="mb-2 border-b border-zinc-900/80 pb-1 text-zinc-300">
                <div className="text-zinc-100">{op.name}</div>
                <div className="text-zinc-500">
                  n={op.count} ok={op.ok} fail={op.fail}
                  {op.avgMs != null && ` · avg ${op.avgMs}ms`}
                  {op.p95Ms != null && ` · p95 ${op.p95Ms}ms`}
                  {op.lastDurationMs != null && ` · last ${op.lastDurationMs}ms`}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "session" && filtered.length === 0 && (
          <p className="text-zinc-600">No log entries yet.</p>
        )}
        {tab === "file" && backendTail.length === 0 && (
          <p className="text-zinc-600">No log file lines loaded. Click Log file again after activity.</p>
        )}
      </div>
    </div>
  );
}
