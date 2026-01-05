import type {
  TabToolState,
  ToolInvocation,
  WebMCPSettings,
  ExtensionMessage,
  ServerMessage,
  BrowserControlTabInfo,
  BrowserControlTool,
  BrowserControlStatus
} from './shared.js';
import {
  DEFAULT_SETTINGS,
  ExtensionMessageType,
  ServerMessageType
} from './shared.js';

interface ToolToInject {
  toolId: string;
  source: string;
}

// Per-tab state storage for invocation tracking
const tabStates = new Map<number, TabToolState>();

// Clear state when tab URL changes or tab starts loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    tabStates.delete(tabId);
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle browser control messages from panel
  if (message.type === 'BROWSER_CONTROL_TOGGLE') {
    if (message.enabled) {
      startBrowserControl();
    } else {
      stopBrowserControl();
    }
    sendResponse({success: true});
    return true;
  }

  if (message.type === 'BROWSER_CONTROL_GET_STATUS') {
    sendResponse(getBrowserControlStatus());
    return true;
  }

  // Handle popup requests (no sender.tab)
  if (message.type === 'WEBMCP_GET_TAB_STATE') {
    const state = tabStates.get(message.tabId) ?? null;
    sendResponse({state});
    return true;
  }

  // All other messages require a tab context
  if (!sender.tab?.id) return;
  const tabId = sender.tab.id;

  if (message.type === 'WEBMCP_INJECT_SCRIPT') {
    console.log(`[WebMCP] Injecting polyfill script into tab ${tabId}`);
    injectUserScript(tabId)
      .then((result) => {
        console.log(`[WebMCP] Polyfill injection complete for tab ${tabId}`);
        sendResponse(result);
      })
      .catch((error) => {
        console.error(`[WebMCP] Polyfill injection failed:`, error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  }

  if (message.type === 'WEBMCP_INJECT_TOOLS') {
    const tools = message.tools as ToolToInject[];
    const toolNames = tools.map((t) => t.toolId);
    console.log(`[WebMCP] Injecting ${tools.length} tools into tab ${tabId}:`, toolNames);

    // Initialize or update tab state with injected tools
    const existingState = tabStates.get(tabId);
    if (existingState) {
      // Add new tools to existing state
      const existingSet = new Set(existingState.injectedTools);
      for (const name of toolNames) {
        existingSet.add(name);
      }
      existingState.injectedTools = [...existingSet];
    } else {
      // Create new state
      tabStates.set(tabId, {
        tabId,
        url: sender.tab.url ?? '',
        injectedTools: toolNames,
        invocations: []
      });
    }

    injectTools(tabId, tools)
      .then((result) => {
        console.log(`[WebMCP] Tool injection complete for tab ${tabId}`);
        sendResponse(result);
      })
      .catch((error) => {
        console.error(`[WebMCP] Tool injection failed:`, error);
        sendResponse({success: false, error: error.message});
      });
    return true;
  }

  if (message.type === 'WEBMCP_TOOL_INVOCATION_START') {
    const state = tabStates.get(tabId);
    if (state) {
      const invocation: ToolInvocation = {
        id: message.invocationId,
        toolName: message.toolName,
        args: message.args,
        result: null,
        startedAt: Date.now(),
        completedAt: null,
        isError: false
      };
      state.invocations.push(invocation);
    }
    return;
  }

  if (message.type === 'WEBMCP_TOOL_INVOCATION_END') {
    const state = tabStates.get(tabId);
    if (state) {
      const invocation = state.invocations.find((i) => i.id === message.invocationId);
      if (invocation) {
        invocation.result = message.result;
        invocation.completedAt = Date.now();
        invocation.isError = message.isError;
      }
    }
    return;
  }
});

async function getInjectorScript(): Promise<string> {
  const url = chrome.runtime.getURL('user-tools-injector.js');
  const response = await fetch(url);
  return response.text();
}

async function injectUserScript(tabId: number) {
  const scriptSource = await getInjectorScript();

  const results = await chrome.userScripts.execute({
    target: {tabId},
    world: 'MAIN',
    injectImmediately: true,
    js: [{code: scriptSource}]
  });

  return {success: true, results};
}

async function injectTools(tabId: number, tools: ToolToInject[]) {
  const results = [];

  for (const tool of tools) {
    // Strip "export const varName = " from source if present
    const cleanedSource = tool.source.replace(/^export\s+const\s+\w+\s*=\s*/, '');

    const wrappedSource = `
(() => {
  try {
    const tool = ${cleanedSource};
    tool.name = '${tool.toolId}';
    navigator.modelContext.registerTool(tool);
  } catch (e) {
    console.error('[WebMCP] Failed to register tool:', e);
  }
})();
`;

    const result = await chrome.userScripts.execute({
      target: {tabId},
      world: 'MAIN',
      injectImmediately: true,
      js: [{code: wrappedSource}]
    });

    results.push({toolId: tool.toolId, result});
  }

  return {success: true, results};
}

// ============================================================================
// Browser Control MCP Server - WebSocket Connection Management
// ============================================================================

const BC_LOG_PREFIX = '[WebMCP Browser Control]';
const WS_PORT_START = 8765;
const WS_PORT_END = 8785;
const KEEPALIVE_INTERVAL = 20 * 1000; // 20 seconds
const DISCOVERY_INTERVAL = 5 * 1000; // 5 seconds

// WebSocket connection state
const wsConnections = new Map<number, WebSocket>();
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let discoveryInterval: ReturnType<typeof setInterval> | null = null;
let browserControlEnabled = false;

// Initialize browser control based on stored settings
async function initBrowserControl(): Promise<void> {
  const result = await chrome.storage.local.get<{webmcpSettings: WebMCPSettings}>([
    'webmcpSettings'
  ]);
  const settings = result.webmcpSettings || DEFAULT_SETTINGS;

  if (settings.browserControlEnabled) {
    startBrowserControl();
  }
}

function startBrowserControl(): void {
  if (browserControlEnabled) return;
  browserControlEnabled = true;

  console.log(
    `${BC_LOG_PREFIX} Starting - scanning ports ${WS_PORT_START}-${WS_PORT_END}`
  );
  startDiscovery();
  startKeepalive();
}

function stopBrowserControl(): void {
  if (!browserControlEnabled) return;
  browserControlEnabled = false;

  console.log(`${BC_LOG_PREFIX} Stopping`);
  stopDiscovery();
  stopKeepalive();

  // Close all connections
  for (const [, ws] of wsConnections) {
    ws.close();
  }
  wsConnections.clear();
}

function connectToPort(port: number): void {
  if (wsConnections.has(port)) return;

  const ws = new WebSocket(`ws://localhost:${port}`);

  ws.onopen = () => {
    console.log(`${BC_LOG_PREFIX} Connected to server on port ${port}`);
    wsConnections.set(port, ws);
    broadcastStatusUpdate();
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    handleServerMessage(message, port);
  };

  ws.onclose = () => {
    console.log(`${BC_LOG_PREFIX} Disconnected from server on port ${port}`);
    wsConnections.delete(port);
    broadcastStatusUpdate();
  };

  ws.onerror = () => {
    // Silently ignore - server not available on this port
    wsConnections.delete(port);
  };
}

function discoverServers(): void {
  for (let port = WS_PORT_START; port <= WS_PORT_END; port++) {
    if (!wsConnections.has(port)) {
      connectToPort(port);
    }
  }
}

function startDiscovery(): void {
  discoverServers();
  discoveryInterval = setInterval(discoverServers, DISCOVERY_INTERVAL);
}

function stopDiscovery(): void {
  if (discoveryInterval) {
    clearInterval(discoveryInterval);
    discoveryInterval = null;
  }
}

function startKeepalive(): void {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    wsBroadcast({type: ExtensionMessageType.PING});
  }, KEEPALIVE_INTERVAL);
}

