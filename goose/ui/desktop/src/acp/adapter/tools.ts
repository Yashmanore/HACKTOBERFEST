import type {
  ContentBlock as AcpContentBlock,
  ToolCall,
  ToolCallUpdate,
} from '@agentclientprotocol/sdk';
import type { Message } from '../../types/message';
import type { ContentBlock as MayhemContentBlock } from '../../types/message';
import { findMessageForChunk } from './messages';
import { toolNotificationChange } from './toolNotifications';
import {
  type AcpChatStateChange,
  type AdapterState,
  applyInferenceMeta,
  DEFAULT_VISIBLE_MESSAGE_METADATA,
  type MayhemMessageMeta,
  getMayhemMessageMeta,
  isRecord,
  messagesChange,
  rawInputToArguments,
  toolIdentity,
  type ToolIdentity,
  type ToolCallState,
} from './shared';

export function applyToolCall(state: AdapterState, update: ToolCall): AcpChatStateChange[] {
  updateToolCallState(state, update);

  const mayhemMeta = getMayhemMessageMeta(update);
  const message = getOrCreateAssistantMessageForUpdate(state, mayhemMeta);
  applyInferenceMeta(message, mayhemMeta);

  if (
    message.content.some(
      (content) => content.type === 'toolRequest' && content.id === update.toolCallId
    )
  ) {
    return messagesChange(state);
  }

  const identity = toolIdentity(update);
  const metadata = toolRequestMetadata(update, identity);

  message.content.push({
    type: 'toolRequest',
    id: update.toolCallId,
    toolCall: {
      status: 'success',
      value: {
        name: identity.toolName ?? update.title,
        arguments: rawInputToArguments(update.rawInput),
      },
    },
    ...(metadata ? { metadata } : {}),
    ...(update._meta ? { _meta: update._meta } : {}),
  });

  return messagesChange(state);
}

export function applyToolCallUpdate(
  state: AdapterState,
  update: ToolCallUpdate
): AcpChatStateChange[] {
  const toolCallState = updateToolCallState(state, update);
  const isFinished = toolCallState.status === 'completed' || toolCallState.status === 'failed';

  if (!isFinished) {
    const notificationChange = toolNotificationChange(update);
    return notificationChange ? [notificationChange] : [];
  }

  if (hasToolResponse(state, update.toolCallId)) {
    state.toolCallStatesById.delete(update.toolCallId);
    return messagesChange(state);
  }

  const mayhemMeta = getMayhemMessageMeta(update);
  const message = getOrCreateToolResponseMessageForUpdate(state, mayhemMeta);
  const identity = toolIdentity(update);
  const metadata = toolResponseMetadata(toolCallState, identity);

  message.content.push({
    type: 'toolResponse',
    id: update.toolCallId,
    toolResult: {
      status: 'success',
      value: toolResultValue(
        toolCallState,
        toolResultMetadata(update),
        toolCallState.status === 'failed'
      ),
    },
    ...(metadata ? { metadata } : {}),
  });

  state.toolCallStatesById.delete(update.toolCallId);
  return messagesChange(state);
}

function updateToolCallState(
  state: AdapterState,
  update: ToolCall | ToolCallUpdate
): ToolCallState {
  const toolCallState = mergeToolCallState(state.toolCallStatesById.get(update.toolCallId), update);
  state.toolCallStatesById.set(update.toolCallId, toolCallState);
  return toolCallState;
}

function mergeToolCallState(
  previous: ToolCallState | undefined,
  update: ToolCall | ToolCallUpdate
): ToolCallState {
  const { _meta: _ignoredMeta, ...toolCallStateUpdate } = update;
  return { ...previous, ...toolCallStateUpdate };
}

function getOrCreateAssistantMessageForUpdate(
  state: AdapterState,
  mayhemMeta: MayhemMessageMeta
): Message {
  const existing = findMessageForChunk(state, 'assistant', mayhemMeta.messageId, mayhemMeta.created);
  if (existing) {
    if (mayhemMeta.operationLogs) {
      existing.metadata.operationLogs = mayhemMeta.operationLogs;
    }
    return existing;
  }

  const message: Message = {
    ...(mayhemMeta.messageId ? { id: mayhemMeta.messageId } : {}),
    role: 'assistant',
    created: mayhemMeta.created ?? Math.floor(Date.now() / 1000),
    content: [],
    metadata: {
      ...DEFAULT_VISIBLE_MESSAGE_METADATA,
      ...(mayhemMeta.operationLogs ? { operationLogs: mayhemMeta.operationLogs } : {}),
    },
  };
  state.messages.push(message);
  return message;
}

function getOrCreateToolResponseMessageForUpdate(
  state: AdapterState,
  mayhemMeta: MayhemMessageMeta
): Message {
  if (mayhemMeta.messageId) {
    const existing = state.messages.find(
      (message) => message.id === mayhemMeta.messageId && message.role === 'user'
    );
    if (existing) {
      return existing;
    }
  }

  const message: Message = {
    ...(mayhemMeta.messageId ? { id: mayhemMeta.messageId } : {}),
    role: 'user',
    created: mayhemMeta.created ?? Math.floor(Date.now() / 1000),
    content: [],
    metadata: { ...DEFAULT_VISIBLE_MESSAGE_METADATA },
  };
  state.messages.push(message);
  return message;
}

function hasToolResponse(state: AdapterState, toolCallId: string): boolean {
  return state.messages.some((message) =>
    message.content.some((content) => content.type === 'toolResponse' && content.id === toolCallId)
  );
}

