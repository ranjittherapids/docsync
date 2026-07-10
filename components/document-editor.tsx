"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SharePanel } from "@/components/share-panel";
import { SyncStatus } from "@/components/sync-status";
import { VersionHistory } from "@/components/version-history";
import { useSync } from "@/hooks/use-sync";
import type { DocumentOperation } from "@/lib/operations";

interface DocumentEditorProps {
  documentId: string;
  userId: string;
  initialTitle: string;
  initialContent: string;
  initialClock: number;
  role: "OWNER" | "EDITOR" | "VIEWER";
  serverOps?: DocumentOperation[];
}

interface Version {
  id: string;
  label: string;
  content: string;
  clock: number;
  createdAt: string;
  user?: { name?: string | null; email?: string | null };
}

export function DocumentEditor({
  documentId,
  userId,
  initialTitle,
  initialContent,
  initialClock,
  role,
  serverOps = [],
}: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [versions, setVersions] = useState<Version[]>([]);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showVersions, setShowVersions] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const contentRef = useRef(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  const handleRemoteContent = useCallback((remoteContent: string) => {
    // Don't overwrite while the user is actively typing
    if (isTypingRef.current) return;
    if (remoteContent === contentRef.current) return;

    const el = textareaRef.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;

    setContent(remoteContent);
    contentRef.current = remoteContent;

    // Restore caret if the textarea still has focus
    if (el && start !== null && end !== null) {
      requestAnimationFrame(() => {
        const max = remoteContent.length;
        el.setSelectionRange(Math.min(start, max), Math.min(end, max));
      });
    }
  }, []);

  const {
    status,
    pendingCount,
    sync,
    flushPending,
    saveLocalEdit,
    loadDocument,
    applyRestore,
    canPush,
  } = useSync({
    documentId,
    userId,
    role,
    onRemoteContentChange: handleRemoteContent,
  });

  const fetchVersions = useCallback(async () => {
    const res = await fetch(`/api/versions?documentId=${documentId}`);
    if (res.ok) {
      const data = await res.json();
      setVersions(data.versions ?? []);
    }
  }, [documentId]);

  useEffect(() => {
    loadDocument(
      {
        id: documentId,
        title: initialTitle,
        content: initialContent,
        clock: initialClock,
        role,
        updatedAt: new Date().toISOString(),
        syncedAt: null,
      },
      serverOps
    ).then((doc) => {
      if (doc) {
        setContent(doc.content);
        contentRef.current = doc.content;
      }
    });
    fetchVersions();
  }, [
    documentId,
    initialTitle,
    initialContent,
    initialClock,
    role,
    loadDocument,
    fetchVersions,
    // serverOps intentionally omitted — only used on first load inside loadDocument
  ]);

  const handleContentChange = (value: string) => {
    if (!canEdit) return;
    const old = contentRef.current;
    setContent(value);
    contentRef.current = value;

    isTypingRef.current = true;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 1500);

    saveLocalEdit(value, old);
  };

  const handleTitleBlur = async () => {
    if (!canEdit || title === initialTitle) return;
    await fetch(`/api/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const handleSnapshot = async (label: string) => {
    // Flush pending local edits so the server has latest text
    await flushPending();

    const res = await fetch("/api/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        label,
        content: contentRef.current,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to save snapshot");
    }
    await fetchVersions();
  };

  const handleRestore = async (versionId: string) => {
    // Flush current work first so the auto-backup is accurate
    await flushPending();

    const res = await fetch("/api/versions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? "Failed to restore version");
    }

    const restoredContent = data.document.content as string;
    const restoredClock = data.document.clock as number;
    const allOperations = (data.allOperations ?? []) as DocumentOperation[];

    // Reset IndexedDB so pending local ops cannot undo the restore
    await applyRestore(restoredContent, restoredClock, allOperations);

    setContent(restoredContent);
    contentRef.current = restoredContent;
    isTypingRef.current = false;

    await fetchVersions();
  };

  const runAI = async (action: "summarize" | "improve" | "title") => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, action, content }),
      });
      const data = await res.json();
      if (data.result) {
        setAiResult(data.result);
        if (action === "title" && canEdit) {
          setTitle(data.result);
        }
        if (action === "improve" && canEdit) {
          handleContentChange(data.result);
        }
      }
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <SyncStatus
            status={status}
            pendingCount={pendingCount}
            onRetry={sync}
          />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {role}
          </span>
          {!canPush && (
            <span className="text-xs text-zinc-500">Read-only</span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              onClick={() => runAI("summarize")}
              disabled={aiLoading}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              AI Summarize
            </button>
            {canEdit && (
              <>
                <button
                  onClick={() => runAI("improve")}
                  disabled={aiLoading}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  AI Improve
                </button>
                <button
                  onClick={() => runAI("title")}
                  disabled={aiLoading}
                  className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  AI Title
                </button>
              </>
            )}
            <button
              onClick={() => setShowShare(true)}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Share
            </button>
            <button
              onClick={() => setShowVersions((v) => !v)}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              aria-expanded={showVersions}
            >
              History
            </button>
          </div>
        </div>

        <SharePanel
          documentId={documentId}
          isOwner={role === "OWNER"}
          open={showShare}
          onClose={() => setShowShare(false)}
        />

        {/* Title */}
        <div className="px-6 pt-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            readOnly={!canEdit}
            className="w-full bg-transparent text-2xl font-bold text-zinc-900 outline-none dark:text-zinc-100"
            aria-label="Document title"
          />
        </div>

        {/* AI Result */}
        {aiResult && (
          <div className="mx-6 mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide">
                AI Result
              </span>
              <button
                onClick={() => setAiResult(null)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Dismiss
              </button>
            </div>
            <p className="whitespace-pre-wrap">{aiResult}</p>
          </div>
        )}

        {/* Editor */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          readOnly={!canEdit}
          className="flex-1 resize-none bg-transparent px-6 py-4 font-mono text-sm leading-relaxed text-zinc-800 outline-none dark:text-zinc-200"
          placeholder={canEdit ? "Start writing…" : "View only"}
          aria-label="Document content"
          spellCheck
        />
      </div>

      {showVersions && (
        <VersionHistory
          documentId={documentId}
          versions={versions}
          canEdit={canEdit}
          onSnapshot={handleSnapshot}
          onRestore={handleRestore}
          onRefresh={fetchVersions}
        />
      )}
    </div>
  );
}
