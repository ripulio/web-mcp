import {useState, useEffect} from 'preact/hooks';
import type {
  BrowsedToolsData,
  EnabledTools,
  ToolCache,
  CachedToolData
} from '../shared.js';
import {parseToolDirectory} from '../directory-parser.js';
import {useDirectoryPolling} from './useDirectoryPolling.js';

// Helper to extract domains and pathPatterns from filters
function extractFilters(
  filters: {type: string; domains?: string[]; patterns?: string[]}[]
): {
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

/**
 * Sync enabled local tools from browsedTools to toolCache.
 * This ensures toolCache always has the latest source/metadata after updates.
 */
async function syncLocalToolsToCache(
  browsedTools: BrowsedToolsData
): Promise<void> {
  const result = await chrome.storage.local.get<{
    enabledToolGroups: EnabledTools;
    toolCache: ToolCache;
  }>(['enabledToolGroups', 'toolCache']);

  const enabledTools = result.enabledToolGroups || {};
  const toolCache = result.toolCache || {};

  // Find enabled local tools
  const enabledLocalToolNames = Object.values(enabledTools)
    .filter((t) => t.sourceUrl === 'local')
    .map((t) => t.name);

  if (enabledLocalToolNames.length === 0) {
    return; // No local tools enabled, nothing to sync
  }

  // Ensure local entry exists in toolCache
  if (!toolCache['local']) {
    toolCache['local'] = {};
  }

  // Sync each enabled local tool
  for (const toolName of enabledLocalToolNames) {
    const browsedTool = browsedTools.tools.find((t) => t.id === toolName);
    if (browsedTool) {
      const {domains, pathPatterns} = extractFilters(browsedTool.filters);
      const toolData: CachedToolData = {
        source: browsedTool.source,
        domains,
        pathPatterns,
        description: browsedTool.description
      };
      toolCache['local'][toolName] = toolData;
    }
  }

  await chrome.storage.local.set({toolCache});
}

// File System Access API types
declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: 'read' | 'readwrite';
      startIn?:
        | 'desktop'
        | 'documents'
        | 'downloads'
        | 'music'
        | 'pictures'
        | 'videos';
    }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission(descriptor?: {
      mode?: 'read' | 'readwrite';
    }): Promise<PermissionState>;
    requestPermission(descriptor?: {
      mode?: 'read' | 'readwrite';
    }): Promise<PermissionState>;
  }
}

export interface UseBrowsedToolsOptions {
  onRefresh: () => Promise<void>;
}

export interface UseBrowsedToolsReturn {
  browsedTools: BrowsedToolsData | null;
  browsingError: string | null;
  isBrowsing: boolean;
  handleBrowseDirectory: () => Promise<void>;
  handleRefreshBrowsedTools: () => Promise<void>;
  handleClearBrowsedTools: () => Promise<void>;
  pollingEnabled: boolean;
  pollingError: string | null;
  handlePollingToggle: (enabled: boolean) => Promise<void>;
}

/**
 * Verify we have read permission on a directory handle, requesting if needed
 */
async function verifyPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const opts = {mode: 'read' as const};

  // Check if we already have permission
  if ((await handle.queryPermission(opts)) === 'granted') {
    return true;
  }

  // Request permission
  if ((await handle.requestPermission(opts)) === 'granted') {
    return true;
  }

  return false;
}

export function useBrowsedTools(
  options: UseBrowsedToolsOptions
): UseBrowsedToolsReturn {
  const {onRefresh} = options;

  const [browsedTools, setBrowsedTools] = useState<BrowsedToolsData | null>(
    null
  );
  const [browsingError, setBrowsingError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [cachedDirHandle, setCachedDirHandle] =
    useState<FileSystemDirectoryHandle | null>(null);

  // Directory polling hook
  const polling = useDirectoryPolling({
    dirHandle: cachedDirHandle,
    currentData: browsedTools,
    onUpdate: async (result) => {
      await chrome.storage.local.set({browsedTools: result});
      setBrowsedTools(result);
      // Sync enabled local tools to unified toolCache
      await syncLocalToolsToCache(result);
      await onRefresh();
    }
  });

  useEffect(() => {
    (async () => {
      const result = await chrome.storage.local.get<{
        browsedTools: BrowsedToolsData;
      }>(['browsedTools']);
      if (result.browsedTools) {
        setBrowsedTools(result.browsedTools);
      }
    })();
  }, []);

  const handleBrowseDirectory = async () => {
    setIsBrowsing(true);
    setBrowsingError(null);

    try {
      // Use File System Access API for native folder picker
      const dirHandle = await window.showDirectoryPicker({
        mode: 'read'
      });

      // Cache the handle for refresh
      setCachedDirHandle(dirHandle);

      const result = await parseToolDirectory(dirHandle);
      await chrome.storage.local.set({browsedTools: result});
      setBrowsedTools(result);
      // Sync enabled local tools to unified toolCache
      await syncLocalToolsToCache(result);
      // Refresh the registry to pick up new tools
      await onRefresh();
    } catch (error) {
      // User cancelled = AbortError, don't show as error
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled, do nothing
      } else {
        setBrowsingError(
          error instanceof Error ? error.message : 'Failed to parse directory'
        );
      }
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleRefreshBrowsedTools = async () => {
    if (!cachedDirHandle) {
      // No cached handle, fall back to browse
      return handleBrowseDirectory();
    }

    setIsBrowsing(true);
    setBrowsingError(null);

    try {
      // Verify we still have permission
      const hasPermission = await verifyPermission(cachedDirHandle);
      if (!hasPermission) {
        // Permission denied, need to re-pick
        setCachedDirHandle(null);
        return handleBrowseDirectory();
      }

      // Reuse cached handle
      const result = await parseToolDirectory(cachedDirHandle);
      await chrome.storage.local.set({browsedTools: result});
      setBrowsedTools(result);
      // Sync enabled local tools to unified toolCache
      await syncLocalToolsToCache(result);
      await onRefresh();
    } catch (error) {
      setBrowsingError(
        error instanceof Error ? error.message : 'Failed to refresh'
      );
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleClearBrowsedTools = async () => {
    await chrome.storage.local.remove(['browsedTools']);
    setBrowsedTools(null);
    setBrowsingError(null);
    setCachedDirHandle(null);
    // Refresh to fall back to bundled local-tools
    await onRefresh();
  };

  return {
    browsedTools,
    browsingError,
    isBrowsing,
    handleBrowseDirectory,
    handleRefreshBrowsedTools,
    handleClearBrowsedTools,
    pollingEnabled: polling.enabled,
    pollingError: polling.error,
    handlePollingToggle: polling.setEnabled
  };
}
