import {signal} from '@preact/signals';
import type {
  InstalledGroups,
  InstalledGroup,
  GroupResponse,
  ToolResponse,
  ToolCache,
  EnabledTools
} from '../shared.js';
import {fetchGroup, refreshToolCache} from '../tool-registry.js';

// Core signal
export const installedGroups = signal<InstalledGroups>({});

// Update checking signals
export const groupUpdates = signal<Record<string, GroupResponse>>({});

// Load from storage
export async function loadInstalledGroups(): Promise<void> {
  const result = await chrome.storage.local.get<{
    installedGroups: InstalledGroups;
  }>(['installedGroups']);
  installedGroups.value = result.installedGroups || {};
}

// Install a group (does NOT enable any tools)
export async function installGroup(
  group: GroupResponse,
  sourceUrl: string,
  baseUrl: string
): Promise<void> {
  const groupId = `${sourceUrl}:${group.id}`;

  const installedGroup: InstalledGroup = {
    id: group.id,
    name: group.name,
    sourceUrl,
    baseUrl,
    description: group.description,
    revision: group.revision,
    tools: group.tools
  };

  const updated = {...installedGroups.value, [groupId]: installedGroup};
  installedGroups.value = updated;
  await chrome.storage.local.set({installedGroups: updated});
}

// Uninstall a group (also disables all tools and clears cache)
export async function uninstallGroup(groupId: string): Promise<void> {
  const group = installedGroups.value[groupId];
  if (!group) return;

  // Remove from installedGroups
  const {[groupId]: _, ...restGroups} = installedGroups.value;
  installedGroups.value = restGroups;

  // Remove all tools from enabledToolGroups
  const enabledResult = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
  }>(['enabledToolGroups']);
  const enabledTools = enabledResult.enabledToolGroups || {};
  const updatedEnabled: EnabledTools = {};
  for (const [compositeId, storedTool] of Object.entries(enabledTools)) {
    const toolGroupId = `${storedTool.sourceUrl}:${group.id}`;
    if (toolGroupId !== groupId) {
      updatedEnabled[compositeId] = storedTool;
    }
  }

  // Clear tools from toolCache
  const cacheResult = await chrome.storage.local.get<{
    toolCache: ToolCache;
  }>(['toolCache']);
  let toolCache = cacheResult.toolCache || {};
  if (toolCache[group.sourceUrl]) {
    const toolNamesToRemove = new Set(group.tools.map((t) => t.id));
    const remainingTools: ToolCache[string] = {};
    for (const [toolName, toolData] of Object.entries(
      toolCache[group.sourceUrl]
    )) {
      if (!toolNamesToRemove.has(toolName)) {
        remainingTools[toolName] = toolData;
      }
    }
    if (Object.keys(remainingTools).length === 0) {
      const {[group.sourceUrl]: _, ...restCache} = toolCache;
      toolCache = restCache;
    } else {
      toolCache = {...toolCache, [group.sourceUrl]: remainingTools};
    }
  }

  await chrome.storage.local.set({
    installedGroups: restGroups,
    enabledToolGroups: updatedEnabled,
    toolCache
  });
}

// Check if a group is installed
export function isGroupInstalled(groupId: string): boolean {
  return groupId in installedGroups.value;
}

// Get an installed tool by composite ID
export function getInstalledTool(
  compositeId: string
): {group: InstalledGroup; tool: ToolResponse} | null {
  // compositeId format: sourceUrl:toolName
  for (const group of Object.values(installedGroups.value)) {
    for (const tool of group.tools) {
      if (`${group.sourceUrl}:${tool.id}` === compositeId) {
        return {group, tool};
      }
    }
  }
  return null;
}

export async function checkForUpdates(): Promise<void> {
  const groups = Object.entries(installedGroups.value);
  if (groups.length === 0) return;

  const results = await Promise.allSettled(
    groups.map(async ([groupId, installed]) => {
      const remoteGroup = await fetchGroup(installed.baseUrl, installed.id);
      if (
        remoteGroup.revision !== undefined &&
        remoteGroup.revision !== installed.revision
      ) {
        return {groupId, remoteGroup};
      }
      return null;
    })
  );

  const updates: Record<string, GroupResponse> = {};
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      updates[result.value.groupId] = result.value.remoteGroup;
    }
  }

  groupUpdates.value = updates;
}

// Update an installed group to the latest remote revision
export async function updateGroup(groupId: string): Promise<void> {
  const remoteGroup = groupUpdates.value[groupId];
  const installed = installedGroups.value[groupId];
  if (!remoteGroup || !installed) return;

  await installGroup(remoteGroup, installed.sourceUrl, installed.baseUrl);

  // If group was enabled, refresh tool sources
  const enabledResult = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
  }>(['enabledToolGroups']);
  const enabledTools = enabledResult.enabledToolGroups || {};
  const hadEnabledTools = remoteGroup.tools.some(
    (t) => enabledTools[`${installed.sourceUrl}:${t.id}`] !== undefined
  );

  if (hadEnabledTools) {
    await refreshToolCache(
      installed.sourceUrl,
      installed.baseUrl,
      remoteGroup.tools
    );
  }

  // Remove from updates
  const {[groupId]: _, ...rest} = groupUpdates.value;
  groupUpdates.value = rest;
}
