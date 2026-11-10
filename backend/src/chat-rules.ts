import { z } from "zod";

export const MAX_CODEPOINTS = 2000;
export const MAX_BYTES = 16 * 1024;
export const HISTORY_DEFAULT = 50, HISTORY_MAX = 100, INBOX_DEFAULT = 30, INBOX_MAX = 50;
export const MAX_REPORT_MESSAGES = 10;

export const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = z.string().regex(uuidRe, "Invalid reference");
const seq = z.int().min(1).max(2147483647);

/** Trim surrounding whitespace (internal newlines kept); plain text only. Same rules run client-side. */
export function normalizeBody(raw: string): { ok: true; body: string } | { ok: false; message: string } {
  const body = raw.trim();
  if (!body) return { ok: false, message: "Write a message first." };
  // NUL and lone surrogates cannot be stored as UTF-8 text.
  if (body.includes("\u0000") || Buffer.from(body, "utf8").toString("utf8") !== body) return { ok: false, message: "This message contains characters we can't send." };
  if ([...body].length > MAX_CODEPOINTS) return { ok: false, message: `Messages can be up to ${MAX_CODEPOINTS.toLocaleString("en-US")} characters.` };
  if (Buffer.byteLength(body, "utf8") > MAX_BYTES) return { ok: false, message: "This message is too large to send." };
  return { ok: true, body };
}

// Client events: strict, bounded, never carrying sender, recipient, room, timestamp or closure state.
export const sendPayload = z.strictObject({ matchId: uuid, clientMessageId: uuid, body: z.string().max(40_000) });
export const receiptPayload = z.strictObject({ matchId: uuid, throughSeq: seq });
export const typingPayload = z.strictObject({ matchId: uuid, active: z.boolean() });
export const refreshPayload = z.strictObject({ token: z.string().min(10).max(4096) });

export const historyQuery = z.strictObject({
  beforeSeq: z.coerce.number().pipe(seq).optional(),
  afterSeq: z.coerce.number().pipe(z.int().min(0).max(2147483647)).optional(),
  limit: z.coerce.number().pipe(z.int().min(1).max(HISTORY_MAX)).default(HISTORY_DEFAULT),
}).refine((q) => q.beforeSeq === undefined || q.afterSeq === undefined, { message: "Use beforeSeq or afterSeq, not both", path: ["beforeSeq"] });

export const inboxQuery = z.strictObject({
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().pipe(z.int().min(1).max(INBOX_MAX)).default(INBOX_DEFAULT),
});

export const inboxCursor = z.strictObject({ g: z.union([z.literal(0), z.literal(1)]), t: z.iso.datetime(), id: uuid });
export const encodeCursor = (c: z.infer<typeof inboxCursor>) => Buffer.from(JSON.stringify(c)).toString("base64url");
export function decodeCursor(s: string) {
  try { return inboxCursor.parse(JSON.parse(Buffer.from(s, "base64url").toString("utf8"))); } catch { return null; }
}
