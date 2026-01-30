import {signal} from '@preact/signals';
import type {
  EnabledTools,
  StoredTool,
  ToolCache,
  InstalledGroup
} from '../shared.js';
import {fetchToolSource} from '../tool-registry.js';

// Core signals
export const enabledTools = signal<EnabledTools>({});
export const fetchingGroupIds = signal<Set<string>>(new Set());
export const fetchErrors = signal<{[id: string]: string}>({});

// Load from storage
export async function loadEnabledTools(): Promise<void> {
  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
  }>(['enabledToolGroups']);

  enabledTools.value = result.enabledToolGroups || {};
}

// Check if a group is enabled (all tools enabled)
export function isGroupEnabled(group: InstalledGroup): boolean {
  return group.tools.every((tool) => {
    const compositeId = `${group.sourceUrl}:${tool.name}`;
    return !!enabledTools.value[compositeId];
  });
}

// Enable all tools in an installed group
export async function enableGroup(group: InstalledGroup): Promise<void> {
  const groupId = `${group.sourceUrl}:${group.name}`;

  const toolsToEnable = group.tools.filter((tool) => {
    const compositeId = `${group.sourceUrl}:${tool.name}`;
    return !enabledTools.value[compositeId];
  });

  if (toolsToEnable.length === 0) return;

  fetchingGroupIds.value = new Set(fetchingGroupIds.value).add(groupId);

  const cacheResult = await chrome.storage.local.get<{
    toolCache: ToolCache;
  }>(['toolCache']);
  const toolCache = cacheResult.toolCache || {};
  if (!toolCache[group.sourceUrl]) {
    toolCache[group.sourceUrl] = {};
  }

  const updatedTools = {...enabledTools.value};
  const errors: string[] = [];

  // Fetch sources in parallel
  const results = await Promise.allSettled(
    toolsToEnable.map(async (tool) => {
      const source = await fetchToolSource(group.baseUrl, tool.name);
      return {tool, source};
    })
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const tool = toolsToEnable[i];
    const compositeId = `${group.sourceUrl}:${tool.name}`;

    if (result.status === 'fulfilled') {
      toolCache[group.sourceUrl][tool.name] = {
        source: result.value.source,
        tool
      };
      updatedTools[compositeId] = {
        name: tool.name,
        sourceUrl: group.sourceUrl
      } satisfies StoredTool;
    } else {
      errors.push(result.reason?.message || `Failed to fetch ${tool.name}`);
    }
  }

  await chrome.storage.local.set({toolCache});

  const nextFetching = new Set(fetchingGroupIds.value);
  nextFetching.delete(groupId);
  fetchingGroupIds.value = nextFetching;

  enabledTools.value = updatedTools;
  await chrome.storage.local.set({enabledToolGroups: updatedTools});

  if (errors.length > 0) {
    fetchErrors.value = {...fetchErrors.value, [groupId]: errors.join(', ')};
  } else {
    const {[groupId]: _, ...restErrors} = fetchErrors.value;
    fetchErrors.value = restErrors;
  }
}

// Disable all tools in an installed group
export async function disableGroup(group: InstalledGroup): Promise<void> {
  const toolsToRemove = group.tools.map(
    (tool) => `${group.sourceUrl}:${tool.name}`
  );

  const updatedEnabled: EnabledTools = {};
  for (const [key, value] of Object.entries(enabledTools.value)) {
    if (!toolsToRemove.includes(key)) {
      updatedEnabled[key] = value;
    }
  }

  enabledTools.value = updatedEnabled;
  await chrome.storage.local.set({enabledToolGroups: updatedEnabled});
}

// Toggle group enabled state
export async function toggleGroup(group: InstalledGroup): Promise<void> {
  if (isGroupEnabled(group)) {
    await disableGroup(group);
  } else {
    await enableGroup(group);
  }
}
