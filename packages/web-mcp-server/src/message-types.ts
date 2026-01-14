/** Message types sent FROM the browser extension TO the MCP server */
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

/** Message types sent FROM the MCP server TO the browser extension */
export const ServerMessageType = {
  PONG: 'pong',
  CONNECT: 'connect',
  OPEN_TAB: 'openTab',
  FOCUS_TAB: 'focusTab',
  CLOSE_TAB: 'closeTab',
  CALL_TOOL: 'callTool',
  DISCOVER_TOOLS: 'discoverTools'
} as const;
