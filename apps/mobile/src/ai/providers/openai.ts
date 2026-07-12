import type { CoachTool, ProviderMessage, ProviderTurn } from '@/ai/types';

/**
 * OpenAI Chat Completions API over plain fetch (no SDK).
 * Tools via tools/tool_calls JSON; images as data-URI image_url parts.
 *
 * The wire format is shared by every OpenAI-compatible endpoint, so the core
 * (`chatOpenAiCompatible`) is parameterised by base URL / label / token field —
 * Groq (src/ai/providers/groq.ts) reuses it verbatim.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

interface WireToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireChoiceMessage {
  content?: string | null;
  tool_calls?: WireToolCall[];
}

interface WireChoice {
  message?: WireChoiceMessage;
  finish_reason?: string | null;
}

const MAX_COMPLETION_TOKENS = 4096;

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

export interface OpenAiCompatibleConfig {
  apiKey: string;
  model: string;
  /** Full chat-completions endpoint. Defaults to OpenAI. */
  baseUrl?: string;
  /** Provider name for user-facing error messages. */
  label?: string;
  /** Token-limit field name — OpenAI uses `max_completion_tokens`, Groq `max_tokens`. */
  maxTokensField?: string;
}

/** Any OpenAI-compatible chat endpoint (OpenAI, Groq, …). */
export async function chatOpenAiCompatible(
  cfg: OpenAiCompatibleConfig,
  system: string,
  messages: ProviderMessage[],
  tools: CoachTool[],
): Promise<ProviderTurn> {
  const url = cfg.baseUrl ?? OPENAI_URL;
  const label = cfg.label ?? 'OpenAI';
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: toWire(system, messages),
    // The token cap counts reasoning tokens too — a low cap lets a reasoning
    // model (gpt-5*) spend it all thinking and return empty content.
    [cfg.maxTokensField ?? 'max_completion_tokens']: MAX_COMPLETION_TOKENS,
  };
  // gpt-5* are reasoning models: cap the reasoning budget so the completion
  // isn't starved. Only OpenAI's gpt-5 slugs accept this param (Groq's models
  // never match `gpt-5`, so the shared core stays safe).
  if (/^gpt-5/i.test(cfg.model)) body.reasoning_effort = 'low';
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Could not reach ${label} — check your internet connection.`);
  }

  if (!res.ok) {
    // Never echo the API key; keep the server detail short.
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`${label} API error (HTTP ${res.status}): ${detail || res.statusText}`);
  }

  const json = (await res.json()) as { choices?: WireChoice[] };
  const choice = json.choices?.[0];
  const msg = choice?.message;
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
  // Truncated by the token cap with nothing usable to show: surface it as a
  // plain reply instead of an empty message (which reads as a silent failure).
  if (choice?.finish_reason === 'length' && !turn.text.trim() && !turn.toolCalls.length) {
    turn.text =
      'That answer was cut off before it finished. Try asking something more specific, or break it into smaller questions.';
  }
  return turn;
}

/** OpenAI Chat Completions. */
export function chatOpenAi(
  cfg: { apiKey: string; model: string },
  system: string,
  messages: ProviderMessage[],
  tools: CoachTool[],
): Promise<ProviderTurn> {
  return chatOpenAiCompatible({ ...cfg, baseUrl: OPENAI_URL, label: 'OpenAI' }, system, messages, tools);
}
