import type {
  PackageSource,
  RemoteManifest,
  RemoteTool,
  ManifestCache,
  ManifestCacheEntry,
  ToolRegistryResult,
  GroupedToolRegistryResult,
  BrowsedToolsData
} from './shared.js';

export type {ToolRegistryResult, GroupedToolRegistryResult};

// Internal cache mode type (no longer user-configurable)
type CacheMode = 'none' | 'session';

// Session cache (in-memory)
const sessionCache: ManifestCache = {};

interface ToolGroupResponse {
  name: string;
  description: string;
  tools: string[];
}

// Helper to extract domains and patterns from filters array
function extractFilters(filters: RemoteTool['filters']): {
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

/**
 * Convert BrowsedToolsData to RemoteManifest format
 */
function convertBrowsedToManifest(browsedTools: BrowsedToolsData): RemoteManifest {
  return browsedTools.groups.map((group) => ({
    name: group.name,
    description: group.description,
    tools: group.tools
      .map((toolId) => browsedTools.tools.find((t) => t.id === toolId))
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .map((tool) => ({
        id: tool.id,
        description: tool.description,
        filters: tool.filters,
        groupId: tool.groupId
      }))
  }));
}

async function fetchLocalManifest(): Promise<RemoteManifest> {
  // Check for browsed tools first
  const stored = await chrome.storage.local.get<{browsedTools: BrowsedToolsData}>([
    'browsedTools'
  ]);
  if (stored.browsedTools) {
    return convertBrowsedToManifest(stored.browsedTools);
  }

  // Fall back to bundled local-tools
  const groupsUrl = chrome.runtime.getURL('local-tools/groups.json');
  const groupsResponse = await fetch(groupsUrl);
  if (!groupsResponse.ok) {
    // No local tools is a valid state - return empty manifest
    return [];
  }
  const groupsData: ToolGroupResponse[] = await groupsResponse.json();

  const allToolNames = new Set(groupsData.flatMap((g) => g.tools));
  const toolMap = new Map<string, RemoteTool>();

  await Promise.all(
    Array.from(allToolNames).map(async (name) => {
      const metaUrl = chrome.runtime.getURL(`local-tools/tools/${name}.json`);
      const res = await fetch(metaUrl);
      if (!res.ok) {
        throw new Error(`Local tool ${name} metadata not found`);
      }
      toolMap.set(name, await res.json());
    })
  );

  return groupsData.map((group) => ({
    name: group.name,
    description: group.description,
    tools: group.tools.map((name) => toolMap.get(name)!)
  }));
}

export async function fetchLocalToolSource(toolName: string): Promise<string> {
  // Check for browsed tools first
  const stored = await chrome.storage.local.get<{browsedTools: BrowsedToolsData}>([
    'browsedTools'
  ]);
  if (stored.browsedTools) {
    const tool = stored.browsedTools.tools.find((t) => t.id === toolName);
    if (tool) {
      return tool.source;
    }
    throw new Error(`Browsed tool source not found: ${toolName}`);
  }

  // Fall back to bundled local-tools
  const url = chrome.runtime.getURL(`local-tools/tools/${toolName}.js`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Local tool source not found: ${toolName}`);
  }
  return response.text();
}

async function fetchManifest(baseUrl: string): Promise<RemoteManifest> {
  // Fetch groups from catalog API
  const groupsUrl = `${baseUrl.replace(/\/$/, '')}/groups`;
  const groupsResponse = await fetch(groupsUrl);
  if (!groupsResponse.ok) {
    throw new Error(
      `Failed to fetch groups from ${groupsUrl}: ${groupsResponse.status}`
    );
  }
  const groupsData: ToolGroupResponse[] = await groupsResponse.json();

  // Fetch all tool metadata from catalog API (in parallel)
  const apiBaseUrl = baseUrl.replace(/\/$/, '');

  // Build a map of tool name -> RemoteTool for deduplication
  const allToolNames = new Set(groupsData.flatMap((g) => g.tools));
  const toolMap = new Map<string, RemoteTool>();

  await Promise.all(
    Array.from(allToolNames).map(async (name) => {
      const res = await fetch(`${apiBaseUrl}/tools/${name}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch tool ${name}: ${res.status}`);
      }
      const tool = (await res.json()) as RemoteTool;
      toolMap.set(name, tool);
    })
  );

  // Build grouped manifest
  return groupsData.map((group) => ({
    name: group.name,
    description: group.description,
    tools: group.tools.map((name) => toolMap.get(name)!)
  }));
}

function getCachedManifest(
  url: string,
  cacheMode: CacheMode
): ManifestCacheEntry | null {
  if (cacheMode === 'none') {
    return null;
  }
  return sessionCache[url] || null;
}

function setCachedManifest(
  url: string,
  entry: ManifestCacheEntry,
  cacheMode: CacheMode
): void {
  if (cacheMode === 'none') {
    return;
  }
  sessionCache[url] = entry;
}

async function getManifestWithCache(
  url: string,
  cacheMode: CacheMode
): Promise<RemoteManifest> {
  const cached = getCachedManifest(url, cacheMode);

  if (cached) {
    return cached.data;
  }

  const manifest = await fetchManifest(url);

  const entry: ManifestCacheEntry = {
    data: manifest,
    fetchedAt: Date.now()
  };

  setCachedManifest(url, entry, cacheMode);
  return manifest;
}

export async function searchToolsGrouped(
  sources: PackageSource[],
  cacheMode: CacheMode
): Promise<GroupedToolRegistryResult[]> {
  // Fetch all manifests in parallel
  const manifestPromises = sources.map(async (source) => {
    try {
      if (source.type === 'local') {
        const manifest = await fetchLocalManifest();
        return {
          sourceUrl: 'local',
          baseUrl: 'local',
          groups: manifest.map((group) => {
            return {
              name: group.name,
              description: group.description,
              tools: group.tools.map((tool) => {
                const {domains, pathPatterns} = extractFilters(tool.filters);
                return {
                  name: tool.id,
                  description: tool.description,
                  domains,
                  pathPatterns,
                  sourceUrl: 'local',
                  baseUrl: 'local',
                  groupName: group.name
                };
              })
            };
          })
        } as GroupedToolRegistryResult;
      }

      const baseUrl = source.url.replace(/\/$/, '');
      const manifest = await getManifestWithCache(source.url, cacheMode);
      return {
        sourceUrl: source.url,
        baseUrl,
        groups: manifest.map((group) => {
          return {
            name: group.name,
            description: group.description,
            tools: group.tools.map((tool) => {
              const {domains, pathPatterns} = extractFilters(tool.filters);
              return {
                name: tool.id,
                description: tool.description,
                domains,
                pathPatterns,
                sourceUrl: source.url,
                baseUrl,
                groupName: group.name
              };
            })
          };
        })
      } as GroupedToolRegistryResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch';
      const baseUrl = source.type === 'local' ? 'local' : source.url.replace(/\/$/, '');
      return {
        sourceUrl: source.type === 'local' ? 'local' : source.url,
        baseUrl,
        groups: [],
        error: message
      } as GroupedToolRegistryResult;
    }
  });

  return Promise.all(manifestPromises);
}

export async function validateSource(
  url: string
): Promise<{valid: boolean; error?: string}> {
  try {
    await fetchManifest(url);
    return {valid: true};
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return {valid: false, error: message};
  }
}

export async function searchTools(
  sources: PackageSource[],
  cacheMode: CacheMode
): Promise<ToolRegistryResult[]> {
  const grouped = await searchToolsGrouped(sources, cacheMode);
  return grouped.flatMap((source) =>
    source.groups.flatMap((group) => group.tools)
  );
}

export async function fetchToolSource(
  baseUrl: string,
  toolName: string
): Promise<string> {
  const fullUrl = `${baseUrl}/tools/${toolName}/source`;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch tool source from ${fullUrl}: ${response.status}`
    );
  }
  return response.text();
}

