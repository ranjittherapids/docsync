"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  countPendingOperations,
  getLocalDB,
  getOrCreateClientId,
  getPendingOperations,
  type LocalDocument,
} from "@/lib/local-db";
import {
  computeDiff,
  mergeOperations,
  rebuildContent,
  type DocumentOperation,
} from "@/lib/operations";

export type ConnectionStatus = "online" | "offline" | "syncing" | "error";

interface UseSyncOptions {
  documentId: string;
  userId: string;
  role: "OWNER" | "EDITOR" | "VIEWER";
  enabled?: boolean;
  onRemoteContentChange?: (content: string) => void;
}

type RemoteOp = DocumentOperation & { seq?: number };

export function useSync({
  documentId,
  userId,
  role,
  enabled = true,
  onRemoteContentChange,
}: UseSyncOptions) {
  const [status, setStatus] = useState<ConnectionStatus>("online");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const syncingRef = useRef(false);
  const clientId = useRef(getOrCreateClientId());
  /** Lamport clock for creating local ops (independent per client) */
  const clockRef = useRef(0);
  /** Server seq cursor — only advances after successful sync */
  const syncCursorRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRemoteContentChangeRef = useRef(onRemoteContentChange);

  onRemoteContentChangeRef.current = onRemoteContentChange;

  const canPush = role !== "VIEWER";

  const updatePendingCount = useCallback(async () => {
    setPendingCount(await countPendingOperations(documentId));
  }, [documentId]);

  const pullRemote = useCallback(async () => {
    const db = getLocalDB();
    const sinceSeq = syncCursorRef.current;

    const res = await fetch(
      `/api/sync?documentId=${documentId}&sinceClock=${sinceSeq}`
    );
    if (!res.ok) throw new Error("Pull failed");

    const data = await res.json();
    const remoteOps: RemoteOp[] = data.operations ?? [];
    const serverDoc = data.document as
      | { content: string; clock: number }
      | undefined;

    if (remoteOps.length === 0) {
      const pending = await countPendingOperations(documentId);
      if (
        serverDoc &&
        pending === 0 &&
        typeof serverDoc.content === "string"
      ) {
        const localDoc = await db.documents.get(documentId);
        if (localDoc && localDoc.content !== serverDoc.content) {
          await db.documents.update(documentId, {
            content: serverDoc.content,
            clock: serverDoc.clock,
            syncedAt: new Date().toISOString(),
          });
          syncCursorRef.current = Math.max(
            syncCursorRef.current,
            serverDoc.clock
          );
          onRemoteContentChangeRef.current?.(serverDoc.content);
        }
      }
      return remoteOps;
    }

    const localOps = await db.operations
      .where("documentId")
      .equals(documentId)
      .toArray();

    const merged = mergeOperations(localOps, remoteOps);
    const pending = localOps.filter((o) => !o.synced);
    const content =
      pending.length === 0 && serverDoc?.content != null
        ? serverDoc.content
        : rebuildContent(merged);

    const maxRemoteSeq = Math.max(
      ...remoteOps.map((o) => o.seq ?? 0),
      serverDoc?.clock ?? 0,
      sinceSeq
    );
    const maxLamport = Math.max(
      ...merged.map((o) => o.clock),
      clockRef.current,
      0
    );

    await db.transaction("rw", db.operations, db.documents, async () => {
      for (const op of remoteOps) {
        await db.operations.put({ ...op, synced: true });
      }

      await db.documents.update(documentId, {
        content,
        clock: maxRemoteSeq,
        updatedAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      });
    });

    syncCursorRef.current = maxRemoteSeq;
    clockRef.current = Math.max(clockRef.current, maxLamport);
    onRemoteContentChangeRef.current?.(content);

    return remoteOps;
  }, [documentId]);

  const pushLocal = useCallback(async () => {
    if (!canPush) return;

    const db = getLocalDB();
    const pending = await getPendingOperations(documentId);

    if (pending.length === 0) return;

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        operations: pending,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Push failed");
    }

    const data = await res.json();
    const syncCursor =
      typeof data.syncCursor === "number"
        ? data.syncCursor
        : data.document?.clock;

    await db.transaction("rw", db.operations, db.documents, async () => {
      for (const op of pending) {
        await db.operations.update(op.id, { synced: true });
      }
      if (typeof syncCursor === "number") {
        const updates: Record<string, unknown> = {
          clock: syncCursor,
          syncedAt: new Date().toISOString(),
        };
        if (typeof data.document?.content === "string") {
          updates.content = data.document.content;
        }
        await db.documents.update(documentId, updates);
        syncCursorRef.current = Math.max(syncCursorRef.current, syncCursor);
      }
    });
  }, [documentId, canPush]);

  const sync = useCallback(async () => {
    if (!enabled || syncingRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      return;
    }

    syncingRef.current = true;
    setStatus("syncing");

    try {
      await saveChainRef.current;
      if (canPush) await pushLocal();
      await pullRemote();
      setStatus("online");
      setLastSyncedAt(new Date());
      await updatePendingCount();
    } catch {
      setStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }, [enabled, canPush, pushLocal, pullRemote, updatePendingCount]);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      sync();
    }, 400);
  }, [sync]);

  const flushPending = useCallback(async () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    await saveChainRef.current;
    if (canPush && navigator.onLine) {
      await pushLocal();
      await updatePendingCount();
    }
  }, [canPush, pushLocal, updatePendingCount]);

  const saveLocalEdit = useCallback(
    (newContent: string, oldContent: string) => {
      saveChainRef.current = saveChainRef.current.then(async () => {
        const db = getLocalDB();
        const clock = clockRef.current;

        const ops = computeDiff(oldContent, newContent, {
          documentId,
          userId,
          clientId: clientId.current,
          clock,
        });

        if (ops.length === 0) return;

        const maxClock = Math.max(...ops.map((o) => o.clock));
        clockRef.current = maxClock;

        await db.transaction("rw", db.operations, db.documents, async () => {
          for (const op of ops) {
            await db.operations.put({ ...op, synced: false });
          }

          // Do NOT advance sync cursor on local edit
          await db.documents.update(documentId, {
            content: newContent,
            updatedAt: new Date().toISOString(),
          });
        });

        await updatePendingCount();

        if (navigator.onLine && canPush) {
          scheduleSync();
        }
      });
    },
    [documentId, userId, canPush, scheduleSync, updatePendingCount]
  );

  const loadDocument = useCallback(
    async (doc: LocalDocument, serverOps: DocumentOperation[] = []) => {
      const db = getLocalDB();
      const existing = await db.documents.get(documentId);

      if (!existing) {
        await db.documents.put(doc);
        for (const op of serverOps) {
          await db.operations.put({ ...op, synced: true });
        }
      } else {
        const pending = await countPendingOperations(documentId);
        if (pending === 0) {
          await db.documents.update(documentId, {
            content: doc.content,
            clock: doc.clock,
            title: doc.title,
            role: doc.role,
          });
          for (const op of serverOps) {
            await db.operations.put({ ...op, synced: true });
          }
        }
      }

      const localDoc = await db.documents.get(documentId);
      const ops = await db.operations
        .where("documentId")
        .equals(documentId)
        .toArray();

      clockRef.current = Math.max(
        doc.clock,
        ...ops.map((o) => o.clock),
        0
      );

      // Reset cursor on load so stale local clocks cannot skip remote ops
      syncCursorRef.current = 0;

      return localDoc;
    },
    [documentId]
  );

  const applyRestore = useCallback(
    async (
      content: string,
      clock: number,
      allOperations: DocumentOperation[]
    ) => {
      await saveChainRef.current;
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }

      const db = getLocalDB();
      await db.transaction("rw", db.operations, db.documents, async () => {
        await db.operations.where("documentId").equals(documentId).delete();
        for (const op of allOperations) {
          await db.operations.put({
            ...op,
            type: op.type as "insert" | "delete",
            synced: true,
          });
        }
        await db.documents.update(documentId, {
          content,
          clock,
          updatedAt: new Date().toISOString(),
          syncedAt: new Date().toISOString(),
        });
      });

      syncCursorRef.current = clock;
      clockRef.current = Math.max(
        clock,
        ...allOperations.map((o) => o.clock),
        0
      );
      await updatePendingCount();
    },
    [documentId, updatePendingCount]
  );

  useEffect(() => {
    if (!enabled) return;

    const handleOnline = () => {
      setStatus("online");
      sync();
    };
    const handleOffline = () => setStatus("offline");

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (!navigator.onLine) setStatus("offline");

    sync();
    const interval = setInterval(sync, 2500);
    updatePendingCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [enabled, sync, updatePendingCount]);

  return {
    status,
    pendingCount,
    lastSyncedAt,
    sync,
    flushPending,
    saveLocalEdit,
    loadDocument,
    applyRestore,
    canPush,
  };
}
