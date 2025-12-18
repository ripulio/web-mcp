export interface StoredTool {
  name: string;
  description: string;
  domains: string[];
  pathPatterns: string[]; // multiple patterns supported
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
  type?: 'remote' | 'local';
  enabled?: boolean; // defaults to true
}

export const LOCAL_SOURCE: PackageSource = {
  url: 'local',
  name: 'Local Tools',
  type: 'local'
};

export interface WebMCPSettings {
  cacheMode: CacheMode;
  packageSources: PackageSource[];
}

export const DEFAULT_PACKAGE_SOURCE: PackageSource = {
  url: 'https://feature-cf-worker-preview-webmcp-catalog.james-garbutt.workers.dev/api'
};

export const DEFAULT_SETTINGS: WebMCPSettings = {
  cacheMode: {type: 'persistent', ttlMinutes: 60},
  packageSources: [LOCAL_SOURCE, DEFAULT_PACKAGE_SOURCE]
};

export interface ToolFilter {
  type: 'domain' | 'path';
  domains?: string[];
  patterns?: string[];
}

export interface RemoteTool {
  id: string;
  description: string;
  filters: ToolFilter[];
  groupId: string;
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
  pathPatterns: string[]; // multiple patterns supported
  sourceUrl: string;
  baseUrl: string;
  groupName: string;
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
