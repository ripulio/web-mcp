import type {EnabledTools, StoredTool, WebMCPSettings} from './shared.js';

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

  // Listen for tool invocation events from MAIN world and relay to background
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const {type} = event.data;
    if (
      type === 'WEBMCP_TOOL_INVOCATION_START' ||
      type === 'WEBMCP_TOOL_INVOCATION_END'
    ) {
      chrome.runtime.sendMessage(event.data);
    }
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

  // Storage changes - re-evaluate when tools or settings change
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.enabledToolGroups || changes.webmcpSettings) {
      evaluateAndInjectTools();
    }
  });
})();

async function evaluateAndInjectTools() {
  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
    webmcpSettings: WebMCPSettings;
  }>(['enabledToolGroups', 'webmcpSettings']);
  const enabledTools = result.enabledToolGroups || {};
  const settings = result.webmcpSettings;

  // Build set of enabled source URLs
  const enabledSourceUrls = new Set<string>();
  if (settings?.packageSources) {
    for (const source of settings.packageSources) {
      // enabled defaults to true when undefined
      if (source.enabled !== false) {
        const url = source.type === 'local' ? 'local' : source.url;
        enabledSourceUrls.add(url);
      }
    }
  } else {
    // No settings yet - assume all sources enabled
    enabledSourceUrls.add('local');
  }

  console.log(
    `[WebMCP] Evaluating ${Object.keys(enabledTools).length} enabled tools for ${window.location.href}`
  );

  const toolsToInject: ToolToInject[] = [];
  const newToolNames = new Set<string>();

  for (const tool of Object.values(enabledTools) as StoredTool[]) {
    // Check if tool's source is enabled
    if (!enabledSourceUrls.has(tool.sourceUrl)) {
      console.log(
        `[WebMCP] Tool "${tool.name}" skipped: source "${tool.sourceUrl}" is disabled`
      );
      continue;
    }

    const domainMatches = tool.domains.some(
      (domain) => window.location.hostname === domain
    );
    if (!domainMatches) {
      console.log(
        `[WebMCP] Tool "${tool.name}" skipped: domain mismatch (expected ${tool.domains.join(', ')}, got ${window.location.hostname})`
      );
      continue;
    }

    // Check if any path pattern matches (empty array means match all paths)
    const pathMatches =
      tool.pathPatterns.length === 0 ||
      tool.pathPatterns.some((pattern) =>
        new RegExp(pattern).test(window.location.pathname)
      );
    if (!pathMatches) {
      console.log(
        `[WebMCP] Tool "${tool.name}" skipped: path mismatch (patterns ${tool.pathPatterns.join(', ')}, got ${window.location.pathname})`
      );
      continue;
    }

    // Use tool name as the identifier
    const toolId = tool.name;
    if (!currentlyRegisteredTools.has(toolId)) {
      console.log(`[WebMCP] Tool "${tool.name}" will be injected (domain and path match)`);
      toolsToInject.push({toolId, source: tool.source});
    } else {
      console.log(`[WebMCP] Tool "${tool.name}" already registered, skipping`);
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
