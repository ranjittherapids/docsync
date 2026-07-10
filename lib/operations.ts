export type OperationType = "insert" | "delete";

export interface DocumentOperation {
  id: string;
  documentId: string;
  userId: string;
  clientId: string;
  clock: number;
  type: OperationType;
  position: number;
  content: string;
  length: number;
  createdAt: string;
}

/** Deterministic ordering: clock ASC, then clientId ASC, then id ASC */
export function compareOperations(a: DocumentOperation, b: DocumentOperation): number {
  if (a.clock !== b.clock) return a.clock - b.clock;
  if (a.clientId !== b.clientId) return a.clientId.localeCompare(b.clientId);
  return a.id.localeCompare(b.id);
}

export function sortOperations(ops: DocumentOperation[]): DocumentOperation[] {
  return [...ops].sort(compareOperations);
}

/** Apply a single operation to document content */
export function applyOperation(content: string, op: DocumentOperation): string {
  const pos = Math.max(0, Math.min(op.position, content.length));

  if (op.type === "insert") {
    return content.slice(0, pos) + op.content + content.slice(pos);
  }

  const deleteLen = Math.min(op.length, content.length - pos);
  return content.slice(0, pos) + content.slice(pos + deleteLen);
}

/** Rebuild document content from a sorted list of operations */
export function rebuildContent(
  operations: DocumentOperation[],
  baseContent = ""
): string {
  return sortOperations(operations).reduce(
    (content, op) => applyOperation(content, op),
    baseContent
  );
}

/** Compute diff between old and new content, returning insert/delete operations */
export function computeDiff(
  oldContent: string,
  newContent: string,
  meta: Pick<DocumentOperation, "documentId" | "userId" | "clientId" | "clock">
): DocumentOperation[] {
  const ops: DocumentOperation[] = [];
  let clock = meta.clock;

  // Find common prefix
  let prefixLen = 0;
  const minLen = Math.min(oldContent.length, newContent.length);
  while (prefixLen < minLen && oldContent[prefixLen] === newContent[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    oldContent[oldContent.length - 1 - suffixLen] ===
      newContent[newContent.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const deleteStart = prefixLen;
  const deleteLen = oldContent.length - prefixLen - suffixLen;
  const insertContent = newContent.slice(prefixLen, newContent.length - suffixLen);

  if (deleteLen > 0) {
    ops.push({
      id: crypto.randomUUID(),
      documentId: meta.documentId,
      userId: meta.userId,
      clientId: meta.clientId,
      clock: ++clock,
      type: "delete",
      position: deleteStart,
      content: "",
      length: deleteLen,
      createdAt: new Date().toISOString(),
    });
  }

  if (insertContent.length > 0) {
    ops.push({
      id: crypto.randomUUID(),
      documentId: meta.documentId,
      userId: meta.userId,
      clientId: meta.clientId,
      clock: ++clock,
      type: "insert",
      position: deleteStart,
      content: insertContent,
      length: 0,
      createdAt: new Date().toISOString(),
    });
  }

  return ops;
}

/** Merge local and remote operations, deduplicating by id */
export function mergeOperations(
  local: DocumentOperation[],
  remote: DocumentOperation[]
): DocumentOperation[] {
  const map = new Map<string, DocumentOperation>();
  for (const op of [...local, ...remote]) {
    map.set(op.id, op);
  }
  return sortOperations(Array.from(map.values()));
}

export const MAX_CONTENT_LENGTH = 500_000;
export const MAX_OPERATION_CONTENT = 50_000;
export const MAX_OPERATIONS_PER_SYNC = 100;
