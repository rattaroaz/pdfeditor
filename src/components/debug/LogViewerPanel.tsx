import { useCallback, useEffect, useState } from "react";
import type { LogEntry, LogLevel } from "@shared/types";
import {
  clearLogBuffer,
  getLogEntries,
  logger,
  subscribeLogBuffer,
} from "@/lib/logging";
import { fetchLoggingInfo, openLogDirectory, readBackendLogTail } from "@/services/loggingService";

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
  const [tab, setTab] = useState<"session" | "file">("session");

  const refresh = useCallback(() => {
    setEntries(getLogEntries());
  }, []);

  useEffect(() => {
    return subscribeLogBuffer(refresh);
  }, [refresh]);

  useEffect(() => {
    void fetchLoggingInfo().then((i) => setLogDir(i.logDirectory));
  }, []);

  const loadFileTail = () => {
    void readBackendLogTail(300).then(setBackendTail);
  };

  const filtered = entries.filter((e) => filter === "all" || e.level === filter);

  return (
    <div
      data-testid="log-viewer"
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-700 bg-zinc-950 shadow-2xl"
    >
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold text-zinc-100">Logs</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            onClick={() => void openLogDirectory()}
            title={logDir}
          >
            Open folder
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2 text-xs">
        <select
          value={logger.getLevel()}
          onChange={(e) => logger.setLevel(e.target.value as LogLevel)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
        >
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as LogLevel | "all")}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
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
          className="rounded px-2 py-1 text-zinc-500 hover:bg-zinc-800"
          onClick={() => {
            clearLogBuffer();
            refresh();
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
