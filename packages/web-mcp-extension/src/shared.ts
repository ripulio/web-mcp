export interface StoredTool {
  name: string;
  description: string;
  domains: string[];
  pathPattern?: string;
  source: string; // the .js file content
  sourceUrl: string; // which manifest this came from
}

export interface EnabledTools {
  [compositeId: string]: StoredTool; // compositeId = `${sourceUrl}:${toolName}`
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
  url: 'http://localhost:5176/api' // TODO: update when deployed
};

export const DEFAULT_SETTINGS: WebMCPSettings = {
  cacheMode: {type: 'persistent', ttlMinutes: 60},
  packageSources: [DEFAULT_PACKAGE_SOURCE]
};

export interface RemoteTool {
  name: string;
  userDescription: string;
  domains: string[];
  pathPattern?: string;
}

export interface RemoteToolGroup {
  name: string;
  description: string;
  tools: RemoteTool[];
}

export type RemoteManifest = RemoteToolGroup[];

export interface ManifestCacheEntry {
  data: RemoteManifest;
  fetchedAt: number;
}

// Types for grouped tool display in panel
export interface ToolRegistryResult {
  name: string;
  description: string;
  domains: string[];
  pathPattern?: string;
  sourceUrl: string;
  baseUrl: string;
}

export interface ToolGroupResult {
  name: string;
  description: string;
  tools: ToolRegistryResult[];
}

export interface GroupedToolRegistryResult {
  sourceUrl: string;
  baseUrl: string;
  groups: ToolGroupResult[];
  error?: string; // populated if fetch failed
}

export interface ManifestCache {
  [sourceUrl: string]: ManifestCacheEntry;
}
