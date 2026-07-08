import type { MessageKind } from '@/types/models';

/** A rich chat card produced by a tool run (rendered by chat-ui per kind). */
export interface CoachCard {
  kind: MessageKind;
  text: string;
  payload: unknown | null;
}

/** Result of executing one coach tool. `resultForModel` must stay COMPACT. */
export interface ToolRunResult {
  resultForModel: unknown;
  card?: CoachCard;
}

export interface CoachTool {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>): Promise<ToolRunResult>;
}

/** One assistant turn as returned by a provider. */
export interface ProviderTurn {
  text: string;
  toolCalls: { id: string; name: string; args: Record<string, unknown> }[];
}

/** Provider-agnostic conversation message (mapped to each wire format). */
export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool';
  text?: string;
  imageBase64?: { data: string; mediaType: string };
  /** assistant tool-use turns */
  toolCalls?: ProviderTurn['toolCalls'];
  toolResult?: { callId: string; result: unknown };
}
