import {useState, useEffect} from 'preact/hooks';
import type {WebMCPSettings, PackageSource} from '../shared.js';
import {
  DEFAULT_SETTINGS,
  DEFAULT_PACKAGE_SOURCE,
  getLocalhostSource
} from '../shared.js';

// Helper function to derive sources array from settings
// mcpPort: The port of the connected MCP server (local tools will use mcpPort + 1)
export function deriveSourcesFromSettings(
  settings: WebMCPSettings,
  mcpPort?: number
): PackageSource[] {
  const sources = [DEFAULT_PACKAGE_SOURCE];
  if (settings.localToolsEnabled && mcpPort !== undefined) {
    const localToolsPort = mcpPort + 1;
    sources.push(getLocalhostSource(localToolsPort));
  }
  return sources;
}

export interface UseSettingsReturn {
  settings: WebMCPSettings;
  loading: boolean;
  browserControlEnabled: boolean;
  localToolsEnabled: boolean;
  saveSettings: (newSettings: WebMCPSettings) => Promise<void>;
  handleBrowserControlToggle: (enabled: boolean) => Promise<void>;
  handleLocalToolsToggle: (enabled: boolean) => Promise<void>;
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
  const localToolsEnabled = settings.localToolsEnabled ?? false;

  const handleBrowserControlToggle = async (enabled: boolean) => {
    const newSettings = {...settings, browserControlEnabled: enabled};
    await saveSettings(newSettings);

    // Notify background script of the change
    chrome.runtime.sendMessage({
      type: 'BROWSER_CONTROL_TOGGLE',
      enabled
    });
  };

  const handleLocalToolsToggle = async (enabled: boolean) => {
    const newSettings = {...settings, localToolsEnabled: enabled};
    await saveSettings(newSettings);
  };

  return {
    settings,
    loading,
    browserControlEnabled,
    localToolsEnabled,
    saveSettings,
    handleBrowserControlToggle,
    handleLocalToolsToggle
  };
}