/**
 * Refresh tool cache for enabled tools from a remote source.
 * Re-fetches tool sources and updates toolCache storage with full tool data.
 * @param sourceUrl - The source URL (used as key in toolCache)
 * @param baseUrl - The base URL for fetching tool sources
 * @param toolsToRefresh - Array of tools with their metadata from the refreshed manifest
 */
export async function refreshToolCache(
  sourceUrl: string,
  baseUrl: string,
  toolsToRefresh: Array<{name: string; domains: string[]; pathPatterns: string[]; description: string}>
): Promise<void> {
  if (toolsToRefresh.length === 0) return;

  // Fetch all sources in parallel
  const results = await Promise.allSettled(
    toolsToRefresh.map(async (tool) => {
      const source = await fetchToolSource(baseUrl, tool.name);
      return {tool, source};
    })
  );

  // Update toolCache with full tool data
  const cacheResult = await chrome.storage.local.get<{toolCache: import('./shared.js').ToolCache}>(['toolCache']);
  const toolCache = cacheResult.toolCache || {};
  if (!toolCache[sourceUrl]) {
    toolCache[sourceUrl] = {};
  }

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const {tool, source} = result.value;
      toolCache[sourceUrl][tool.name] = {
        source,
        domains: tool.domains,
        pathPatterns: tool.pathPatterns,
        description: tool.description
      };
    }
    // Silently skip failed fetches - tool will use stale data
  }

  await chrome.storage.local.set({toolCache});
}
