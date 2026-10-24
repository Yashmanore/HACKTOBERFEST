import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  McpUiAppResourceConfig,
  McpUiAppToolConfig,
} from "@modelcontextprotocol/ext-apps/server";
import type {
  BlobResourceContents,
  ReadResourceResult,
  TextResourceContents,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

export const MAYHEM_MCP_UI_EXTENSION_ID = "io.modelcontextprotocol/ui" as const;

export interface MayhemMcpUiExtensionSettings {
  mimeTypes: string[];
}

export interface MayhemMcpHostCapabilities {
  extensions: Record<string, MayhemMcpUiExtensionSettings>;
}

export type MayhemToolUiMetadata = Extract<
  McpUiAppToolConfig["_meta"],
  { ui: unknown }
>["ui"];

export type MayhemToolMetadata = NonNullable<Tool["_meta"]> & {
  ui?: MayhemToolUiMetadata;
  mayhem_extension?: string;
};

export type MayhemSessionTool = Tool & {
  meta?: MayhemToolMetadata;
  _meta?: MayhemToolMetadata;
};

export type MayhemTextResourceContents = TextResourceContents;

export type MayhemBlobResourceContents = BlobResourceContents;

export type MayhemResourceContents = TextResourceContents | BlobResourceContents;

export type MayhemReadResourceResult = ReadResourceResult;

export type MayhemResourceMetadata = NonNullable<
  Extract<NonNullable<McpUiAppResourceConfig["_meta"]>, { ui?: unknown }>["ui"]
>;

export interface MayhemMcpAppToolPayload {
  toolName: string;
  extensionName: string;
  resourceUri: string;
  toolMeta?: MayhemToolMetadata;
  resourceResult?: MayhemReadResourceResult | null;
  readError?: string;
}

export interface MayhemToolCallUpdateMeta {
  mayhem?: {
    mcpApp?: MayhemMcpAppToolPayload;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const DEFAULT_MAYHEM_MCP_HOST_CAPABILITIES: MayhemMcpHostCapabilities = {
  extensions: {
    [MAYHEM_MCP_UI_EXTENSION_ID]: {
      mimeTypes: [RESOURCE_MIME_TYPE],
    },
  },
};
