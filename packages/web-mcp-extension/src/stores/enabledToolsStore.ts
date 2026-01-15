import {signal} from '@preact/signals';
import type {
  EnabledTools,
  StoredTool,
  ToolRegistryResult,
  ToolGroupResult,
  ToolCache,
  CachedToolData,
  DisabledTools,
  DisabledGroups
} from '../shared.js';
import {fetchToolSource} from '../tool-registry.js';

export type GroupToggleState = 'all' | 'none' | 'partial';

// Core signals
export const enabledTools = signal<EnabledTools>({});
export const disabledTools = signal<DisabledTools>({});
export const disabledGroups = signal<DisabledGroups>({});
export const fetchingIds = signal<Set<string>>(new Set());
export const fetchErrors = signal<{[id: string]: string}>({});

// Load from storage
export async function loadEnabledTools(): Promise<void> {
  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
    disabledTools: DisabledTools;
    disabledGroups: DisabledGroups;
  }>(['enabledToolGroups', 'disabledTools', 'disabledGroups']);

  enabledTools.value = result.enabledToolGroups || {};
  disabledTools.value = result.disabledTools || {};
  disabledGroups.value = result.disabledGroups || {};
}

// Computed-like function (takes parameters)
export function getGroupToggleState(
  group: ToolGroupResult,
  sourceUrl: string
): GroupToggleState {
  const enabledCount = group.tools.filter((tool) => {
    const compositeId = `${sourceUrl}:${tool.name}`;
    return !!enabledTools.value[compositeId];
  }).length;

  if (enabledCount === 0) return 'none';
  if (enabledCount === group.tools.length) return 'all';
  return 'partial';
}

// Actions
export async function handleToolToggle(
  entry: ToolRegistryResult
): Promise<void> {
  const compositeId = `${entry.sourceUrl}:${entry.name}`;
  const storedTool = enabledTools.value[compositeId];

  if (storedTool) {
    // Disable - remove from enabledTools, add to disabledTools
    const {[compositeId]: _, ...restEnabled} = enabledTools.value;
    const updatedDisabled = {
      ...disabledTools.value,
      [compositeId]: true as const
    };
    enabledTools.value = restEnabled;
    disabledTools.value = updatedDisabled;
    await chrome.storage.local.set({
      enabledToolGroups: restEnabled,
      disabledTools: updatedDisabled
    });
    return;
  }

  // Enable - fetch tool data and store in unified toolCache
  fetchingIds.value = new Set(fetchingIds.value).add(compositeId);
  const {[compositeId]: __, ...restErrors} = fetchErrors.value;
  fetchErrors.value = restErrors;

  try {
    // Fetch source from remote server
    const source = await fetchToolSource(entry.baseUrl, entry.name);
    const toolData: CachedToolData = {
      source,
      domains: entry.domains,
      pathPatterns: entry.pathPatterns,
      queryParams: entry.queryParams,
      description: entry.description
    };

    // Store in unified toolCache
    const cacheResult = await chrome.storage.local.get<{
      toolCache: ToolCache;
    }>(['toolCache']);
    const toolCache = cacheResult.toolCache || {};
    if (!toolCache[entry.sourceUrl]) {
      toolCache[entry.sourceUrl] = {};
    }
    toolCache[entry.sourceUrl][entry.name] = toolData;
    await chrome.storage.local.set({toolCache});
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch tool';
    fetchErrors.value = {...fetchErrors.value, [compositeId]: message};
    const next = new Set(fetchingIds.value);
    next.delete(compositeId);
    fetchingIds.value = next;
    return; // Don't enable if failed
  } finally {
    const next = new Set(fetchingIds.value);
    next.delete(compositeId);
    fetchingIds.value = next;
  }

  // Store reference in enabledToolGroups and remove from disabledTools
  const newStoredTool: StoredTool = {
    name: entry.name,
    sourceUrl: entry.sourceUrl
  };

  const updatedEnabled = {
    ...enabledTools.value,
    [compositeId]: newStoredTool
  };
  const {[compositeId]: ___, ...restDisabled} = disabledTools.value;
  enabledTools.value = updatedEnabled;
  disabledTools.value = restDisabled;
  await chrome.storage.local.set({
    enabledToolGroups: updatedEnabled,
    disabledTools: restDisabled
  });
}