function stopKeepalive(): void {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

function sendToPort(port: number, message: ExtensionMessage): void {
  const ws = wsConnections.get(port);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error(`${BC_LOG_PREFIX} Cannot send to port ${port} - not connected`);
    return;
  }
  ws.send(JSON.stringify(message));
}

function wsBroadcast(message: ExtensionMessage): void {
  for (const [, ws] of wsConnections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

function getBrowserControlStatus(): BrowserControlStatus {
  return {
    enabled: browserControlEnabled,
    connectedPorts: Array.from(wsConnections.keys())
  };
}

function broadcastStatusUpdate(): void {
  chrome.runtime
    .sendMessage({
      type: 'BROWSER_CONTROL_STATUS_UPDATE',
      status: getBrowserControlStatus()
    })
    .catch(() => {
      // Ignore errors when no listeners
    });
}

async function handleServerMessage(
  message: ServerMessage,
  sourcePort: number
): Promise<void> {
  const sessionId = (message as {sessionId?: string}).sessionId;

  switch (message.type) {
    case ServerMessageType.PONG:
      break;

    case ServerMessageType.CONNECT:
      await handleConnect(sourcePort, sessionId);
      break;

    case ServerMessageType.OPEN_TAB:
      await handleOpenTab(
        sourcePort,
        message.url,
        message.focus,
        message.requestId,
        sessionId
      );
      break;

    case ServerMessageType.FOCUS_TAB:
      await handleFocusTab(sourcePort, message.tabId, sessionId);
      break;

    case ServerMessageType.CLOSE_TAB:
      await handleCloseTab(sourcePort, message.tabId, sessionId);
      break;

    case ServerMessageType.CALL_TOOL:
      await handleCallTool(
        sourcePort,
        message.callId,
        message.tabId,
        message.toolName,
        message.args,
        sessionId
      );
      break;

    case ServerMessageType.DISCOVER_TOOLS:
      await handleDiscoverTools(
        sourcePort,
        message.callId,
        message.tabId,
        sessionId
      );
      break;
  }
}

async function handleConnect(
  sourcePort: number,
  sessionId?: string
): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const tabInfos: BrowserControlTabInfo[] = tabs
    .filter((tab) => tab.id !== undefined)
    .map((tab) => ({
      id: tab.id!,
      title: tab.title || '',
      url: tab.url || '',
      tools: []
    }));

  sendToPort(sourcePort, {
    type: ExtensionMessageType.CONNECTED,
    sessionId,
    browser: {
      name: 'Chrome',
      version:
        navigator.userAgent.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/)?.[1] ||
        'unknown'
    },
    tabs: tabInfos
  });
}

