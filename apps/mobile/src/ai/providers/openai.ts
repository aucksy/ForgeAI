import type { CoachTool, ProviderMessage, ProviderTurn } from '@/ai/types';

/**
 * OpenAI Chat Completions API over plain fetch (no SDK).
 * Tools via tools/tool_calls JSON; images as data-URI image_url parts.
 */

const API_URL = 'https://api.openai.com/v1/chat/completions';

interface WireToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireChoiceMessage {
  content?: string | null;
  tool_calls?: WireToolCall[];
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
  }
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toWire(system: string, messages: ProviderMessage[]): Record<string, unknown>[] {
  const wire: Record<string, unknown>[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'tool' && m.toolResult) {
      wire.push({
        role: 'tool',
        tool_call_id: m.toolResult.callId,
        content: safeJson(m.toolResult.result),
      });
    } else if (m.role === 'assistant') {
      const msg: Record<string, unknown> = {
        role: 'assistant',
        content: m.text && m.text.trim() ? m.text : null,
      };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: safeJson(c.args) },
        }));
      }
      wire.push(msg);
    } else if (m.role === 'user') {
      if (m.imageBase64) {
        wire.push({
          role: 'user',
          content: [
            ...(m.text && m.text.trim() ? [{ type: 'text', text: m.text }] : []),
            {
              type: 'image_url',
              image_url: {
                url: `data:${m.imageBase64.mediaType};base64,${m.imageBase64.data}`,
              },
            },
          ],
        });
      } else {
        wire.push({ role: 'user', content: m.text ?? '' });
      }
    }
  }
  return wire;
}

export async function chatOpenAi(
  cfg: { apiKey: string; model: string },
  system: string,
  messages: ProviderMessage[],
  tools: CoachTool[],
): Promise<ProviderTurn> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: toWire(system, messages),
    max_completion_tokens: 1024,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach OpenAI — check your internet connection.');
  }

  if (!res.ok) {
    // Never echo the API key; keep the server detail short.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`OpenAI API error (HTTP ${res.status}): ${detail || res.statusText}`);
  }

  const json = (await res.json()) as { choices?: { message?: WireChoiceMessage }[] };
  const msg = json.choices?.[0]?.message;
  const turn: ProviderTurn = { text: typeof msg?.content === 'string' ? msg.content : '', toolCalls: [] };
  for (const call of msg?.tool_calls ?? []) {
    if (typeof call.id === 'string' && typeof call.function?.name === 'string') {
      turn.toolCalls.push({
        id: call.id,
        name: call.function.name,
        args: parseArgs(call.function.arguments),
      });
    }
  }
  return turn;
}
