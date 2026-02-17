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

const HTTP_PATTERN = /^https?:\/\//i;

interface ToolToInject {
  toolId: string;
  source: string;
}

// Per-tab state storage helpers (persisted to session storage to survive SW restarts)
async function getTabState(tabId: number): Promise<TabToolState | null> {
  const key = `tabState:${tabId}`;
  const result = await chrome.storage.session.get<{
    [key: string]: TabToolState;
  }>(key);
  return result[key] ?? null;
}

async function setTabState(tabId: number, state: TabToolState): Promise<void> {
  await chrome.storage.session.set({[`tabState:${tabId}`]: state});
}

async function deleteTabState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`tabState:${tabId}`);
}

// Clear state when tab URL changes or tab starts loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === 'loading') {
    deleteTabState(tabId);
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  deleteTabState(tabId);
});

// Open settings page when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({url: chrome.runtime.getURL('panel.html')});
});

// Handle messages from content script and panel
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

  // All other messages require a tab context
  const tabId = sender.tab?.id;

  if (!tabId || tabId < 0 || !sender.url || !HTTP_PATTERN.test(sender.url)) {
    return;
  }

  if (message.type === 'WEBMCP_INJECT_SCRIPT') {
    injectUserScript(tabId)
      .then((result) => {
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

    // Initialize or update tab state with injected tools
    (async () => {
      const existingState = await getTabState(tabId);
      if (existingState) {
        // Add new tools to existing state
        const existingSet = new Set(existingState.injectedTools);
        for (const name of toolNames) {
          existingSet.add(name);
        }
        existingState.injectedTools = [...existingSet];
        await setTabState(tabId, existingState);
      } else {
        // Create new state
        await setTabState(tabId, {
          tabId,
          url: sender.tab?.url ?? '',
          injectedTools: toolNames,
          invocations: []
        });
      }

      const result = await injectTools(tabId, tools);
      sendResponse(result);
    })().catch((error) => {
      console.error(`[WebMCP] Tool injection failed:`, error);
      sendResponse({success: false, error: error.message});
    });
    return true;
  }

  if (message.type === 'WEBMCP_TOOL_INVOCATION_START') {
    getTabState(tabId).then(async (state) => {
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
        await setTabState(tabId, state);
      }
    });
    return;
  }

  if (message.type === 'WEBMCP_TOOL_INVOCATION_END') {
    getTabState(tabId).then(async (state) => {
      if (state) {
        const invocation = state.invocations.find(
          (i) => i.id === message.invocationId
        );
        if (invocation) {
          invocation.result = message.result;
          invocation.completedAt = Date.now();
          invocation.isError = message.isError;
          await setTabState(tabId, state);
        }
      }
    });
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
    const cleanedSource = tool.source.replace(
      /^export\s+const\s+\w+\s*=\s*/,
      ''
    );

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
const DISCOVERY_INTERVAL_MIN = 5 * 1000; // 5 seconds (initial)
const DISCOVERY_INTERVAL_MAX = 60 * 1000; // 60 seconds (max backoff)

// WebSocket connection state
const wsConnections = new Map<number, WebSocket>();
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let discoveryTimeout: ReturnType<typeof setTimeout> | null = null;
let discoveryDelay = DISCOVERY_INTERVAL_MIN;
let detectionTimeout: ReturnType<typeof setTimeout> | null = null;
let detectionDelay = DISCOVERY_INTERVAL_MIN;
let browserControlEnabled = false;
const lastDetectedPorts = new Set<number>();

// Initialize browser control based on stored settings
async function initBrowserControl(): Promise<void> {
  // Always start lightweight detection so the panel can show
  // the "server detected" banner even when browser control is off
  startDetection();

  const result = await chrome.storage.local.get<{
    webmcpSettings: WebMCPSettings;
  }>(['webmcpSettings']);
  const settings = result.webmcpSettings || DEFAULT_SETTINGS;

  if (settings.browserControlEnabled) {
    startBrowserControl();
  }
}

function startBrowserControl(): void {
  if (browserControlEnabled) return;
  browserControlEnabled = true;

  // Full discovery supersedes lightweight detection
  stopDetection();
  startDiscovery();
  startKeepalive();
}

function stopBrowserControl(): void {
  if (!browserControlEnabled) return;
  browserControlEnabled = false;

  stopDiscovery();
  stopKeepalive();

  // Close all connections
  for (const [, ws] of wsConnections) {
    ws.close();
  }
  wsConnections.clear();

  // Resume lightweight detection for the panel banner
  startDetection();
  broadcastStatusUpdate();
}

async function isPortResponding(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100);
    await fetch(`http://localhost:${port}`, {
      signal: controller.signal,
      mode: 'no-cors'
    });
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

async function connectToPort(port: number): Promise<void> {
  if (wsConnections.has(port)) return;

  // Probe port first to avoid console spam from failed WebSocket connections
  if (!(await isPortResponding(port))) return;

  const ws = new WebSocket(`ws://localhost:${port}`);

  ws.onopen = () => {
    wsConnections.set(port, ws);
    resetDiscoveryBackoff();
    broadcastStatusUpdate();
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data) as ServerMessage;
    handleServerMessage(message, port);
  };

  ws.onclose = () => {
    if (wsConnections.has(port)) {
      wsConnections.delete(port);
      broadcastStatusUpdate();
    }
  };

  ws.onerror = () => {
    // Silently ignore - server not available on this port
    wsConnections.delete(port);
  };
}

async function discoverServers(): Promise<void> {
  const connectionsBefore = wsConnections.size;
  const promises: Promise<void>[] = [];
  for (let port = WS_PORT_START; port <= WS_PORT_END; port++) {
    if (!wsConnections.has(port)) {
      promises.push(connectToPort(port));
    }
  }
  await Promise.all(promises);

  // Update detected ports from connected state
  updateDetectedPorts();

  // Back off if no new connections were made
  if (wsConnections.size <= connectionsBefore) {
    discoveryDelay = Math.min(discoveryDelay * 2, DISCOVERY_INTERVAL_MAX);
  }
}

function resetDiscoveryBackoff(): void {
  discoveryDelay = DISCOVERY_INTERVAL_MIN;
  // Restart discovery loop with reset delay
  if (browserControlEnabled && discoveryTimeout) {
    clearTimeout(discoveryTimeout);
    scheduleDiscovery();
  }
}

function scheduleDiscovery(): void {
  discoveryTimeout = setTimeout(async () => {
    await discoverServers();
    if (browserControlEnabled) {
      scheduleDiscovery();
    }
  }, discoveryDelay);
}

function startDiscovery(): void {
  discoveryDelay = DISCOVERY_INTERVAL_MIN;
  discoverServers();
  scheduleDiscovery();
}

function stopDiscovery(): void {
  if (discoveryTimeout) {
    clearTimeout(discoveryTimeout);
    discoveryTimeout = null;
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
    console.error(
      `${BC_LOG_PREFIX} Cannot send to port ${port} - not connected`
    );
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

function updateDetectedPorts(): void {
  // Connected ports are also detected
  const ports = new Set<number>(wsConnections.keys());
  // Merge with last probe results
  for (const port of lastDetectedPorts) {
    ports.add(port);
  }
  const sorted = Array.from(ports).sort((a, b) => a - b);
  const previous = Array.from(lastDetectedPorts).sort((a, b) => a - b);
  lastDetectedPorts.clear();
  for (const p of sorted) lastDetectedPorts.add(p);

  // Broadcast if detection changed
  if (sorted.join(',') !== previous.join(',')) {
    broadcastStatusUpdate();
  }
}

// Lightweight always-on detection (HTTP probe only, no WebSocket)
// Runs even when browser control is disabled so the panel can show
// the "server detected" banner.
async function runDetectionProbe(): Promise<void> {
  const ports: number[] = [];
  const promises: Promise<void>[] = [];
  for (let port = WS_PORT_START; port <= WS_PORT_END; port++) {
    promises.push(
      isPortResponding(port).then((responding) => {
        if (responding) ports.push(port);
      })
    );
  }
  await Promise.all(promises);

  const previousSize = lastDetectedPorts.size;
  lastDetectedPorts.clear();
  for (const p of ports) lastDetectedPorts.add(p);

  // Back off if nothing changed
  if (ports.length === 0 && previousSize === 0) {
    detectionDelay = Math.min(detectionDelay * 2, DISCOVERY_INTERVAL_MAX);
  } else if (ports.length !== previousSize) {
    detectionDelay = DISCOVERY_INTERVAL_MIN;
  }

  broadcastStatusUpdate();
}

function scheduleDetection(): void {
  detectionTimeout = setTimeout(async () => {
    await runDetectionProbe();
    scheduleDetection();
  }, detectionDelay);
}

function startDetection(): void {
  detectionDelay = DISCOVERY_INTERVAL_MIN;
  runDetectionProbe();
  scheduleDetection();
}

function stopDetection(): void {
  if (detectionTimeout) {
    clearTimeout(detectionTimeout);
    detectionTimeout = null;
  }
}

function getBrowserControlStatus(): BrowserControlStatus {
  return {
    enabled: browserControlEnabled,
    connectedPorts: Array.from(wsConnections.keys()),
    detectedPorts: Array.from(lastDetectedPorts).sort((a, b) => a - b)
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
  const tabInfos: BrowserControlTabInfo[] = await Promise.all(
    tabs
      .filter((tab) => tab.id !== undefined)
      .map(async (tab) => ({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        id: tab.id!,
        title: tab.title || '',
        url: tab.url || '',
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        tools: await discoverPageTools(tab.id!)
      }))
  );

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
  if (!tab.id) return;

  const isRestricted =
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://');

  if (!isRestricted) {
    // Wait for tools ready signal - temporary listener, no persistent state
    await new Promise<void>((resolve) => {
      const listener = (
        message: {type?: string},
        sender: chrome.runtime.MessageSender
      ) => {
        if (
          message.type === 'WEBMCP_TOOLS_READY' &&
          sender.tab?.id === tab.id
        ) {
          chrome.runtime.onMessage.removeListener(listener);
          resolve();
        }
      };
      chrome.runtime.onMessage.addListener(listener);
    });
  }

  const tools = await discoverPageTools(tab.id);
  const tabInfo = await chrome.tabs.get(tab.id);

  if (focus) {
    sendTabFocused(sourcePort, tab.id, requestId, sessionId);
  } else {
    sendToPort(sourcePort, {
      type: ExtensionMessageType.TAB_CREATED,
      sessionId,
      tab: {
        id: tab.id,
        title: tabInfo.title || '',
        url: tabInfo.url || url,
        tools
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
