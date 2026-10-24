import type { ToolCall, ToolCallUpdate } from '@agentclientprotocol/sdk';
import type { TokenState } from '../../types/chat';
import type { InferenceMetadata, Message, NotificationEvent } from '../../types/message';

export type AcpChatStateChange =
  | { type: 'messages'; messages: Message[] }
  | { type: 'tokenState'; tokenState: Partial<TokenState> }
  | { type: 'progressMessage'; message: string | undefined }
  | {
      type: 'sessionInfo';
      name?: string;
      activeRunId?: string | null;
      mayhemMode?: string;
    }
  | { type: 'localSteerConfirmed'; messageId: string }
  | { type: 'notification'; notification: NotificationEvent };

export interface AdapterState {
  messages: Message[];
  localSteerTextByMessageId: Map<string, string>;
  toolCallStatesById: Map<string, ToolCallState>;
}

export type ToolCallState = Omit<ToolCallUpdate, '_meta'>;

export interface MayhemMessageMeta {
  messageId?: string;
  created?: number;
  outputTokenLimitReached?: boolean;
  fallbackContent?: boolean;
  operationLogs?: string[];
  steer?: boolean;
  inference?: InferenceMetadata;
}

export interface ToolIdentity {
  toolName?: string;
  extensionName?: string;
}

export const DEFAULT_VISIBLE_MESSAGE_METADATA: Message['metadata'] = {
  userVisible: true,
  agentVisible: true,
};

export function messagesChange(state: AdapterState): AcpChatStateChange[] {
  // Pass the live array by reference: the store is the only consumer and it
  // clones on write (applyChatStateChanges). Cloning here as well made every
  // streamed chunk O(messages) twice, which turns session-load replay into
  // O(n^2) on large sessions.
  return [{ type: 'messages', messages: state.messages }];
}

export function cloneMessage(message: Message): Message {
  return {
    ...message,
    content: message.content.map((content) => ({ ...content })),
    metadata: { ...message.metadata },
  };
}

export function getMayhemMessageMeta(update: { _meta?: unknown }): MayhemMessageMeta {
  if (!isRecord(update._meta)) {
    return {};
  }

  const mayhem = update._meta.mayhem;
  if (!isRecord(mayhem)) {
    return {};
  }

  const outputTokenLimitReached = mayhem.outputTokenLimitReached === true;
  const operationLogs = Array.isArray(mayhem.operationLogs)
    ? mayhem.operationLogs.filter((line): line is string => typeof line === 'string')
    : undefined;

  return {
    created: typeof mayhem.created === 'number' ? mayhem.created : undefined,
    messageId: typeof mayhem.messageId === 'string' ? mayhem.messageId : undefined,
    outputTokenLimitReached: outputTokenLimitReached ? true : undefined,
    fallbackContent: mayhem.fallbackContent === true ? true : undefined,
    operationLogs,
    steer: mayhem.steer === true ? true : undefined,
    inference: getInferenceMeta(mayhem.inference),
  };
}

function getInferenceMeta(inference: unknown): InferenceMetadata | undefined {
  if (
    !isRecord(inference) ||
    typeof inference.provider !== 'string' ||
    typeof inference.requestedModel !== 'string'
  ) {
    return undefined;
  }

  return {
    provider: inference.provider,
    requestedModel: inference.requestedModel,
    ...(typeof inference.resolvedModel === 'string'
      ? { resolvedModel: inference.resolvedModel }
      : {}),
  };
}

export function applyInferenceMeta(message: Message, mayhemMeta: MayhemMessageMeta): void {
  if (message.role === 'assistant' && mayhemMeta.inference) {
    message.metadata.inference = mayhemMeta.inference;
  }
}

export function getMayhemActiveRunId(update: { _meta?: unknown }): string | null | undefined {
  if (!isRecord(update._meta)) {
    return undefined;
  }

  const mayhem = update._meta.mayhem;
  if (!isRecord(mayhem) || !('activeRunId' in mayhem)) {
    return undefined;
  }

  return typeof mayhem.activeRunId === 'string' || mayhem.activeRunId === null
    ? mayhem.activeRunId
    : undefined;
}

export function getMayhemQueuedSteer(update: { _meta?: unknown }): string | undefined {
  if (!isRecord(update._meta)) return undefined;
  const mayhem = update._meta.mayhem;
  if (!isRecord(mayhem) || !isRecord(mayhem.queuedSteer)) return undefined;
  return typeof mayhem.queuedSteer.messageId === 'string' ? mayhem.queuedSteer.messageId : undefined;
}

export function rawInputToArguments(rawInput: unknown): Record<string, unknown> {
  return isRecord(rawInput) ? rawInput : {};
}

export function toolIdentity(update: ToolCall | ToolCallUpdate): ToolIdentity {
  if (!isRecord(update._meta)) {
    return {};
  }

  const mayhem = update._meta.mayhem;
  if (!isRecord(mayhem) || !isRecord(mayhem.toolCall)) {
    return {};
  }

  return {
    toolName: typeof mayhem.toolCall.toolName === 'string' ? mayhem.toolCall.toolName : undefined,
    extensionName:
      typeof mayhem.toolCall.extensionName === 'string' ? mayhem.toolCall.extensionName : undefined,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
