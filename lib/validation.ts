import { z } from "zod";
import {
  MAX_CONTENT_LENGTH,
  MAX_OPERATION_CONTENT,
  MAX_OPERATIONS_PER_SYNC,
} from "./operations";

export const operationSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().min(1).max(64),
  userId: z.string().min(1).max(64),
  clientId: z.string().min(1).max(64),
  clock: z.number().int().min(0).max(1_000_000_000),
  type: z.enum(["insert", "delete"]),
  position: z.number().int().min(0).max(MAX_CONTENT_LENGTH),
  content: z.string().max(MAX_OPERATION_CONTENT),
  length: z.number().int().min(0).max(MAX_CONTENT_LENGTH),
  createdAt: z.string().datetime(),
});

export const syncPushSchema = z.object({
  documentId: z.string().min(1).max(64),
  operations: z.array(operationSchema).max(MAX_OPERATIONS_PER_SYNC),
  clientClock: z.number().int().min(0).optional(),
});

export const syncPullSchema = z.object({
  documentId: z.string().min(1).max(64),
  sinceClock: z.number().int().min(0).default(0),
});

export const createDocumentSchema = z.object({
  title: z.string().min(1).max(200).default("Untitled Document"),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const createVersionSchema = z.object({
  documentId: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  /** Current editor content — preferred over stale server snapshot */
  content: z.string().max(MAX_CONTENT_LENGTH).optional(),
});

export const restoreVersionSchema = z.object({
  versionId: z.string().min(1).max(64),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["EDITOR", "VIEWER"]),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const aiRequestSchema = z.object({
  documentId: z.string().min(1).max(64),
  action: z.enum(["summarize", "improve", "title"]),
  content: z.string().max(MAX_CONTENT_LENGTH),
});

/** Reject oversized JSON payloads before parsing */
export const MAX_PAYLOAD_BYTES = 512_000;

/**
 * Returns false only when Content-Length is present AND exceeds the max.
 * Missing Content-Length is allowed (body size is still bounded by Zod).
 */
export function validatePayloadSize(
  contentLength: number | null,
  max = MAX_PAYLOAD_BYTES
): boolean {
  if (contentLength === null || Number.isNaN(contentLength)) return true;
  return contentLength <= max;
}

export function parseJsonSafely<T>(
  body: unknown,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map((i) => i.message).join(", "),
    };
  }
  return { success: true, data: result.data };
}
