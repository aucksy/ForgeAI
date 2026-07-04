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
