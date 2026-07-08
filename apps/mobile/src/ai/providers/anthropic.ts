import type { CoachTool, ProviderMessage, ProviderTurn } from '@/ai/types';

/**
 * Anthropic Messages API over plain fetch (no SDK).
 * Wire shape: content blocks incl. tool_use / tool_result; images as base64
 * source blocks. Consecutive same-role turns are merged (roles must alternate).
 */

const API_URL = 'https://api.anthropic.com/v1/messages';

interface WireMessage {
  role: 'user' | 'assistant';
  content: Record<string, unknown>[];
}

interface AnthropicContentBlock {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
  }
}

function toWire(messages: ProviderMessage[]): WireMessage[] {
  const wire: WireMessage[] = [];
  const push = (role: WireMessage['role'], blocks: Record<string, unknown>[]) => {
    if (!blocks.length) return;
    const last = wire[wire.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else wire.push({ role, content: blocks });
  };

  for (const m of messages) {
    if (m.role === 'tool' && m.toolResult) {
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: m.toolResult.callId,
          content: safeJson(m.toolResult.result),
        },
      ]);
    } else if (m.role === 'assistant') {
      const blocks: Record<string, unknown>[] = [];
      if (m.text && m.text.trim()) blocks.push({ type: 'text', text: m.text });
      for (const call of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args });
      }
      push('assistant', blocks);
    } else if (m.role === 'user') {
      const blocks: Record<string, unknown>[] = [];
      if (m.imageBase64) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: m.imageBase64.mediaType,
            data: m.imageBase64.data,
          },
        });
      }
      if (m.text && m.text.trim()) blocks.push({ type: 'text', text: m.text });
      push('user', blocks);
    }
  }

  // First message must be from the user.
  while (wire.length && wire[0].role !== 'user') wire.shift();
  return wire;
}

export async function chatAnthropic(
  cfg: { apiKey: string; model: string },
  system: string,
  messages: ProviderMessage[],
  tools: CoachTool[],
): Promise<ProviderTurn> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: 1024,
    system,
    messages: toWire(messages),
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach Claude — check your internet connection.');
  }

  if (!res.ok) {
    // Never echo the API key; keep the server detail short.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`Claude API error (HTTP ${res.status}): ${detail || res.statusText}`);
  }

  const json = (await res.json()) as { content?: AnthropicContentBlock[] };
  const turn: ProviderTurn = { text: '', toolCalls: [] };
  for (const block of json.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') {
      turn.text += (turn.text ? '\n' : '') + block.text;
    } else if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string') {
      const args =
        typeof block.input === 'object' && block.input !== null
          ? (block.input as Record<string, unknown>)
          : {};
      turn.toolCalls.push({ id: block.id, name: block.name, args });
    }
  }
  return turn;
}
