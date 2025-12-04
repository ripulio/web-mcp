import type {
  CacheMode,
  PackageSource,
  RemoteManifest,
  RemoteTool,
  ManifestCache,
  ManifestCacheEntry,
  ToolRegistryResult,
  GroupedToolRegistryResult
} from './shared.js';

export type {ToolRegistryResult, GroupedToolRegistryResult};

// Session cache (in-memory)
const sessionCache: ManifestCache = {};

interface ToolGroupResponse {
  name: string;
  description: string;
  tools: string[];
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

async function getCachedManifest(
  url: string,
  cacheMode: CacheMode
): Promise<ManifestCacheEntry | null> {
  if (cacheMode === 'none') {
    return null;
  }

  if (cacheMode === 'session' || cacheMode === 'manual') {
    return sessionCache[url] || null;
  }

  // persistent cache (cacheMode is object with type: 'persistent')
  const result = await chrome.storage.local.get<{manifestCache: ManifestCache}>(
    ['manifestCache']
  );
  return result.manifestCache?.[url] || null;
}

async function setCachedManifest(
  url: string,
  entry: ManifestCacheEntry,
  cacheMode: CacheMode
): Promise<void> {
  if (cacheMode === 'none') {
    return;
  }

  if (cacheMode === 'session' || cacheMode === 'manual') {
    sessionCache[url] = entry;
    return;
  }

  // persistent cache (cacheMode is object with type: 'persistent')
  const result = await chrome.storage.local.get<{manifestCache: ManifestCache}>(
    ['manifestCache']
  );
  const cache = result.manifestCache || {};
  cache[url] = entry;
  await chrome.storage.local.set({manifestCache: cache});
}

function isCacheStale(
  entry: ManifestCacheEntry,
  cacheMode: CacheMode
): boolean {
  if (typeof cacheMode === 'object' && cacheMode.type === 'persistent') {
    const ttlMs = cacheMode.ttlMinutes * 60 * 1000;
    return Date.now() - entry.fetchedAt > ttlMs;
  }
  return false; // session mode never stale (until restart)
}

async function getManifestWithCache(
  url: string,
  cacheMode: CacheMode
): Promise<RemoteManifest> {
  const cached = await getCachedManifest(url, cacheMode);

  if (cached && !isCacheStale(cached, cacheMode)) {
    return cached.data;
  }

  const manifest = await fetchManifest(url);

  const entry: ManifestCacheEntry = {
    data: manifest,
    fetchedAt: Date.now()
  };

  await setCachedManifest(url, entry, cacheMode);
  return manifest;
}

export async function searchToolsGrouped(
  sources: PackageSource[],
  cacheMode: CacheMode
): Promise<GroupedToolRegistryResult[]> {
  // Fetch all manifests in parallel
  const manifestPromises = sources.map(async (source) => {
    const baseUrl = source.url.replace(/\/$/, '');
    try {
      const manifest = await getManifestWithCache(source.url, cacheMode);
      return {
        sourceUrl: source.url,
        baseUrl,
        groups: manifest.map((group) => ({
          name: group.name,
          description: group.description,
          tools: group.tools.map((tool) => ({
            name: tool.name,
            description: tool.userDescription,
            domains: tool.domains,
            pathPattern: tool.pathPattern,
            sourceUrl: source.url,
            baseUrl
          }))
        }))
      } as GroupedToolRegistryResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch';
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
