import { chatOpenAiCompatible } from '@/ai/providers/openai';
import type { CoachTool, ProviderMessage, ProviderTurn } from '@/ai/types';

/**
 * Groq chat completions — OpenAI-compatible endpoint, so it reuses the exact
 * OpenAI wire format + tool-calling loop. Groq expects `max_tokens` (not
 * `max_completion_tokens`). Keys start with `gsk_`. Note: the default text
 * models don't do vision, so meal-photo estimation needs a Claude/OpenAI key.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export function chatGroq(
  cfg: { apiKey: string; model: string },
  system: string,
  messages: ProviderMessage[],
  tools: CoachTool[],
): Promise<ProviderTurn> {
  return chatOpenAiCompatible(
    { ...cfg, baseUrl: GROQ_URL, label: 'Groq', maxTokensField: 'max_tokens' },
    system,
    messages,
    tools,
  );
}
