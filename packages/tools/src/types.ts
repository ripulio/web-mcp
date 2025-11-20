import type {ToolDefinition} from '@ripul/web-mcp';

export interface ToolBinding {
  tool: ToolDefinition;
  pathMatches?: (path: string) => boolean;
}

export interface ToolRegistryEntry {
  id: string;
  name: string;
  domains: string[];
  tools: ToolBinding[];
}
