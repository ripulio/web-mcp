export interface StoredToolGroup {
  id: string;
  name: string;
  version: string;
  description: string;
  domains: string[];
  tools: {
    source: string; // the .js file content
    name: string;
    description: string;
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
  url: 'https://ripulio.github.io/webmcp-tools/servers/index.json'
};

export const DEFAULT_SETTINGS: WebMCPSettings = {
  cacheMode: {type: 'persistent', ttlMinutes: 60},
  packageSources: [DEFAULT_PACKAGE_SOURCE]
};

export interface RemoteToolGroup {
  id: string;
  name: string;
  version: string;
  description: string;
  domains: string[];
  tools: {
    name: string;
    description: string;
    pathPattern?: string;
  }[];
}

// RemoteManifest is now just an array of tool groups
export type RemoteManifest = RemoteToolGroup[];

export interface ManifestCacheEntry {
  data: RemoteManifest;
  fetchedAt: number;
}

export interface ManifestCache {
  [sourceUrl: string]: ManifestCacheEntry;
}
