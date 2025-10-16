import {type CallToolResult} from '@ripul/web-mcp';

export interface ToolCallEventInfo {
  timestamp: number;
  toolName: string;
  params: unknown;
  result?: CallToolResult;
}
