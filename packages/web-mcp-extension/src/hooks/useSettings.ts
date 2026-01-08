import {useState, useEffect} from 'preact/hooks';
import type {WebMCPSettings} from '../shared.js';
import {DEFAULT_SETTINGS, LOCAL_SOURCE} from '../shared.js';

export interface UseSettingsReturn {
  settings: WebMCPSettings;
  loading: boolean;
  browserControlEnabled: boolean;
  saveSettings: (newSettings: WebMCPSettings) => Promise<void>;
  handleBrowserControlToggle: (enabled: boolean) => Promise<void>;
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
      const storedLocalSource = storedSettings.packageSources.find(
        (s) => s.type === 'local' || s.url === 'local'
      );
      const nonLocalSources = storedSettings.packageSources.filter(
        (s) => s.type !== 'local' && s.url !== 'local'
      );
      // Preserve user's enabled state, use LOCAL_SOURCE for other fields
      const localSource = {
        ...LOCAL_SOURCE,
        enabled: storedLocalSource?.enabled ?? LOCAL_SOURCE.enabled
      };
      const mergedSettings: WebMCPSettings = {
        ...storedSettings,
        packageSources: [localSource, ...nonLocalSources]
      };

      setSettings(mergedSettings);
      setLoading(false);
    })();
  }, []);

  const saveSettings = async (newSettings: WebMCPSettings) => {
    setSettings(newSettings);
    await chrome.storage.local.set({webmcpSettings: newSettings});
  };

  const browserControlEnabled = settings.browserControlEnabled ?? false;

  const handleBrowserControlToggle = async (enabled: boolean) => {
    const newSettings = {...settings, browserControlEnabled: enabled};
    await saveSettings(newSettings);

    // Notify background script of the change
    chrome.runtime.sendMessage({
      type: 'BROWSER_CONTROL_TOGGLE',
      enabled
    });
  };

  return {
    settings,
    loading,
    browserControlEnabled,
    saveSettings,
    handleBrowserControlToggle
  };
}
