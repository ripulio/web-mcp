import {useState, useEffect} from 'preact/hooks';
import type {
  EnabledTools,
  StoredTool,
  ToolRegistryResult,
  ToolGroupResult,
  SourceCache
} from '../shared.js';
import {fetchToolSource} from '../tool-registry.js';

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

    // Enable - store reference (source looked up at injection time)
    const isLocal = entry.sourceUrl === 'local';

    if (!isLocal) {
      // Remote tools: fetch source and store in sourceCache
      setFetchingIds((prev) => new Set(prev).add(compositeId));
      setFetchErrors((prev) => {
        const {[compositeId]: _, ...rest} = prev;
        return rest;
      });

      try {
        const source = await fetchToolSource(entry.baseUrl, entry.name);

        // Store source in sourceCache
        const cacheResult = await chrome.storage.local.get<{sourceCache: SourceCache}>(['sourceCache']);
        const sourceCache = cacheResult.sourceCache || {};
        if (!sourceCache[entry.sourceUrl]) {
          sourceCache[entry.sourceUrl] = {};
        }
        sourceCache[entry.sourceUrl][entry.name] = source;
        await chrome.storage.local.set({sourceCache});
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to fetch tool';
        setFetchErrors((prev) => ({...prev, [compositeId]: message}));
        setFetchingIds((prev) => {
          const next = new Set(prev);
          next.delete(compositeId);
          return next;
        });
        return; // Don't enable if source fetch failed
      } finally {
        setFetchingIds((prev) => {
          const next = new Set(prev);
          next.delete(compositeId);
          return next;
        });
      }
    }

    // Store reference in enabledToolGroups (no source field)
    const newStoredTool: StoredTool = {
      name: entry.name,
      description: entry.description,
      domains: entry.domains,
      pathPatterns: entry.pathPatterns,
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

      if (isLocal) {
        // Local tools: just store refs, source is in browsedTools
        for (const tool of toolsToEnable) {
          const compositeId = `${sourceUrl}:${tool.name}`;
          updatedTools[compositeId] = {
            name: tool.name,
            description: tool.description,
            domains: tool.domains,
            pathPatterns: tool.pathPatterns,
            sourceUrl
          };
        }
      } else {
        // Remote tools: fetch sources and store in sourceCache
        setFetchingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        });

        const results = await Promise.allSettled(
          toolsToEnable.map(async (tool) => {
            const source = await fetchToolSource(baseUrl, tool.name);
            return {toolName: tool.name, source};
          })
        );

        // Update sourceCache with fetched sources
        const cacheResult = await chrome.storage.local.get<{sourceCache: SourceCache}>(['sourceCache']);
        const sourceCache = cacheResult.sourceCache || {};
        if (!sourceCache[sourceUrl]) {
          sourceCache[sourceUrl] = {};
        }

        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          const tool = toolsToEnable[i];
          const compositeId = `${sourceUrl}:${tool.name}`;

          if (result.status === 'fulfilled') {
            sourceCache[sourceUrl][tool.name] = result.value.source;
            updatedTools[compositeId] = {
              name: tool.name,
              description: tool.description,
              domains: tool.domains,
              pathPatterns: tool.pathPatterns,
              sourceUrl
            };
          } else {
            newErrors[compositeId] =
              result.reason?.message || 'Failed to fetch tool';
          }
        }

        await chrome.storage.local.set({sourceCache});
        setFetchingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }

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
