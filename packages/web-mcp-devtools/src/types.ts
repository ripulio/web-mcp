import {type CallToolResult} from 'webmcp-polyfill';

export interface ToolCallEventInfo {
  timestamp: number;
  toolName: string;
  params: unknown;
  result?: CallToolResult;
}
