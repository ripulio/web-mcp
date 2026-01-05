import type {TabToolState, ToolInvocation} from './shared.js';

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
