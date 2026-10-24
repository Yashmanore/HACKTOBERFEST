import type { MayhemMcpHostCapabilities } from "./mcp-apps.js";

export interface MayhemClientCapabilitiesMeta {
  mayhem?: {
    mcpHostCapabilities?: MayhemMcpHostCapabilities;
    customNotifications?: boolean;
  };
}
