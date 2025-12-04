import type {EnabledTools, StoredTool} from './shared.js';

export interface ToolToInject {
  toolId: string;
  source: string;
}

let currentlyRegisteredTools = new Set<string>();

(async () => {
  // Set up listener before requesting injection to avoid race condition
  const injectorReady = new Promise<void>((resolve) => {
    const listener = (event: MessageEvent) => {
      if (event.data.type === 'WEBMCP_INJECTOR_READY') {
        window.removeEventListener('message', listener);
        resolve();
      }
    };
    window.addEventListener('message', listener);
  });

  // Inject polyfill first
  await chrome.runtime.sendMessage({type: 'WEBMCP_INJECT_SCRIPT'});
  await injectorReady;

  // Initial evaluation
  await evaluateAndInjectTools();

  // SPA navigation detection
  let lastUrl = window.location.href;

  const onUrlChange = () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      evaluateAndInjectTools();
    }
  };

  // Intercept History API
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    onUrlChange();
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    onUrlChange();
  };

  window.addEventListener('popstate', onUrlChange);

  // Storage changes
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.enabledTools) {
      evaluateAndInjectTools();
    }
  });
})();

async function evaluateAndInjectTools() {
  const result = await chrome.storage.local.get<{
    enabledTools: EnabledTools;
  }>(['enabledTools']);
  const enabledTools = result.enabledTools || {};

  const toolsToInject: ToolToInject[] = [];
  const newToolNames = new Set<string>();

  for (const tool of Object.values(enabledTools) as StoredTool[]) {
    const domainMatches = tool.domains.some(
      (domain) => window.location.hostname === domain
    );
    if (!domainMatches) continue;

    const pathMatches =
      !tool.pathPattern ||
      new RegExp(tool.pathPattern).test(window.location.pathname);
    if (!pathMatches) continue;

    // Use tool name as the identifier
    const toolId = tool.name;
    if (!currentlyRegisteredTools.has(toolId)) {
      toolsToInject.push({toolId, source: tool.source});
    }
    newToolNames.add(toolId);
  }

  // Unregister tools that no longer match
  const toolsToUnregister = [...currentlyRegisteredTools].filter(
    (name) => !newToolNames.has(name)
  );

  if (toolsToUnregister.length > 0) {
    window.postMessage(
      {
        type: 'WEBMCP_UNREGISTER_TOOLS',
        toolNames: toolsToUnregister
      },
      '*'
    );
  }

  // Inject new tools via background
  if (toolsToInject.length > 0) {
    await chrome.runtime.sendMessage({
      type: 'WEBMCP_INJECT_TOOLS',
      tools: toolsToInject
    });
  }

  currentlyRegisteredTools = newToolNames;
}
