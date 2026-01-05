import {useState, useEffect} from 'preact/hooks';
import type {BrowsedToolsData} from '../shared.js';
import {parseToolDirectory} from '../directory-parser.js';
import {useDirectoryPolling} from './useDirectoryPolling.js';

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
