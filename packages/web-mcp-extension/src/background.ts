chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('panel.html')
  });
});

interface ToolToInject {
  toolId: string;
  source: string;
}

// Handle injection requests from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab?.id) return;

  if (message.type === 'WEBMCP_INJECT_SCRIPT') {
    console.log(`[WebMCP] Injecting polyfill script into tab ${sender.tab.id}`);
    injectUserScript(sender.tab.id)
      .then((result) => {
        console.log(`[WebMCP] Polyfill injection complete for tab ${sender.tab!.id}`);
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
    console.log(
      `[WebMCP] Injecting ${tools.length} tools into tab ${sender.tab.id}:`,
      tools.map((t) => t.toolId)
    );
    injectTools(sender.tab.id, tools)
      .then((result) => {
        console.log(`[WebMCP] Tool injection complete for tab ${sender.tab!.id}`);
        sendResponse(result);
      })
      .catch((error) => {
        console.error(`[WebMCP] Tool injection failed:`, error);
        sendResponse({success: false, error: error.message});
      });
    return true;
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
    const wrappedSource = `
(() => {
  try {
    const tool = ${tool.source};
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
