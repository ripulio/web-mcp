import {useState, useEffect} from 'preact/hooks';
import type {
  EnabledTools,
  StoredTool,
  ToolRegistryResult,
  ToolGroupResult,
  ToolCache,
  CachedToolData,
  DisabledTools,
  DisabledGroups,
} from '../shared.js';
import {fetchToolSource} from '../tool-registry.js';

export type GroupToggleState = 'all' | 'none' | 'partial';

export interface UseEnabledToolsReturn {
  enabledTools: EnabledTools;
  disabledTools: DisabledTools;
  disabledGroups: DisabledGroups;
  fetchingIds: Set<string>;
  fetchErrors: {[id: string]: string};
  handleToolToggle: (entry: ToolRegistryResult) => Promise<void>;
  handleGroupToggle: (
    group: ToolGroupResult,
    sourceUrl: string,
    baseUrl: string
  ) => Promise<void>;
  getGroupToggleState: (
    group: ToolGroupResult,
    sourceUrl: string
  ) => GroupToggleState;
}

export function useEnabledTools(): UseEnabledToolsReturn {
  const [enabledTools, setEnabledTools] = useState<EnabledTools>({});
  const [disabledTools, setDisabledTools] = useState<DisabledTools>({});
  const [disabledGroups, setDisabledGroups] = useState<DisabledGroups>({});
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [fetchErrors, setFetchErrors] = useState<{[id: string]: string}>({});

  useEffect(() => {
    (async () => {
      const result = await chrome.storage.local.get<{
        enabledToolGroups: EnabledTools;
        disabledTools: DisabledTools;
        disabledGroups: DisabledGroups;
      }>(['enabledToolGroups', 'disabledTools', 'disabledGroups']);
      setEnabledTools(result.enabledToolGroups || {});
      setDisabledTools(result.disabledTools || {});
      setDisabledGroups(result.disabledGroups || {});
    })();
  }, []);

  const getGroupToggleState = (
    group: ToolGroupResult,
    sourceUrl: string
  ): GroupToggleState => {
    const enabledCount = group.tools.filter((tool) => {
      const compositeId = `${sourceUrl}:${tool.name}`;
      return !!enabledTools[compositeId];
    }).length;

    if (enabledCount === 0) return 'none';
    if (enabledCount === group.tools.length) return 'all';
    return 'partial';
  };

  const handleToolToggle = async (entry: ToolRegistryResult) => {
    const compositeId = `${entry.sourceUrl}:${entry.name}`;
    const storedTool = enabledTools[compositeId];

    if (storedTool) {
      // Disable - remove from enabledTools, add to disabledTools
      const {[compositeId]: _, ...restEnabled} = enabledTools;
      const updatedDisabled = {...disabledTools, [compositeId]: true as const};
      setEnabledTools(restEnabled);
      setDisabledTools(updatedDisabled);
      await chrome.storage.local.set({
        enabledToolGroups: restEnabled,
        disabledTools: updatedDisabled
      });
      return;
    }

    // Enable - fetch tool data and store in unified toolCache
    setFetchingIds((prev) => new Set(prev).add(compositeId));
    setFetchErrors((prev) => {
      const {[compositeId]: _, ...rest} = prev;
      return rest;
    });

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
      setFetchErrors((prev) => ({...prev, [compositeId]: message}));
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(compositeId);
        return next;
      });
      return; // Don't enable if failed
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(compositeId);
        return next;
      });
    }

    // Store reference in enabledToolGroups and remove from disabledTools
    const newStoredTool: StoredTool = {
      name: entry.name,
      sourceUrl: entry.sourceUrl
    };

    const updatedEnabled = {...enabledTools, [compositeId]: newStoredTool};
    const {[compositeId]: _, ...restDisabled} = disabledTools;
    setEnabledTools(updatedEnabled);
    setDisabledTools(restDisabled);
    await chrome.storage.local.set({
      enabledToolGroups: updatedEnabled,
      disabledTools: restDisabled
    });
  };

  const handleGroupToggle = async (
    group: ToolGroupResult,
    sourceUrl: string,
    baseUrl: string
  ) => {
    const currentState = getGroupToggleState(group, sourceUrl);
    const shouldEnable = currentState !== 'all';

    if (shouldEnable) {
      // Enable all tools that aren't already enabled
      const toolsToEnable = group.tools.filter((tool) => {
        const compositeId = `${sourceUrl}:${tool.name}`;
        return !enabledTools[compositeId];
      });

      const ids = toolsToEnable.map((t) => `${sourceUrl}:${t.name}`);
      const updatedTools = {...enabledTools};
      const newErrors: {[id: string]: string} = {};

      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });

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
      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      // Remove tools from disabledTools and group from disabledGroups
      const groupId = `${sourceUrl}:${group.name}`;
      const updatedDisabledTools: DisabledTools = {};
      const toolsToRemove: string[] = [];
      for (const tool of group.tools) {
        const compositeId = `${sourceUrl}:${tool.name}`;
        toolsToRemove.push(compositeId);
      }
      for (const [key, value] of Object.entries(disabledTools)) {
        if (!toolsToRemove.includes(key)) {
          updatedDisabledTools[key] = value;
        }
      }
      const {[groupId]: _, ...updatedDisabledGroups} = disabledGroups;

      setEnabledTools(updatedTools);
      setDisabledTools(updatedDisabledTools);
      setDisabledGroups(updatedDisabledGroups);
      await chrome.storage.local.set({
        enabledToolGroups: updatedTools,
        disabledTools: updatedDisabledTools,
        disabledGroups: updatedDisabledGroups
      });
      if (Object.keys(newErrors).length > 0) {
        setFetchErrors((prev) => ({...prev, ...newErrors}));
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
      for (const [key, value] of Object.entries(enabledTools)) {
        if (!toolsToRemove.includes(key)) {
          updatedEnabledTools[key] = value;
        }
      }
      const updatedDisabledGroups = {
        ...disabledGroups,
        [groupId]: true as const
      };

      setEnabledTools(updatedEnabledTools);
      setDisabledGroups(updatedDisabledGroups);
      await chrome.storage.local.set({
        enabledToolGroups: updatedEnabledTools,
        disabledGroups: updatedDisabledGroups
      });
    }
  };

  return {
    enabledTools,
    disabledTools,
    disabledGroups,
    fetchingIds,
    fetchErrors,
    handleToolToggle,
    handleGroupToggle,
    getGroupToggleState
  };
}
