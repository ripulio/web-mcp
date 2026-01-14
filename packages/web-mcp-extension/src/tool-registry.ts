import type {
  PackageSource,
  RemoteManifest,
  RemoteTool,
  ManifestCache,
  ManifestCacheEntry,
  ToolRegistryResult,
  GroupedToolRegistryResult,
  DomainFilter,
  PathFilter,
  QueryFilter
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

// Helper to extract domains, pathPatterns, and queryParams from filters array
function extractFilters(filters: RemoteTool['filters']): {
  domains: string[];
  pathPatterns: string[];
  queryParams: Record<string, string>;
} {
  const domainFilter = filters.find((f): f is DomainFilter => f.type === 'domain');
  const pathFilter = filters.find((f): f is PathFilter => f.type === 'path');
  const queryFilter = filters.find((f): f is QueryFilter => f.type === 'query');
  return {
    domains: domainFilter?.domains || [],
    pathPatterns: pathFilter?.paths || [],
    queryParams: queryFilter?.parameters || {}
  };
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
  return groupsData.map((group) => {
    const tools: RemoteTool[] = [];
    for (const name of group.tools) {
      const tool = toolMap.get(name);
      if (tool) {
        tools.push(tool);
      }
    }
    return {
      name: group.name,
      description: group.description,
      tools
    };
  });
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
              const {domains, pathPatterns, queryParams} = extractFilters(tool.filters);
              return {
                name: tool.id,
                description: tool.description,
                domains,
                pathPatterns,
                queryParams,
                sourceUrl: source.url,
                baseUrl,
                groupName: group.name
              };
            })
          };
        })
      } as GroupedToolRegistryResult;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch';
      const baseUrl = source.url.replace(/\/$/, '');
      return {
        sourceUrl: source.url,
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
  toolsToRefresh: Array<{
    name: string;
    domains: string[];
    pathPatterns: string[];
    queryParams: Record<string, string>;
    description: string;
  }>
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
  const cacheResult = await chrome.storage.local.get<{
    toolCache: import('./shared.js').ToolCache;
  }>(['toolCache']);
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
        queryParams: tool.queryParams,
        description: tool.description
      };
    }
    // Silently skip failed fetches - tool will use stale data
  }

  await chrome.storage.local.set({toolCache});
}
