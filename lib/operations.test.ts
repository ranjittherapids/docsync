import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyOperation,
  compareOperations,
  computeDiff,
  mergeOperations,
  rebuildContent,
  sortOperations,
  type DocumentOperation,
} from "./operations";
import {
  MAX_PAYLOAD_BYTES,
  operationSchema,
  syncPushSchema,
  validatePayloadSize,
} from "./validation";

function makeOp(overrides: Partial<DocumentOperation>): DocumentOperation {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    documentId: "clxxxxxxxxxxxxxxxxxx",
    userId: "clyyyyyyyyyyyyyyyyyy",
    clientId: "client-a",
    clock: 1,
    type: "insert",
    position: 0,
    content: "hello",
    length: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("operations — conflict resolution", () => {
  it("sorts by clock then clientId then id", () => {
    const ops = [
      makeOp({ id: "00000000-0000-4000-8000-000000000003", clock: 2, clientId: "b" }),
      makeOp({ id: "00000000-0000-4000-8000-000000000001", clock: 1, clientId: "a" }),
      makeOp({ id: "00000000-0000-4000-8000-000000000002", clock: 2, clientId: "a" }),
    ];
    const sorted = sortOperations(ops);
    assert.equal(sorted[0].clock, 1);
    assert.equal(sorted[1].clientId, "a");
    assert.equal(sorted[2].clientId, "b");
  });

  it("applies insert and delete operations", () => {
    let content = "hello";
    content = applyOperation(
      content,
      makeOp({ type: "insert", position: 5, content: " world" })
    );
    assert.equal(content, "hello world");
    content = applyOperation(
      content,
      makeOp({ type: "delete", position: 5, content: "", length: 6 })
    );
    assert.equal(content, "hello");
  });

  it("merges without duplicates and without data loss", () => {
    const a = makeOp({ id: "00000000-0000-4000-8000-000000000001", clock: 1 });
    const b = makeOp({
      id: "00000000-0000-4000-8000-000000000002",
      clock: 2,
      clientId: "client-b",
      type: "insert",
      position: 5,
      content: "!",
    });
    const merged = mergeOperations([a], [a, b]);
    assert.equal(merged.length, 2);
    // a inserts "hello", then b inserts "!" at end → "hello!"
    assert.equal(rebuildContent(merged), "hello!");
  });

  it("compareOperations is deterministic", () => {
    const x = makeOp({
      clock: 1,
      clientId: "a",
      id: "00000000-0000-4000-8000-000000000001",
    });
    const y = makeOp({
      clock: 1,
      clientId: "b",
      id: "00000000-0000-4000-8000-000000000002",
    });
    assert.ok(compareOperations(x, y) < 0);
    assert.ok(compareOperations(y, x) > 0);
  });

  it("computeDiff produces ops that rebuild to the new content", () => {
    const oldContent = "Hello world";
    const newContent = "Hello DocFlow world";
    const ops = computeDiff(oldContent, newContent, {
      documentId: "clxxxxxxxxxxxxxxxxxx",
      userId: "clyyyyyyyyyyyyyyyyyy",
      clientId: "client-a",
      clock: 0,
    });
    assert.ok(ops.length > 0);
    assert.equal(rebuildContent(ops, oldContent), newContent);
  });
});

describe("validation — OOM / payload guards", () => {
  it("allows missing Content-Length", () => {
    assert.equal(validatePayloadSize(null), true);
  });

  it("rejects oversized Content-Length", () => {
    assert.equal(validatePayloadSize(MAX_PAYLOAD_BYTES + 1), false);
  });

  it("accepts payload at the limit", () => {
    assert.equal(validatePayloadSize(MAX_PAYLOAD_BYTES), true);
  });

  it("rejects sync push with too many operations", () => {
    const ops = Array.from({ length: 101 }, (_, i) =>
      makeOp({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        clock: i + 1,
      })
    );
    const result = syncPushSchema.safeParse({
      documentId: "clxxxxxxxxxxxxxxxxxx",
      operations: ops,
    });
    assert.equal(result.success, false);
  });

  it("rejects operation with oversized content", () => {
    const result = operationSchema.safeParse(
      makeOp({ content: "x".repeat(50_001) })
    );
    assert.equal(result.success, false);
  });
});
