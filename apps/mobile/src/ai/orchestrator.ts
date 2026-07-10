/**
 * Coach orchestrator: persists the user message, routes to the configured
 * provider (cloud tool-loop or local fallback), executes tools, persists the
 * coach reply + one message per rich card. NEVER throws to the UI.
 */
import * as FileSystem from 'expo-file-system/legacy';

import * as chatRepo from '@/db/repos/chatRepo';
import * as userRepo from '@/db/repos/userRepo';
import { getAnthropicKey, getGroqKey, getOpenAiKey } from '@/lib/keys';
import { todayISO } from '@/lib/date';
import { useSettings } from '@/store/settingsStore';
import type { AiProviderId, ChatMessage } from '@/types/models';

import { localCoachReply, type LocalReply } from '@/ai/localCoach';
import { chatAnthropic } from '@/ai/providers/anthropic';
import { chatGroq } from '@/ai/providers/groq';
import { chatOpenAi } from '@/ai/providers/openai';
import { buildSystemPrompt } from '@/ai/system';
import { COACH_TOOLS } from '@/ai/tools';
import type { CoachCard, ProviderMessage, ProviderTurn } from '@/ai/types';

const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 20;

const KEY_HINT =
  'Tip: I answered with the built-in local coach. Add a Claude, OpenAI or Groq API key in Settings for full conversational AI (and meal-photo estimation on Claude/OpenAI).';

function genericHelp(): LocalReply {
  return {
    text: [
      "I'm your coach — talk to me naturally. Try:",
      '• "What\'s my workout today?" / "Aaj kya karna hai?"',
      '• "Bench press 80 kg for 8, 7 and 6"',
      '• "I had 2 rotis, dal and butter chicken"',
      '• "How much protein left today?" · "Show my PRs" · "Weekly summary"',
    ].join('\n'),
    cards: [],
  };
}