async function handleOpenTab(
  sourcePort: number,
  url: string,
  focus: boolean,
  requestId?: string,
  sessionId?: string
): Promise<void> {
  const tab = await chrome.tabs.create({url, active: focus});

  if (focus && tab.id) {
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        sendTabFocused(sourcePort, tab.id!, requestId, sessionId);
      }
    });
  } else {
    sendToPort(sourcePort, {
      type: ExtensionMessageType.TAB_CREATED,
      sessionId,
      tab: {
        id: tab.id!,
        title: tab.title || '',
        url: tab.url || url,
        tools: []
      },
      requestId
    });
  }
}

async function handleFocusTab(
  sourcePort: number,
  tabId: number,
  sessionId?: string
): Promise<void> {
  await chrome.tabs.update(tabId, {active: true});
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId) {
    await chrome.windows.update(tab.windowId, {focused: true});
  }
  await sendTabFocused(sourcePort, tabId, undefined, sessionId);
}

async function handleCloseTab(
  sourcePort: number,
  tabId: number,
  sessionId?: string
): Promise<void> {
  await chrome.tabs.remove(tabId);
  sendToPort(sourcePort, {
    type: ExtensionMessageType.TAB_CLOSED,
    sessionId,
    tabId
  });
}

async function handleDiscoverTools(
  sourcePort: number,
  callId: string,
  tabId: number,
  sessionId?: string
): Promise<void> {
  const tools = await discoverPageTools(tabId);
  sendToPort(sourcePort, {
    type: ExtensionMessageType.TOOLS_DISCOVERED,
    sessionId,
    callId,
    tabId,
    tools
  });
}

async function handleCallTool(
  sourcePort: number,
  callId: string,
  tabId: number,
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string
): Promise<void> {
  console.log(`${BC_LOG_PREFIX} Calling tool "${toolName}" on tab ${tabId}`, args);

  try {
    const code = `
      (async () => {
        try {
          if (!navigator.modelContext) {
            return {error: 'navigator.modelContext not available'};
          }
          const result = await navigator.modelContext.executeTool(${JSON.stringify(toolName)}, ${JSON.stringify(args)});
          return {result};
        } catch (e) {
          return {error: e.message || String(e)};
        }
      })();
    `;

    const results = await chrome.userScripts.execute({
      target: {tabId},
      world: 'MAIN',
      js: [{code}]
    });

    const response = results?.[0]?.result as
      | {result?: unknown; error?: string}
      | undefined;

    if (response?.error) {
      sendToPort(sourcePort, {
        type: ExtensionMessageType.TOOL_RESULT,
        sessionId,
        callId,
        result: null,
        error: response.error
      });
    } else {
      sendToPort(sourcePort, {
        type: ExtensionMessageType.TOOL_RESULT,
        sessionId,
        callId,
        result: response?.result ?? null
      });
    }
  } catch (error) {
    sendToPort(sourcePort, {
      type: ExtensionMessageType.TOOL_RESULT,
      sessionId,
      callId,
      result: null,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

async function sendTabFocused(
  sourcePort: number,
  tabId: number,
  requestId?: string,
  sessionId?: string
): Promise<void> {
  const tools = await discoverPageTools(tabId);
  sendToPort(sourcePort, {
    type: ExtensionMessageType.TAB_FOCUSED,
    sessionId,
    tabId,
    tools,
    requestId
  });
}

async function discoverPageTools(tabId: number): Promise<BrowserControlTool[]> {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('devtools://')
    ) {
      return [];
    }

    const code = `
      (async () => {
        if (!navigator.modelContext) return [];
        const tools = [...navigator.modelContext.list()];
        return tools.map(t => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || {type: 'object', properties: {}}
        }));
      })();
    `;

    const results = await chrome.userScripts.execute({
      target: {tabId},
      world: 'MAIN',
      js: [{code}]
    });

    if (results && results[0]?.result) {
      return results[0].result as BrowserControlTool[];
    }
    return [];
  } catch {
    return [];
  }
}

// Browser control tab event listeners
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && browserControlEnabled && wsConnections.size > 0) {
    wsBroadcast({
      type: ExtensionMessageType.TAB_CREATED,
      tab: {
        id: tab.id,
        title: tab.title || '',
        url: tab.url || '',
        tools: []
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (browserControlEnabled && wsConnections.size > 0) {
    wsBroadcast({type: ExtensionMessageType.TAB_CLOSED, tabId});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    browserControlEnabled &&
    wsConnections.size > 0 &&
    (changeInfo.title || changeInfo.url)
  ) {
    wsBroadcast({
      type: ExtensionMessageType.TAB_UPDATED,
      tab: {
        id: tabId,
        title: tab.title || '',
        url: tab.url || '',
        tools: []
      }
    });
  }
});

// Initialize browser control on service worker start
initBrowserControl();
