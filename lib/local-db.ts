import Dexie, { type Table } from "dexie";
import type { DocumentOperation } from "./operations";

export interface LocalDocument {
  id: string;
  title: string;
  content: string;
  clock: number;
  role: "OWNER" | "EDITOR" | "VIEWER";
  updatedAt: string;
  syncedAt: string | null;
}

export interface PendingOperation extends DocumentOperation {
  synced: boolean;
}

export interface LocalVersion {
  id: string;
  documentId: string;
  label: string;
  content: string;
  clock: number;
  createdAt: string;
}

export interface SyncMeta {
  key: string;
  clientId: string;
  lastSyncClock: Record<string, number>;
}

class DocFlowDB extends Dexie {
  documents!: Table<LocalDocument, string>;
  operations!: Table<PendingOperation, string>;
  versions!: Table<LocalVersion, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super("DocFlowDB");
    this.version(1).stores({
      documents: "id, updatedAt",
      operations: "id, documentId, synced, clock",
      versions: "id, documentId, createdAt",
      syncMeta: "key",
    });
    // Remove boolean compound index — IndexedDB rejects `false` in IDBKeyRange
    this.version(2).stores({
      documents: "id, updatedAt",
      operations: "id, documentId, [documentId+synced], synced, clock",
      versions: "id, documentId, createdAt",
      syncMeta: "key",
    });
    this.version(3).stores({
      documents: "id, updatedAt",
      operations: "id, documentId, synced, clock",
      versions: "id, documentId, createdAt",
      syncMeta: "key",
    });
  }
}

let db: DocFlowDB | null = null;

export function getLocalDB(): DocFlowDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!db) {
    db = new DocFlowDB();
  }
  return db;
}

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "server";
  const key = "docflow-client-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

/** Pending ops for a document — avoids invalid boolean compound IDB keys */
export async function getPendingOperations(
  documentId: string
): Promise<PendingOperation[]> {
  const database = getLocalDB();
  return database.operations
    .where("documentId")
    .equals(documentId)
    .filter((op) => op.synced === false)
    .toArray();
}

export async function countPendingOperations(
  documentId: string
): Promise<number> {
  const pending = await getPendingOperations(documentId);
  return pending.length;
}

export async function getClientClock(documentId: string): Promise<number> {
  const database = getLocalDB();
  const ops = await database.operations
    .where("documentId")
    .equals(documentId)
    .toArray();
  if (ops.length === 0) return 0;
  return Math.max(...ops.map((o) => o.clock));
}
