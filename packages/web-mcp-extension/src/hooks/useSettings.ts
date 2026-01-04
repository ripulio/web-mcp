import {useState, useEffect} from 'preact/hooks';
import type {WebMCPSettings, CacheMode} from '../shared.js';
import {DEFAULT_SETTINGS, LOCAL_SOURCE} from '../shared.js';

export interface UseSettingsReturn {
  settings: WebMCPSettings;
  loading: boolean;
  cacheMode: CacheMode;
  isPersistent: boolean;
  cacheTTL: number;
  saveSettings: (newSettings: WebMCPSettings) => Promise<void>;
  handleCacheModeChange: (
    mode: 'none' | 'session' | 'manual' | 'persistent',
    onModeChange?: (newCacheMode: CacheMode) => void
  ) => Promise<void>;
  handleTTLChange: (ttl: number) => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<WebMCPSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await chrome.storage.local.get<{
        webmcpSettings: WebMCPSettings;
      }>(['webmcpSettings']);

      const storedSettings = result.webmcpSettings || DEFAULT_SETTINGS;

      // Ensure LOCAL_SOURCE is always present and up-to-date
      const nonLocalSources = storedSettings.packageSources.filter(
        (s) => s.type !== 'local' && s.url !== 'local'
      );
      const mergedSettings: WebMCPSettings = {
        ...storedSettings,
        packageSources: [LOCAL_SOURCE, ...nonLocalSources]
      };

      setSettings(mergedSettings);
      setLoading(false);
    })();
  }, []);

  const saveSettings = async (newSettings: WebMCPSettings) => {
    setSettings(newSettings);
    await chrome.storage.local.set({webmcpSettings: newSettings});
  };

  const cacheMode = settings.cacheMode;
  const isPersistent =
    typeof cacheMode === 'object' && cacheMode.type === 'persistent';
  const cacheTTL = isPersistent ? cacheMode.ttlMinutes : 60;

  const handleCacheModeChange = async (
    mode: 'none' | 'session' | 'manual' | 'persistent',
    onModeChange?: (newCacheMode: CacheMode) => void
  ) => {
    const previousMode = settings.cacheMode;
    const newCacheMode: CacheMode =
      mode === 'persistent' ? {type: 'persistent', ttlMinutes: cacheTTL} : mode;
    const newSettings = {...settings, cacheMode: newCacheMode};
    await saveSettings(newSettings);

    // Notify caller when switching TO "none" (user expects fresh data)
    if (mode === 'none' && previousMode !== 'none' && onModeChange) {
      onModeChange(newCacheMode);
    }
  };

  const handleTTLChange = async (ttl: number) => {
    if (ttl < 1) return;
    const newSettings = {
      ...settings,
      cacheMode: {type: 'persistent' as const, ttlMinutes: ttl}
    };
    await saveSettings(newSettings);
  };

  return {
    settings,
    loading,
    cacheMode,
    isPersistent,
    cacheTTL,
    saveSettings,
    handleCacheModeChange,
    handleTTLChange
  };
}
