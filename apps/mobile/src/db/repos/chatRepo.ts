import { getDb } from '@/db';
import { uuid } from '@/lib/uuid';
import type { ChatMessage, MessageKind, MessageRole } from '@/types/models';

// ---------------------------------------------------------------- rows

interface ChatRow {
  id: string;
  role: string;
  kind: string;
  text: string;
  payload: string | null;
  image_uri: string | null;
  created_at: number;
}

function parsePayload(raw: string | null): unknown | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function mapMessage(r: ChatRow): ChatMessage {
  return {
    id: r.id,
    role: r.role as MessageRole,
    kind: r.kind as MessageKind,
    text: r.text,
    payload: parsePayload(r.payload),
    createdAt: r.created_at,
    imageUri: r.image_uri,
  };
}

// ---------------------------------------------------------------- api

/** Ascending by createdAt; when `limit` is given, the LAST `limit` messages. */
export async function getMessages(limit?: number): Promise<ChatMessage[]> {
  const db = getDb();
  if (limit != null) {
    const rows = await db.getAllAsync<ChatRow>(
      'SELECT * FROM chat_messages ORDER BY created_at DESC, rowid DESC LIMIT ?',
      [limit],
    );
    return rows.reverse().map(mapMessage);
  }
  const rows = await db.getAllAsync<ChatRow>(
    'SELECT * FROM chat_messages ORDER BY created_at ASC, rowid ASC',
  );
  return rows.map(mapMessage);
}

export async function addMessage(input: {
  /** Reuse a caller-supplied id (e.g. the chat store's optimistic bubble) so the
   *  persisted row keeps the same FlatList key and doesn't remount/re-animate. */
  id?: string;
  role: MessageRole;
  kind?: MessageKind;
  text: string;
  payload?: unknown | null;
  imageUri?: string | null;
}): Promise<ChatMessage> {
  const message: ChatMessage = {
    id: input.id ?? uuid(),
    role: input.role,
    kind: input.kind ?? 'text',
    text: input.text,
    payload: input.payload ?? null,
    createdAt: Date.now(),
    imageUri: input.imageUri ?? null,
  };
  await getDb().runAsync(
    `INSERT INTO chat_messages(id, role, kind, text, payload, image_uri, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.role,
      message.kind,
      message.text,
      message.payload === null ? null : JSON.stringify(message.payload),
      message.imageUri ?? null,
      message.createdAt,
    ],
  );
  return message;
}

export async function clearHistory(): Promise<void> {
  await getDb().runAsync('DELETE FROM chat_messages');
}