export async function handleGroupToggle(
  group: ToolGroupResult,
  sourceUrl: string,
  baseUrl: string
): Promise<void> {
  const currentState = getGroupToggleState(group, sourceUrl);
  const shouldEnable = currentState !== 'all';

  if (shouldEnable) {
    // Enable all tools that aren't already enabled
    const toolsToEnable = group.tools.filter((tool) => {
      const compositeId = `${sourceUrl}:${tool.name}`;
      return !enabledTools.value[compositeId];
    });

    const ids = toolsToEnable.map((t) => `${sourceUrl}:${t.name}`);
    const updatedTools = {...enabledTools.value};
    const newErrors: {[id: string]: string} = {};

    const newFetching = new Set(fetchingIds.value);
    ids.forEach((id) => newFetching.add(id));
    fetchingIds.value = newFetching;

    // Get tool data and store in unified toolCache
    const cacheResult = await chrome.storage.local.get<{
      toolCache: ToolCache;
    }>(['toolCache']);
    const toolCache = cacheResult.toolCache || {};
    if (!toolCache[sourceUrl]) {
      toolCache[sourceUrl] = {};
    }

    // Fetch sources from server
    const results = await Promise.allSettled(
      toolsToEnable.map(async (tool) => {
        const source = await fetchToolSource(baseUrl, tool.name);
        return {tool, source};
      })
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const tool = toolsToEnable[i];
      const compositeId = `${sourceUrl}:${tool.name}`;

      if (result.status === 'fulfilled') {
        toolCache[sourceUrl][tool.name] = {
          source: result.value.source,
          domains: tool.domains,
          pathPatterns: tool.pathPatterns,
          queryParams: tool.queryParams,
          description: tool.description
        };
        updatedTools[compositeId] = {
          name: tool.name,
          sourceUrl
        };
      } else {
        newErrors[compositeId] =
          result.reason?.message || 'Failed to fetch tool';
      }
    }

    await chrome.storage.local.set({toolCache});

    const nextFetching = new Set(fetchingIds.value);
    ids.forEach((id) => nextFetching.delete(id));
    fetchingIds.value = nextFetching;

    // Remove tools from disabledTools and group from disabledGroups
    const groupId = `${sourceUrl}:${group.name}`;
    const updatedDisabledTools: DisabledTools = {};
    const toolsToRemove: string[] = [];
    for (const tool of group.tools) {
      const compositeId = `${sourceUrl}:${tool.name}`;
      toolsToRemove.push(compositeId);
    }
    for (const [key, value] of Object.entries(disabledTools.value)) {
      if (!toolsToRemove.includes(key)) {
        updatedDisabledTools[key] = value;
      }
    }
    const {[groupId]: _, ...updatedDisabledGroups} = disabledGroups.value;

    enabledTools.value = updatedTools;
    disabledTools.value = updatedDisabledTools;
    disabledGroups.value = updatedDisabledGroups;
    await chrome.storage.local.set({
      enabledToolGroups: updatedTools,
      disabledTools: updatedDisabledTools,
      disabledGroups: updatedDisabledGroups
    });
    if (Object.keys(newErrors).length > 0) {
      fetchErrors.value = {...fetchErrors.value, ...newErrors};
    }
  } else {
    // Disable all tools in group - add to disabledGroups
    const groupId = `${sourceUrl}:${group.name}`;
    const updatedEnabledTools: EnabledTools = {};
    const toolsToRemove: string[] = [];
    for (const tool of group.tools) {
      const compositeId = `${sourceUrl}:${tool.name}`;
      toolsToRemove.push(compositeId);
    }
    for (const [key, value] of Object.entries(enabledTools.value)) {
      if (!toolsToRemove.includes(key)) {
        updatedEnabledTools[key] = value;
      }
    }
    const updatedDisabledGroups = {
      ...disabledGroups.value,
      [groupId]: true as const
    };

    enabledTools.value = updatedEnabledTools;
    disabledGroups.value = updatedDisabledGroups;
    await chrome.storage.local.set({
      enabledToolGroups: updatedEnabledTools,
      disabledGroups: updatedDisabledGroups
    });
  }
}