function toolRequestMetadata(
  update: ToolCall,
  identity: ToolIdentity
): Record<string, unknown> | undefined {
  return baseToolMetadata(update, identity);
}

function toolResponseMetadata(
  update: ToolCallUpdate,
  identity: ToolIdentity
): Record<string, unknown> | undefined {
  const metadata = baseToolMetadata(update, identity) ?? {};
  if (update.rawOutput !== undefined) {
    metadata.rawOutput = update.rawOutput;
  }
  if (update.content) {
    metadata.content = update.content;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function baseToolMetadata(
  update: ToolCall | ToolCallUpdate,
  identity: ToolIdentity
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};

  if (update.title) {
    metadata.title = update.title;
  }
  if (update.status) {
    metadata.status = update.status;
  }
  if (identity.extensionName) {
    metadata.extensionName = identity.extensionName;
  }
  if (update.kind) {
    metadata.kind = update.kind;
  }
  if (update.locations) {
    metadata.locations = update.locations;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function toolResultValue(
  update: ToolCallUpdate,
  meta: DesktopToolResultMeta | undefined,
  isError: boolean
): ToolResultValue {
  const content = toolResultContent(update);
  if (isError && content.length === 0) {
    const errorText =
      typeof update.rawOutput === 'string' && update.rawOutput.trim()
        ? update.rawOutput
        : (update.title ?? 'Tool call failed');
    content.push({ type: 'text', text: errorText });
  }

  const toolResult: ToolResultValue = {
    content,
    isError,
    ...(meta ? { _meta: meta } : {}),
  };

  if (update.rawOutput !== undefined) {
    toolResult.structuredContent = update.rawOutput;
  }

  return toolResult;
}

function toolResultContent(update: ToolCallUpdate): MayhemContentBlock[] {
  const content: MayhemContentBlock[] = [];

  for (const item of update.content ?? []) {
    if (item.type !== 'content') {
      continue;
    }

    const block = apiContentBlockFromAcpContentBlock(item.content);
    if (block) {
      content.push(block);
    }
  }

  if (content.length > 0) {
    return content;
  }

  if (typeof update.rawOutput === 'string') {
    return [{ type: 'text', text: update.rawOutput }];
  }

  return [];
}

function apiContentBlockFromAcpContentBlock(
  content: AcpContentBlock
): MayhemContentBlock | undefined {
  switch (content.type) {
    case 'text':
      return {
        type: 'text',
        text: content.text,
        ...(content._meta ? { _meta: content._meta } : {}),
      };
    case 'image':
      return {
        type: 'image',
        data: content.data,
        mimeType: content.mimeType,
        ...(content._meta ? { _meta: content._meta } : {}),
      };
    case 'audio':
      return {
        type: 'audio',
        data: content.data,
        mimeType: content.mimeType,
      };
    case 'resource_link':
      return {
        type: 'resource_link',
        uri: content.uri,
        name: content.name,
        ...(content.description ? { description: content.description } : {}),
        ...(content.mimeType ? { mimeType: content.mimeType } : {}),
        ...(content.size !== undefined && content.size !== null ? { size: content.size } : {}),
        ...(content.title ? { title: content.title } : {}),
        ...(content._meta ? { _meta: content._meta } : {}),
      };
    case 'resource':
      return {
        type: 'resource',
        resource: apiResourceContentsFromAcpResource(content.resource),
        ...(content._meta ? { _meta: content._meta } : {}),
      };
    default:
      return undefined;
  }
}

function apiResourceContentsFromAcpResource(
  resource: Extract<AcpContentBlock, { type: 'resource' }>['resource']
): Extract<MayhemContentBlock, { type: 'resource' }>['resource'] {
  if ('text' in resource) {
    return {
      uri: resource.uri,
      text: resource.text,
      ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
      ...(resource._meta ? { _meta: resource._meta } : {}),
    };
  }

  return {
    uri: resource.uri,
    blob: resource.blob,
    ...(resource.mimeType ? { mimeType: resource.mimeType } : {}),
    ...(resource._meta ? { _meta: resource._meta } : {}),
  };
}

interface DesktopToolResultMeta extends Record<string, unknown> {
  ui?: {
    resourceUri: string;
  };
  extensionName?: string;
  toolName?: string;
  toolNameIsActual?: boolean;
  subagent_session_id?: string;
}

type ToolResultValue = {
  content: MayhemContentBlock[];
  structuredContent?: unknown;
  isError: boolean;
  _meta?: DesktopToolResultMeta;
};

function toolResultMetadata(update: ToolCallUpdate): DesktopToolResultMeta | undefined {
  if (!isRecord(update._meta)) {
    return undefined;
  }

  const mayhem = update._meta.mayhem;
  if (!isRecord(mayhem)) {
    return undefined;
  }

  const meta: DesktopToolResultMeta = {};
  if (typeof mayhem.subagentSessionId === 'string') {
    meta.subagent_session_id = mayhem.subagentSessionId;
  }

  if (isRecord(mayhem.mcpApp) && typeof mayhem.mcpApp.resourceUri === 'string') {
    meta.ui = { resourceUri: mayhem.mcpApp.resourceUri };
    meta.extensionName =
      typeof mayhem.mcpApp.extensionName === 'string' ? mayhem.mcpApp.extensionName : undefined;
    meta.toolName = typeof mayhem.mcpApp.toolName === 'string' ? mayhem.mcpApp.toolName : undefined;
    meta.toolNameIsActual =
      typeof mayhem.mcpApp.toolNameIsActual === 'boolean'
        ? mayhem.mcpApp.toolNameIsActual
        : undefined;
  }

  return Object.keys(meta).length > 0 ? meta : undefined;
}
