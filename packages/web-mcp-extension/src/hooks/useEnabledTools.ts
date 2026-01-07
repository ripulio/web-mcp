import {useState, useEffect} from 'preact/hooks';
import type {
  EnabledTools,
  StoredTool,
  ToolRegistryResult,
  ToolGroupResult,
  ToolCache,
  CachedToolData,
  BrowsedToolsData
} from '../shared.js';
import {fetchToolSource} from '../tool-registry.js';

// Helper to extract domains and pathPatterns from browsedTools filters
function extractFilters(filters: {type: string; domains?: string[]; patterns?: string[]}[]): {
  domains: string[];
  pathPatterns: string[];
} {
  const domainFilter = filters.find((f) => f.type === 'domain');
  const pathFilter = filters.find((f) => f.type === 'path');
  return {
    domains: domainFilter?.domains || [],
    pathPatterns: pathFilter?.patterns || []
  };
}

export type GroupToggleState = 'all' | 'none' | 'partial';

export interface UseEnabledToolsReturn {
  enabledTools: EnabledTools;
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
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [fetchErrors, setFetchErrors] = useState<{[id: string]: string}>({});

  useEffect(() => {
    (async () => {
      const result = await chrome.storage.local.get<{
        enabledToolGroups: EnabledTools;
      }>(['enabledToolGroups']);
      const storedTools: EnabledTools = result.enabledToolGroups || {};
      setEnabledTools(storedTools);
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
      // Disable - remove from storage
      const {[compositeId]: _, ...rest} = enabledTools;
      setEnabledTools(rest);
      await chrome.storage.local.set({enabledToolGroups: rest});
      return;
    }

    // Enable - get tool data and store in unified toolCache
    const isLocal = entry.sourceUrl === 'local';

    setFetchingIds((prev) => new Set(prev).add(compositeId));
    setFetchErrors((prev) => {
      const {[compositeId]: _, ...rest} = prev;
      return rest;
    });

    try {
      let toolData: CachedToolData;

      if (isLocal) {
        // Local tools: get data from browsedTools
        const browsedResult = await chrome.storage.local.get<{browsedTools: BrowsedToolsData}>(['browsedTools']);
        const browsedTool = browsedResult.browsedTools?.tools.find(t => t.id === entry.name);
        if (!browsedTool) {
          throw new Error('Tool not found in browsed tools');
        }
        const {domains, pathPatterns} = extractFilters(browsedTool.filters);
        toolData = {
          source: browsedTool.source,
          domains,
          pathPatterns,
          description: browsedTool.description
        };
      } else {
        // Remote tools: fetch source from server
        const source = await fetchToolSource(entry.baseUrl, entry.name);
        toolData = {
          source,
          domains: entry.domains,
          pathPatterns: entry.pathPatterns,
          description: entry.description
        };
      }

      // Store in unified toolCache
      const cacheResult = await chrome.storage.local.get<{toolCache: ToolCache}>(['toolCache']);
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

    // Store only reference in enabledToolGroups
    const newStoredTool: StoredTool = {
      name: entry.name,
      sourceUrl: entry.sourceUrl
    };

    const updatedTools = {...enabledTools, [compositeId]: newStoredTool};
    setEnabledTools(updatedTools);
    await chrome.storage.local.set({enabledToolGroups: updatedTools});
  };

  const handleGroupToggle = async (
    group: ToolGroupResult,
    sourceUrl: string,
    baseUrl: string
  ) => {
    const currentState = getGroupToggleState(group, sourceUrl);
    const shouldEnable = currentState !== 'all';
    const isLocal = sourceUrl === 'local';

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
      const cacheResult = await chrome.storage.local.get<{toolCache: ToolCache; browsedTools: BrowsedToolsData}>(['toolCache', 'browsedTools']);
      const toolCache = cacheResult.toolCache || {};
      if (!toolCache[sourceUrl]) {
        toolCache[sourceUrl] = {};
      }

      if (isLocal) {
        // Local tools: get data from browsedTools
        const browsedTools = cacheResult.browsedTools;
        for (const tool of toolsToEnable) {
          const compositeId = `${sourceUrl}:${tool.name}`;
          const browsedTool = browsedTools?.tools.find(t => t.id === tool.name);
          if (browsedTool) {
            const {domains, pathPatterns} = extractFilters(browsedTool.filters);
            toolCache[sourceUrl][tool.name] = {
              source: browsedTool.source,
              domains,
              pathPatterns,
              description: browsedTool.description
            };
            updatedTools[compositeId] = {
              name: tool.name,
              sourceUrl
            };
          } else {
            newErrors[compositeId] = 'Tool not found in browsed tools';
          }
        }
      } else {
        // Remote tools: fetch sources from server
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
      }

      await chrome.storage.local.set({toolCache});
      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      setEnabledTools(updatedTools);
      await chrome.storage.local.set({enabledToolGroups: updatedTools});
      if (Object.keys(newErrors).length > 0) {
        setFetchErrors((prev) => ({...prev, ...newErrors}));
      }
    } else {
      // Disable all tools in group
      const updatedTools = {...enabledTools};
      for (const tool of group.tools) {
        const compositeId = `${sourceUrl}:${tool.name}`;
        delete updatedTools[compositeId];
      }
      setEnabledTools(updatedTools);
      await chrome.storage.local.set({enabledToolGroups: updatedTools});
    }
  };

  return {
    enabledTools,
    fetchingIds,
    fetchErrors,
    handleToolToggle,
    handleGroupToggle,
    getGroupToggleState
  };
}
