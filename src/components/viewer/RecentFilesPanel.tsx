import { useEffect, useState } from "react";
import { invokeLogged } from "@/lib/tauriInvoke";
import { openPdfFromPath } from "@/services/documentService";
import type { RecentFileEntry } from "@shared/types";

export function RecentFilesPanel() {
  const [files, setFiles] = useState<RecentFileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void invokeLogged<RecentFileEntry[]>("get_recent_files", {})
      .then((entries) => {
        if (!cancelled) {
          setFiles(entries);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFiles([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="p-3 text-xs text-zinc-500">Loading recent files…</p>;
  }

  if (files.length === 0) {
    return <p className="p-3 text-xs text-zinc-500">No recent files yet.</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => void openPdfFromPath(file.path)}
          className="mb-1 block w-full rounded border border-zinc-700 px-2 py-2 text-left hover:border-zinc-500 hover:bg-zinc-800"
          title={file.path}
        >
          <span className="block truncate text-sm text-zinc-200">{file.name}</span>
          <span className="block truncate text-[10px] text-zinc-500">{file.path}</span>
        </button>
      ))}
    </div>
  );
}
