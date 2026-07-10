"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";

interface Version {
  id: string;
  label: string;
  content: string;
  clock: number;
  createdAt: string;
  user?: { name?: string | null; email?: string | null };
}

interface VersionHistoryProps {
  documentId: string;
  versions: Version[];
  canEdit: boolean;
  onSnapshot: (label: string) => Promise<void>;
  onRestore: (versionId: string) => Promise<void>;
  onRefresh: () => void;
}

export function VersionHistory({
  versions,
  canEdit,
  onSnapshot,
  onRestore,
  onRefresh,
}: VersionHistoryProps) {
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleSnapshot = async () => {
    if (!label.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onSnapshot(label.trim());
      setLabel("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save snapshot");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (
      !confirm(
        "Restore this version? Your current text will be saved as a backup first."
      )
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      await onRestore(versionId);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore version");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      className="flex w-72 shrink-0 flex-col border-l border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
      aria-label="Version history"
    >
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Version History
        </h2>
        {canEdit && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSnapshot();
                }
              }}
              placeholder="Snapshot label…"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
              aria-label="Snapshot label"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSnapshot}
              disabled={loading || !label.trim()}
              className="rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "…" : "Save"}
            </button>
          </div>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {versions.length === 0 ? (
          <p className="p-2 text-xs text-zinc-500">
            No versions yet. Type a label and click Save to create a snapshot.
          </p>
        ) : (
          <ul className="space-y-1" role="list">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(expanded === v.id ? null : v.id)
                  }
                  className="w-full rounded-md p-2 text-left text-xs hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">
                    {v.label}
                  </p>
                  <p className="text-zinc-500">
                    {formatDate(v.createdAt)}
                    {v.user?.name && ` · ${v.user.name}`}
                  </p>
                  <p className="mt-0.5 text-[10px] text-zinc-400">
                    {v.content.length === 0
                      ? "(empty)"
                      : `${v.content.length} chars`}
                  </p>
                </button>
                {expanded === v.id && (
                  <div className="mx-2 mb-2 rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-800">
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">
                      {v.content.length === 0
                        ? "(empty document)"
                        : v.content.slice(0, 500)}
                      {v.content.length > 500 && "…"}
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestore(v.id);
                        }}
                        disabled={loading}
                        className="mt-2 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                        Restore this version
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
