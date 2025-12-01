import type {
  CacheMode,
  PackageSource,
  RemoteManifest,
  ManifestCache,
  ManifestCacheEntry
} from './shared.js';

export interface ToolRegistryResult {
  id: string;
  name: string;
  version: string;
  description: string;
  domains: string[];
  tools: {sourceUrl: string; pathPattern?: string}[];
  sourceUrl: string; // which manifest this came from
  baseUrl: string; // baseUrl from that manifest
}

// Session cache (in-memory)
const sessionCache: ManifestCache = {};

async function fetchManifest(url: string): Promise<RemoteManifest> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest from ${url}: ${response.status}`);
  }
  return response.json();
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

  // Check if version changed (smart cache invalidation)
  if (
    cached &&
    cached.manifestVersion === manifest.version &&
    !isCacheStale(cached, cacheMode)
  ) {
    return cached.data;
  }

  const entry: ManifestCacheEntry = {
    data: manifest,
    fetchedAt: Date.now(),
    manifestVersion: manifest.version
  };

  await setCachedManifest(url, entry, cacheMode);
  return manifest;
}

export async function searchTools(
  sources: PackageSource[],
  cacheMode: CacheMode
): Promise<ToolRegistryResult[]> {
  const results: ToolRegistryResult[] = [];

  // Fetch all manifests in parallel
  const manifestPromises = sources.map(async (source) => {
    try {
      const manifest = await getManifestWithCache(source.url, cacheMode);
      return {source, manifest};
    } catch (error) {
      console.error(`Failed to fetch manifest from ${source.url}:`, error);
      return null;
    }
  });

  const manifests = await Promise.all(manifestPromises);

  for (const result of manifests) {
    if (!result) continue;

    const {source, manifest} = result;

    for (const group of manifest.registry) {
      results.push({
        id: group.id,
        name: group.name,
        version: group.version,
        description: group.description,
        domains: group.domains,
        tools: group.tools,
        sourceUrl: source.url,
        baseUrl: manifest.baseUrl
      });
    }
  }

  return results;
}

export async function fetchToolSource(
  baseUrl: string,
  sourceUrl: string
): Promise<string> {
  const fullUrl = baseUrl + sourceUrl;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch tool source from ${fullUrl}: ${response.status}`
    );
  }
  return response.text();
}
