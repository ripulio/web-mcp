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
    injectUserScript(sender.tab.id)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({success: false, error: error.message}));
    return true;
  }

  if (message.type === 'WEBMCP_INJECT_TOOLS') {
    injectTools(sender.tab.id, message.tools as ToolToInject[])
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({success: false, error: error.message}));
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
