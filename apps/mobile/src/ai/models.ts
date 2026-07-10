/** Model pickers for Settings. IDs are current API aliases (no date suffixes). */

export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

export const ANTHROPIC_MODELS: { id: string; label: string }[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

export const DEFAULT_OPENAI_MODEL = 'gpt-5';

export const OPENAI_MODELS: { id: string; label: string }[] = [
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
];

// Groq uses OpenAI-compatible chat completions + tool calling. Slugs can change
// as Groq rotates hosted models — update here if one 404s.
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export const GROQ_MODELS: { id: string; label: string }[] = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fast)' },
];