function mediaTypeFromUri(uri: string): string {
  const ext = uri.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

async function readImageBase64(
  uri: string,
): Promise<{ data: string; mediaType: string } | null> {
  try {
    const data = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    return data ? { data, mediaType: mediaTypeFromUri(uri) } : null;
  } catch {
    return null;
  }
}

async function executeToolCall(
  call: ProviderTurn['toolCalls'][number],
  cards: CoachCard[],
): Promise<unknown> {
  const tool = COACH_TOOLS.find((t) => t.name === call.name);
  if (!tool) return { error: `Unknown tool: ${call.name}` };
  try {
    const args = typeof call.args === 'object' && call.args !== null ? call.args : {};
    const run = await tool.execute(args);
    if (run.card) cards.push(run.card);
    return run.resultForModel;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Tool execution failed.' };
  }
}

async function persistReply(saved: ChatMessage[], text: string, cards: CoachCard[]): Promise<void> {
  saved.push(await chatRepo.addMessage({ role: 'coach', kind: 'text', text }));
  for (const card of cards) {
    saved.push(
      await chatRepo.addMessage({
        role: 'coach',
        kind: card.kind,
        text: card.text,
        payload: card.payload,
      }),
    );
  }
}

/**
 * Send one user message to the coach. Returns ALL newly persisted messages in
 * order (user message, coach text, one message per card). Errors surface as a
 * persisted 'error'-kind message — this function never throws.
 */
export async function sendToCoach(
  userText: string,
  imageUri?: string | null,
  userMessageId?: string,
): Promise<ChatMessage[]> {
  const saved: ChatMessage[] = [];
  try {
    saved.push(
      await chatRepo.addMessage({
        id: userMessageId,
        role: 'user',
        text: userText,
        imageUri: imageUri ?? null,
      }),
    );
  } catch {
    return saved; // DB unavailable — nothing else we can do.
  }

  try {
    const settings = useSettings.getState();
    let provider: AiProviderId = settings.ai.provider;
    let apiKey: string | null = null;
    let missingKey = false;

    if (provider === 'anthropic') {
      apiKey = await getAnthropicKey();
      if (!apiKey) {
        provider = 'local';
        missingKey = true;
      }
    } else if (provider === 'openai') {
      apiKey = await getOpenAiKey();
      if (!apiKey) {
        provider = 'local';
        missingKey = true;
      }
    } else if (provider === 'groq') {
      apiKey = await getGroqKey();
      if (!apiKey) {
        provider = 'local';
        missingKey = true;
      }
    }

    if (provider === 'local') {
      const reply = (await localCoachReply(userText)) ?? genericHelp();
      await persistReply(saved, reply.text, reply.cards);
      if (missingKey) {
        saved.push(await chatRepo.addMessage({ role: 'coach', kind: 'text', text: KEY_HINT }));
      }
      return saved;
    }

    // ---------------------------------------------------------- cloud path
    if (!apiKey) throw new Error('Missing API key.'); // unreachable; narrows type
    const profile = await userRepo.getProfile();
    const system = buildSystemPrompt(profile, todayISO());

    const history = await chatRepo.getMessages(HISTORY_LIMIT);
    const msgs: ProviderMessage[] = [];
    for (const m of history) {
      if (m.kind === 'error' || !m.text.trim()) continue;
      msgs.push({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text });
    }
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();

    // The wire conversation MUST end on the current user turn: a caption-less
    // photo send has empty text and is dropped by the filter above, which would
    // leave a trailing assistant turn (rejected as a prefill — HTTP 400 on
    // Claude Sonnet 5 / Opus 4.8) and glue the image to a stale earlier message.
    const caption = userText.trim();
    const last = msgs[msgs.length - 1];
    const endsWithCurrentTurn = caption.length > 0 && last?.role === 'user' && last.text === caption;
    if (!msgs.length || !endsWithCurrentTurn) {
      if (imageUri || !msgs.length) {
        msgs.push({
          role: 'user',
          text: caption || 'Meal photo attached — estimate the calories and macros, then log it.',
        });
      }
    }

    if (imageUri && provider === 'groq') {
      // Groq's text models can't see images — replace the photo prompt with a
      // clear note instead of letting Groq reject the request (HTTP 400).
      msgs[msgs.length - 1].text =
        (caption ? `${caption}\n\n` : '') +
        "(I can't analyze photos on Groq — add a Claude or OpenAI key for meal-photo estimates, or describe the meal in words and I'll log it.)";
    } else if (imageUri) {
      const image = await readImageBase64(imageUri);
      if (image) msgs[msgs.length - 1].imageBase64 = image;
    }

    const chat =
      provider === 'anthropic' ? chatAnthropic : provider === 'groq' ? chatGroq : chatOpenAi;
    const cfg = {
      apiKey,
      model:
        provider === 'anthropic'
          ? settings.ai.anthropicModel
          : provider === 'groq'
            ? settings.ai.groqModel
            : settings.ai.openaiModel,
    };

    const cards: CoachCard[] = [];
    let finalText = '';
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const turn = await chat(cfg, system, msgs, COACH_TOOLS);
      if (!turn.toolCalls.length) {
        finalText = turn.text;
        break;
      }
      msgs.push({ role: 'assistant', text: turn.text, toolCalls: turn.toolCalls });
      for (const call of turn.toolCalls) {
        const result = await executeToolCall(call, cards);
        msgs.push({ role: 'tool', toolResult: { callId: call.id, result } });
      }
      finalText = turn.text; // best available if we exhaust the round budget
    }
    if (!finalText.trim()) finalText = cards.length ? 'Done — details below.' : 'Done!';

    await persistReply(saved, finalText, cards);
    return saved;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Something went wrong.';
    try {
      saved.push(
        await chatRepo.addMessage({
          role: 'coach',
          kind: 'error',
          text: `${detail}\n\nCheck your API key and connection in Settings — or switch to the built-in Local coach, which works fully offline.`,
        }),
      );
    } catch {
      // Persistence itself failed; return what we have.
    }
    return saved;
  }
}
