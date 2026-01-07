import type {EnabledTools, StoredTool, WebMCPSettings, ToolCache, BrowsedToolsData, BrowsedTool} from './shared.js';

// Extract domains and pathPatterns from filters array (for legacy browsedTools fallback)
function extractFilters(filters: BrowsedTool['filters']): {
  domains: string[];
  pathPatterns: string[];
} {
  const domainFilter = filters.find((f) => f.type === 'domain');
  const pathFilter = filters.find((f) => f.type === 'path');
  return {
    domains: domainFilter?.domains || [],
    pathPatterns: pathFilter?.patterns || []
  };
}

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
    if (changes.enabledToolGroups || changes.webmcpSettings || changes.toolCache) {
      evaluateAndInjectTools();
    }
  });
})();

async function evaluateAndInjectTools() {
  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
    webmcpSettings: WebMCPSettings;
    toolCache: ToolCache;
    // Legacy fallback storage (for migration)
    sourceCache: ToolCache;
    browsedTools: BrowsedToolsData;
  }>(['enabledToolGroups', 'webmcpSettings', 'toolCache', 'sourceCache', 'browsedTools']);
  const enabledTools = result.enabledToolGroups || {};
  const settings = result.webmcpSettings;
  const toolCache = result.toolCache || {};
  // Legacy storage for fallback during migration
  const legacySourceCache = result.sourceCache || {};
  const legacyBrowsedTools = result.browsedTools;

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

  for (const toolRef of Object.values(enabledTools) as StoredTool[]) {
    // Check if tool's source is enabled
    if (!enabledSourceUrls.has(toolRef.sourceUrl)) {
      console.log(
        `[WebMCP] Tool "${toolRef.name}" skipped: source "${toolRef.sourceUrl}" is disabled`
      );
      continue;
    }

    // Look up tool data from unified toolCache
    let toolData: ResolvedToolData | null = null;
    const cached = toolCache[toolRef.sourceUrl]?.[toolRef.name];

    if (cached) {
      // Found in unified cache
      toolData = {
        source: cached.source,
        domains: cached.domains,
        pathPatterns: cached.pathPatterns
      };
    } else {
      // Fallback to legacy storage for migration
      if (toolRef.sourceUrl === 'local') {
        // Legacy local tools: look up from browsedTools
        const browsedTool = legacyBrowsedTools?.tools.find(t => t.id === toolRef.name);
        if (browsedTool) {
          const {domains, pathPatterns} = extractFilters(browsedTool.filters);
          toolData = {
            source: browsedTool.source,
            domains,
            pathPatterns
          };
        }
      } else {
        // Legacy remote tools: look up from sourceCache
        const legacyCached = legacySourceCache[toolRef.sourceUrl]?.[toolRef.name];
        if (legacyCached) {
          toolData = {
            source: legacyCached.source,
            domains: legacyCached.domains,
            pathPatterns: legacyCached.pathPatterns
          };
        }
      }
    }

    if (!toolData) {
      console.log(`[WebMCP] Tool "${toolRef.name}" skipped: tool data not found in source storage`);
      continue;
    }

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
      console.log(`[WebMCP] Tool "${toolRef.name}" will be injected (domain and path match)`);
      toolsToInject.push({toolId, source: toolData.source});
    } else {
      console.log(`[WebMCP] Tool "${toolRef.name}" already registered, skipping`);
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
