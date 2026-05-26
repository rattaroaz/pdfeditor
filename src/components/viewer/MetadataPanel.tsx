import { useDocumentStore } from "@/stores/documentStore";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MetadataPanel() {
  const metadata = useDocumentStore((s) => s.metadata);
  const filePath = useDocumentStore((s) => s.filePath);
  const fileName = useDocumentStore((s) => s.fileName);
  const isPasswordProtected = useDocumentStore((s) => s.isPasswordProtected);
  const pendingSavePassword = useDocumentStore((s) => s.pendingSavePassword);

  if (!metadata) return null;

  const rows: Array<{ label: string; value: string | undefined }> = [
    { label: "File", value: fileName },
    { label: "Path", value: filePath ?? undefined },
    { label: "Title", value: metadata.title },
    { label: "Author", value: metadata.author },
    { label: "Subject", value: metadata.subject },
    { label: "Keywords", value: metadata.keywords },
    { label: "Creator", value: metadata.creator },
    { label: "Producer", value: metadata.producer },
    { label: "Pages", value: String(metadata.pageCount) },
    { label: "Size", value: formatBytes(metadata.fileSize) },
    {
      label: "Security",
      value: isPasswordProtected
        ? "Password protected"
        : pendingSavePassword
          ? "Will be password protected on save"
          : "No password (open access)",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-3 text-xs">
      <dl className="space-y-2">
        {rows.map(({ label, value }) =>
          value ? (
            <div key={label}>
              <dt className="font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
              <dd
                className={`mt-0.5 break-all ${
                  label === "Security" && isPasswordProtected
                    ? "font-medium text-amber-300"
                    : "text-zinc-200"
                }`}
              >
                {value}
              </dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  );
}
