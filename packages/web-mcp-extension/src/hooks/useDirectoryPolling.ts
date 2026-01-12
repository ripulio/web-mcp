import {useState, useEffect, useRef, useCallback} from 'preact/hooks';
import type {BrowsedToolsData} from '../shared.js';
import {parseToolDirectory} from '../directory-parser.js';

export interface UseDirectoryPollingOptions {
  dirHandle: FileSystemDirectoryHandle | null;
  currentData: BrowsedToolsData | null;
  onUpdate: (data: BrowsedToolsData) => Promise<void>;
  interval?: number;
}

export interface UseDirectoryPollingReturn {
  enabled: boolean;
  error: string | null;
  setEnabled: (enabled: boolean) => Promise<void>;
}

export function useDirectoryPolling(
  options: UseDirectoryPollingOptions
): UseDirectoryPollingReturn {
  const {dirHandle, currentData, onUpdate, interval = 5000} = options;

  const [enabled, setEnabledState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Use refs to avoid stale closures in the polling callback
  const currentDataRef = useRef(currentData);
  const onUpdateRef = useRef(onUpdate);
  currentDataRef.current = currentData;
  onUpdateRef.current = onUpdate;

  // Load persisted state on mount
  useEffect(() => {
    chrome.storage.local.get(['pollingEnabled']).then((result) => {
      if (result.pollingEnabled) {
        setEnabledState(true);
      }
    });
  }, []);

  // Polling effect
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled) {
      return;
    }

    if (!dirHandle) {
      setError('No directory selected. Click Browse to select a directory.');
      return;
    }

    // We have enabled + dirHandle, clear any stale error and start polling
    setError(null);

    const poll = async () => {
      try {
        const permission = await dirHandle.queryPermission({mode: 'read'});
        if (permission !== 'granted') {
          setError('Permission revoked');
          return;
        }

        const result = await parseToolDirectory(dirHandle);
        const current = currentDataRef.current;
        if (!current || result.lastUpdated > current.lastUpdated) {
          await onUpdateRef.current(result);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    };

    poll(); // Initial poll
    intervalRef.current = window.setInterval(poll, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, dirHandle, interval]);

  const setEnabled = useCallback(async (value: boolean) => {
    if (value) {
      setError(null);
    }
    setEnabledState(value);
    await chrome.storage.local.set({pollingEnabled: value});
  }, []);

  return {enabled, error, setEnabled};
}
