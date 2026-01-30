import {signal} from '@preact/signals';
import type {
  InstalledGroups,
  InstalledGroup,
  ToolGroupResult,
  ToolRegistryResult,
  ToolCache,
  EnabledTools
} from '../shared.js';

// Core signal
export const installedGroups = signal<InstalledGroups>({});

// Load from storage
export async function loadInstalledGroups(): Promise<void> {
  const result = await chrome.storage.local.get<{
    installedGroups: InstalledGroups;
  }>(['installedGroups']);
  installedGroups.value = result.installedGroups || {};
}

// Install a group (does NOT enable any tools)
export async function installGroup(
  group: ToolGroupResult,
  sourceUrl: string,
  baseUrl: string
): Promise<void> {
  const groupId = `${sourceUrl}:${group.name}`;

  const installedGroup: InstalledGroup = {
    name: group.name,
    sourceUrl,
    baseUrl,
    description: group.description,
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
    const toolGroupId = `${storedTool.sourceUrl}:${group.name}`;
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
    const toolNamesToRemove = new Set(group.tools.map((t) => t.name));
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
): {group: InstalledGroup; tool: ToolRegistryResult} | null {
  // compositeId format: sourceUrl:toolName
  for (const group of Object.values(installedGroups.value)) {
    for (const tool of group.tools) {
      if (`${group.sourceUrl}:${tool.name}` === compositeId) {
        return {group, tool};
      }
    }
  }
  return null;
}
