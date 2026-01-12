import type {
  EnabledTools,
  StoredTool,
  WebMCPSettings,
  ToolCache
} from './shared.js';

// Resolved tool data for injection
interface ResolvedToolData {
  source: string;
  domains: string[];
  pathPatterns: string[];
}

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

  // Initial evaluation - always signal ready, even on error
  try {
    await evaluateAndInjectTools();
  } finally {
    chrome.runtime.sendMessage({type: 'WEBMCP_TOOLS_READY'});
  }

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

  // Storage changes - re-evaluate when tools, settings, or cache change
  chrome.storage.local.onChanged.addListener((changes) => {
    if (
      changes.enabledToolGroups ||
      changes.webmcpSettings ||
      changes.toolCache
    ) {
      evaluateAndInjectTools();
    }
  });
})();

async function evaluateAndInjectTools() {
  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
    webmcpSettings: WebMCPSettings;
    toolCache: ToolCache;
  }>(['enabledToolGroups', 'webmcpSettings', 'toolCache']);

  const enabledTools = result.enabledToolGroups || {};
  const settings = result.webmcpSettings;
  const toolCache = result.toolCache || {};

  // Build set of enabled source URLs from settings
  const enabledSourceUrls = new Set<string>();
  enabledSourceUrls.add('https://web-mcp.org/api'); // Always enabled
  if (settings?.localToolsEnabled) {
    enabledSourceUrls.add('http://localhost:3000');
  }

  console.log(
    `[WebMCP] Evaluating ${Object.keys(enabledTools).length} enabled tools for ${window.location.href}`
  );

  const toolsToInject: ToolToInject[] = [];
  const newToolNames = new Set<string>();

  for (const toolRef of Object.values(enabledTools) as StoredTool[]) {
    // Check if tool's source is enabled
    if (!enabledSourceUrls.has(toolRef.sourceUrl)) {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" skipped: source "${toolRef.sourceUrl}" is disabled`
      );
      continue;
    }

    // Look up tool data from unified toolCache
    const cached = toolCache[toolRef.sourceUrl]?.[toolRef.name];
    if (!cached) {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" skipped: not found in toolCache`
      );
      continue;
    }

    const toolData: ResolvedToolData = {
      source: cached.source,
      domains: cached.domains,
      pathPatterns: cached.pathPatterns
    };

    const domainMatches = toolData.domains.some(
      (domain) => window.location.hostname === domain
    );
    if (!domainMatches) {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" skipped: domain mismatch (expected ${toolData.domains.join(', ')}, got ${window.location.hostname})`
      );
      continue;
    }

    // Check if any path pattern matches (empty array means match all paths)
    const pathMatches =
      toolData.pathPatterns.length === 0 ||
      toolData.pathPatterns.some((pattern) =>
        new RegExp(pattern).test(window.location.pathname)
      );
    if (!pathMatches) {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" skipped: path mismatch (patterns ${toolData.pathPatterns.join(', ')}, got ${window.location.pathname})`
      );
      continue;
    }

    // Use tool name as the identifier
    const toolId = toolRef.name;
    if (!currentlyRegisteredTools.has(toolId)) {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" will be injected (domain and path match)`
      );
      toolsToInject.push({toolId, source: toolData.source});
    } else {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" already registered, skipping`
      );
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
