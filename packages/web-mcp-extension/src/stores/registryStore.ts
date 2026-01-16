import {signal} from '@preact/signals';
import type {
  PackageSource,
  GroupedToolRegistryResult,
  ToolRegistryResult
} from '../shared.js';
import {
  searchToolsGrouped,
  fetchVersion,
  clearSessionCache
} from '../tool-registry.js';
import {
  autoEnableNewTools,
  enabledTools
} from './enabledToolsStore.js';

// Core signals
export const activeRegistry = signal<GroupedToolRegistryResult[]>([]);
export const sourceErrors = signal<{[url: string]: string}>({});
export const registryLoading = signal(true);

// Hot reload state
const pollIntervals = new Map<string, ReturnType<typeof setInterval>>();
const lastKnownVersions = new Map<string, string>();
export const hotReloadingSources = signal<Set<string>>(new Set());

// Actions
export async function loadRegistry(sources: PackageSource[]): Promise<void> {
  registryLoading.value = true;

  // Use session cache - manifest cached until browser restart
  const results = await searchToolsGrouped(sources, 'session');

  // Extract errors from results
  const errors: {[url: string]: string} = {};
  for (const r of results) {
    if (r.error) {
      errors[r.sourceUrl] = r.error;
    }
  }
  sourceErrors.value = errors;

  // Filter successful results
  activeRegistry.value = results.filter((r) => !r.error);
  registryLoading.value = false;
}

export function clearSourceError(url: string): void {
  const {[url]: _, ...rest} = sourceErrors.value;
  sourceErrors.value = rest;
}

export function setSourceError(url: string, error: string): void {
  sourceErrors.value = {...sourceErrors.value, [url]: error};
}

export function removeFromRegistries(sourceUrl: string): void {
  activeRegistry.value = activeRegistry.value.filter(
    (r) => r.sourceUrl !== sourceUrl
  );
}

// Helper to get all tools for a source from registry
function getToolsForSource(sourceUrl: string): ToolRegistryResult[] {
  const sourceRegistry = activeRegistry.value.find(
    (r) => r.sourceUrl === sourceUrl
  );
  if (!sourceRegistry) return [];
  return sourceRegistry.groups.flatMap((g) => g.tools);
}

// Hot reload functions
export function startHotReload(
  source: PackageSource,
  allSources: PackageSource[]
): void {
  if (pollIntervals.has(source.url)) return;

  const interval = setInterval(async () => {
    const versionResponse = await fetchVersion(source.url);
    if (!versionResponse) return;

    const {version} = versionResponse;
    const lastVersion = lastKnownVersions.get(source.url);

    if (lastVersion && version !== lastVersion) {
      // Snapshot current tools before reload (for auto-enable comparison)
      const previousToolNames = new Set(
        getToolsForSource(source.url).map((t) => t.name)
      );

      clearSessionCache(source.url);
      await loadRegistry(allSources);

      // Auto-enable new tools if configured
      if (source.autoEnable) {
        const currentTools = getToolsForSource(source.url);
        const newTools = currentTools.filter(
          (t) =>
            !previousToolNames.has(t.name) &&
            !enabledTools.value[`${source.url}:${t.name}`]
        );

        if (newTools.length > 0) {
          const baseUrl = source.url.replace(/\/$/, '');
          await autoEnableNewTools(source.url, baseUrl, newTools);
        }
      }
    }
    lastKnownVersions.set(source.url, version);
  }, 3000);

  pollIntervals.set(source.url, interval);

  // Update the signal
  const newSet = new Set(hotReloadingSources.value);
  newSet.add(source.url);
  hotReloadingSources.value = newSet;
}

export function stopHotReload(sourceUrl: string): void {
  const interval = pollIntervals.get(sourceUrl);
  if (interval) {
    clearInterval(interval);
    pollIntervals.delete(sourceUrl);
    lastKnownVersions.delete(sourceUrl);

    // Update the signal
    const newSet = new Set(hotReloadingSources.value);
    newSet.delete(sourceUrl);
    hotReloadingSources.value = newSet;
  }
}

export function isHotReloading(sourceUrl: string): boolean {
  return hotReloadingSources.value.has(sourceUrl);
}

export function initHotReloadFromSettings(allSources: PackageSource[]): void {
  for (const source of allSources) {
    if (source.hotReload && !pollIntervals.has(source.url)) {
      startHotReload(source, allSources);
    }
  }
}
