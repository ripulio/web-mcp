export interface StoredToolGroup {
  id: string;
  name: string;
  version: string;
  description: string;
  domains: string[];
  tools: {
    source: string; // the .js file content
    pathPattern?: string;
  }[];
  sourceUrl: string; // which manifest this came from
  enabledToolIndices: number[]; // indices of enabled tools within this group
}

export interface EnabledToolGroups {
  [entryId: string]: StoredToolGroup;
}

export type CacheMode =
  | 'none'
  | 'session'
  | 'manual'
  | {type: 'persistent'; ttlMinutes: number};

export interface PackageSource {
  url: string;
  name?: string;
}

export interface WebMCPSettings {
  cacheMode: CacheMode;
  packageSources: PackageSource[];
}

export const DEFAULT_PACKAGE_SOURCE: PackageSource = {
  url: 'https://ripulio.github.io/webmcp-tools/manifest.json'
};

export const DEFAULT_SETTINGS: WebMCPSettings = {
  cacheMode: {type: 'persistent', ttlMinutes: 60},
  packageSources: [DEFAULT_PACKAGE_SOURCE]
};

export interface RemoteManifest {
  version: string;
  generatedAt: string;
  baseUrl: string;
  registry: RemoteToolGroup[];
}

export interface RemoteToolGroup {
  id: string;
  name: string;
  version: string;
  description: string;
  domains: string[];
  tools: {
    sourceUrl: string;
    pathPattern?: string;
  }[];
}

export interface ManifestCacheEntry {
  data: RemoteManifest;
  fetchedAt: number;
  manifestVersion: string;
}

export interface ManifestCache {
  [sourceUrl: string]: ManifestCacheEntry;
}
