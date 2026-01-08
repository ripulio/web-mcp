// Reference to an enabled tool - just identifies which tool is enabled
export interface StoredTool {
  name: string;
  sourceUrl: string; // 'local' or remote source URL
}

// Full tool data cached for injection (both local and remote tools)
export interface CachedToolData {
  source: string;
  domains: string[];
  pathPatterns: string[];
  description: string;
}

// Unified cache for ALL enabled tools (local and remote)
export interface ToolCache {
  [sourceUrl: string]: {
    [toolName: string]: CachedToolData;
  };
}

// Legacy alias for migration - content.ts falls back to this
export type SourceCache = ToolCache;

export interface EnabledTools {
  [compositeId: string]: StoredTool; // compositeId = `${sourceUrl}:${toolName}`
}

export interface PackageSource {
  url: string;
  name?: string;
  type?: 'remote' | 'local';
  enabled?: boolean; // defaults to true
}

export const LOCAL_SOURCE: PackageSource = {
  url: 'local',
  name: 'Local Tools',
  type: 'local',
  enabled: false
};

export interface WebMCPSettings {
  packageSources: PackageSource[];
  browserControlEnabled: boolean;
}

export const DEFAULT_PACKAGE_SOURCE: PackageSource = {
  url: 'https://feature-cf-worker-preview-webmcp-catalog.james-garbutt.workers.dev/api'
};

export const DEFAULT_SETTINGS: WebMCPSettings = {
  packageSources: [LOCAL_SOURCE, DEFAULT_PACKAGE_SOURCE],
  browserControlEnabled: false
};

export interface ToolFilter {
  type: 'domain' | 'path';
  domains?: string[];
  patterns?: string[];
}

export interface RemoteTool {
  id: string;
  description: string;
  filters: ToolFilter[];
  groupId: string;
}

export interface RemoteToolGroup {
  name: string;
  description: string;
  tools: RemoteTool[];
}

export type RemoteManifest = RemoteToolGroup[];

export interface ManifestCacheEntry {
  data: RemoteManifest;
  fetchedAt: number;
}

// Types for grouped tool display in panel
export interface ToolRegistryResult {
  name: string;
  description: string;
  domains: string[];
  pathPatterns: string[]; // multiple patterns supported
  sourceUrl: string;
  baseUrl: string;
  groupName: string;
}

export interface ToolGroupResult {
  name: string;
  description: string;
  tools: ToolRegistryResult[];
}

export interface GroupedToolRegistryResult {
  sourceUrl: string;
  baseUrl: string;
  groups: ToolGroupResult[];
  error?: string; // populated if fetch failed
}

export interface ManifestCache {
  [sourceUrl: string]: ManifestCacheEntry;
}

// Types for browsed local tools (from directory picker)
export interface BrowsedToolGroup {
  id: string;
  name: string;
  description: string;
  tools: string[];
}

export interface BrowsedTool {
  id: string;
  description: string;
  filters: ToolFilter[];
  groupId: string;
  source: string;
}

export interface BrowsedToolsData {
  directoryName: string;
  lastUpdated: number;
  groups: BrowsedToolGroup[];
  tools: BrowsedTool[];
}

// Types for tool invocation tracking in popup
export interface ToolInvocation {
  id: string;
  toolName: string;
  args: unknown;
  result: unknown | null; // null while pending
  startedAt: number;
  completedAt: number | null;
  isError: boolean;
}

export interface TabToolState {
  tabId: number;
  url: string;
  injectedTools: string[];
  invocations: ToolInvocation[];
}

// Browser Control MCP Server - WebSocket Protocol Types
// These match the protocol used by browser-mcp extension

/** Message types sent FROM the browser extension TO MCP servers */
export const ExtensionMessageType = {
  PING: 'ping',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  TAB_CREATED: 'tabCreated',
  TAB_UPDATED: 'tabUpdated',
  TAB_CLOSED: 'tabClosed',
  TAB_FOCUSED: 'tabFocused',
  TOOLS_CHANGED: 'toolsChanged',
  TOOL_RESULT: 'toolResult',
  TOOLS_DISCOVERED: 'toolsDiscovered'
} as const;

/** Message types sent FROM MCP servers TO the browser extension */
export const ServerMessageType = {
  PONG: 'pong',
  CONNECT: 'connect',
  OPEN_TAB: 'openTab',
  FOCUS_TAB: 'focusTab',
  CLOSE_TAB: 'closeTab',
  CALL_TOOL: 'callTool',
  DISCOVER_TOOLS: 'discoverTools'
} as const;

export interface BrowserControlTabInfo {
  id: number;
  title: string;
  url: string;
  tools: BrowserControlTool[];
}

export interface BrowserControlTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Messages from extension to MCP server
export type ExtensionMessage =
  | {type: typeof ExtensionMessageType.PING}
  | {type: typeof ExtensionMessageType.CONNECTED; sessionId?: string; browser: {name: string; version: string}; tabs: BrowserControlTabInfo[]}
  | {type: typeof ExtensionMessageType.DISCONNECTED; sessionId?: string}
  | {type: typeof ExtensionMessageType.TAB_CREATED; sessionId?: string; tab: BrowserControlTabInfo; requestId?: string}
  | {type: typeof ExtensionMessageType.TAB_UPDATED; sessionId?: string; tab: BrowserControlTabInfo}
  | {type: typeof ExtensionMessageType.TAB_CLOSED; sessionId?: string; tabId: number}
  | {type: typeof ExtensionMessageType.TAB_FOCUSED; sessionId?: string; tabId: number; tools: BrowserControlTool[]; requestId?: string}
  | {type: typeof ExtensionMessageType.TOOLS_CHANGED; sessionId?: string; tabId: number; tools: BrowserControlTool[]}
  | {type: typeof ExtensionMessageType.TOOL_RESULT; sessionId?: string; callId: string; result: unknown; error?: string}
  | {type: typeof ExtensionMessageType.TOOLS_DISCOVERED; sessionId?: string; callId: string; tabId: number; tools: BrowserControlTool[]};

// Messages from MCP server to extension
export type ServerMessage =
  | {type: typeof ServerMessageType.PONG}
  | {type: typeof ServerMessageType.CONNECT; sessionId?: string; launch?: boolean}
  | {type: typeof ServerMessageType.OPEN_TAB; sessionId?: string; url: string; focus: boolean; requestId?: string}
  | {type: typeof ServerMessageType.FOCUS_TAB; sessionId?: string; tabId: number}
  | {type: typeof ServerMessageType.CLOSE_TAB; sessionId?: string; tabId: number}
  | {type: typeof ServerMessageType.CALL_TOOL; sessionId?: string; callId: string; tabId: number; toolName: string; args: Record<string, unknown>}
  | {type: typeof ServerMessageType.DISCOVER_TOOLS; sessionId?: string; callId: string; tabId: number};

// Status for UI display
export interface BrowserControlStatus {
  enabled: boolean;
  connectedPorts: number[];
}
