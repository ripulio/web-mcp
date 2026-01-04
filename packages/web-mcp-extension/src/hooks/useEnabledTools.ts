import {useState, useEffect} from 'preact/hooks';
import type {
  EnabledTools,
  StoredTool,
  ToolRegistryResult,
  ToolGroupResult
} from '../shared.js';
import {fetchToolSource, fetchLocalToolSource} from '../tool-registry.js';

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

    // Enable - fetch tool source
    setFetchingIds((prev) => new Set(prev).add(compositeId));
    setFetchErrors((prev) => {
      const {[compositeId]: _, ...rest} = prev;
      return rest;
    });

    try {
      const source =
        entry.sourceUrl === 'local'
          ? await fetchLocalToolSource(entry.name)
          : await fetchToolSource(entry.baseUrl, entry.name);

      const newStoredTool: StoredTool = {
        name: entry.name,
        description: entry.description,
        domains: entry.domains,
        pathPatterns: entry.pathPatterns,
        source,
        sourceUrl: entry.sourceUrl
      };

      const updatedTools = {...enabledTools, [compositeId]: newStoredTool};
      setEnabledTools(updatedTools);
      await chrome.storage.local.set({enabledToolGroups: updatedTools});
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch tool';
      setFetchErrors((prev) => ({...prev, [compositeId]: message}));
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(compositeId);
        return next;
      });
    }
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

      // Mark all as fetching
      const ids = toolsToEnable.map((t) => `${sourceUrl}:${t.name}`);
      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });

      // Fetch all in parallel
      const results = await Promise.allSettled(
        toolsToEnable.map(async (tool) => {
          const compositeId = `${sourceUrl}:${tool.name}`;
          const source =
            sourceUrl === 'local'
              ? await fetchLocalToolSource(tool.name)
              : await fetchToolSource(baseUrl, tool.name);
          return {
            compositeId,
            storedTool: {
              name: tool.name,
              description: tool.description,
              domains: tool.domains,
              pathPatterns: tool.pathPatterns,
              source,
              sourceUrl
            } as StoredTool
          };
        })
      );

      // Process results
      const updatedTools = {...enabledTools};
      const newErrors: {[id: string]: string} = {};

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const compositeId = `${sourceUrl}:${toolsToEnable[i].name}`;
        if (result.status === 'fulfilled') {
          updatedTools[result.value.compositeId] = result.value.storedTool;
        } else {
          newErrors[compositeId] =
            result.reason?.message || 'Failed to fetch tool';
        }
      }

      setEnabledTools(updatedTools);
      await chrome.storage.local.set({enabledToolGroups: updatedTools});
      setFetchErrors((prev) => ({...prev, ...newErrors}));
      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
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
