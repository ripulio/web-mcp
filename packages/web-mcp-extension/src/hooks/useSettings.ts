import {useState, useEffect} from 'preact/hooks';
import type {WebMCPSettings, PackageSource} from '../shared.js';
import {DEFAULT_SETTINGS, DEFAULT_PACKAGE_SOURCE} from '../shared.js';

// Helper function to derive sources array from settings
export function deriveSourcesFromSettings(
  settings: WebMCPSettings
): PackageSource[] {
  return [DEFAULT_PACKAGE_SOURCE, ...settings.customSources];
}

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
      setSettings(storedSettings);
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
