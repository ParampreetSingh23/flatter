export type ConvState = "ACTIVE" | "READ_ONLY" | "UNAVAILABLE";
export interface ChatMessage { id: string; seq: number; mine: boolean; body: string; createdAt: string; clientMessageId?: string }
export interface ChatPeer { displayName: string | null; avatarUrl: string | null; publicId: string | null }
export interface Cursor { delivered: number; read: number }
export interface InboxItem {
  id: string; state: ConvState; peer: ChatPeer; matchedAt: string; lastMessageAt: string | null; unread: number;
  last: { seq: number; mine: boolean; body: string; createdAt: string } | null;
}
export interface Inbox { conversations: InboxItem[]; nextCursor: string | null; unreadTotal: number }
export interface Snapshot {
  id: string; state: ConvState; peer: ChatPeer; headSeq: number; endedAt: string | null; unread: number;
  cursors: { me: Cursor; peer: Cursor }; messages: ChatMessage[]; hasMore: boolean;
}
export interface HistoryPage { messages: ChatMessage[]; hasMore: boolean; headSeq: number; state: ConvState }

// Same rules the server enforces (chat-rules.ts); the server remains the authority.
export const MAX_CODEPOINTS = 2000;
export const MAX_BYTES = 16 * 1024;
export function normalizeBody(raw: string): { ok: true; body: string } | { ok: false; message: string } {
  const body = raw.trim();
  if (!body) return { ok: false, message: "Write a message first." };
  const wellFormed = (body as string & { isWellFormed?: () => boolean }).isWellFormed?.() ?? true;
  if (body.includes("\u0000") || !wellFormed) return { ok: false, message: "This message contains characters we can't send." };
  if ([...body].length > MAX_CODEPOINTS) return { ok: false, message: `Messages can be up to ${MAX_CODEPOINTS.toLocaleString("en-US")} characters.` };
  if (new TextEncoder().encode(body).length > MAX_BYTES) return { ok: false, message: "This message is too large to send." };
  return { ok: true, body };
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: { code: string; message?: string } };
export type ChatEvent = { name: string; data: unknown };
