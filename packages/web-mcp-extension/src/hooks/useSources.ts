import {useState} from 'preact/hooks';
import type {
  WebMCPSettings,
  PackageSource,
  GroupedToolRegistryResult,
  BrowsedToolsData,
  EnabledTools
} from '../shared.js';
import {LOCAL_SOURCE} from '../shared.js';
import {searchToolsGrouped, validateSource, refreshToolCache} from '../tool-registry.js';

export interface UseSourcesOptions {
  settings: WebMCPSettings;
  saveSettings: (settings: WebMCPSettings) => Promise<void>;
  loadRegistry: (sources: PackageSource[]) => Promise<void>;
  clearSourceError: (url: string) => void;
  setSourceError: (url: string, error: string) => void;
  removeFromRegistries: (sourceUrl: string) => void;
  updateSourceInRegistry: (
    sourceUrl: string,
    data: GroupedToolRegistryResult,
    isEnabled: boolean
  ) => void;
  moveToActive: (sourceUrl: string, data: GroupedToolRegistryResult) => void;
  moveToInactive: (sourceUrl: string, data: GroupedToolRegistryResult) => void;
  inactiveRegistry: GroupedToolRegistryResult[];
  activeRegistry: GroupedToolRegistryResult[];
  browsedTools: BrowsedToolsData | null;
  onRefreshBrowsedTools: () => Promise<void>;
  onAutoEnable?: (sourceUrl: string, registry: GroupedToolRegistryResult, baseUrl: string) => Promise<void>;
}

export interface UseSourcesReturn {
  newSourceUrl: string;
  setNewSourceUrl: (url: string) => void;
  refreshingSource: string | null;
  addingSource: boolean;
  addSourceError: string | null;
  clearAddSourceError: () => void;
  handleAddSource: () => Promise<void>;
  handleRemoveSource: (url: string) => Promise<void>;
  handleSourceToggle: (url: string, enabled: boolean) => Promise<void>;
  handleRefreshSource: (url: string) => Promise<void>;
  handleAutoEnableToggle: (url: string, autoEnable: boolean) => Promise<void>;
}

export function useSources(options: UseSourcesOptions): UseSourcesReturn {
  const {
    settings,
    saveSettings,
    loadRegistry,
    clearSourceError,
    setSourceError,
    removeFromRegistries,
    updateSourceInRegistry,
    moveToActive,
    moveToInactive,
    inactiveRegistry,
    activeRegistry,
    browsedTools,
    onRefreshBrowsedTools,
    onAutoEnable
  } = options;

  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [refreshingSource, setRefreshingSource] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [addSourceError, setAddSourceError] = useState<string | null>(null);

  const clearAddSourceError = () => setAddSourceError(null);

  const handleRefreshSource = async (url: string) => {
    setRefreshingSource(url);

    // Clear any existing error for this source
    clearSourceError(url);

    // Find the source to get its type and enabled state
    const source = settings.packageSources.find((s) => s.url === url);
    const isLocal = source?.type === 'local' || url === 'local';
    const isEnabled = source?.enabled !== false;

    if (isLocal && browsedTools) {
      // Refresh browsed tools
      await onRefreshBrowsedTools();
      setRefreshingSource(null);
      return;
    }

    // Fetch fresh manifest first (both to validate and get updated metadata)
    const sourceToRefresh = isLocal ? LOCAL_SOURCE : {url};
    const results = await searchToolsGrouped([sourceToRefresh], 'none');
    const sourceResult = results[0];

    if (sourceResult?.error) {
      setSourceError(url, sourceResult.error);
      removeFromRegistries(url);
      setRefreshingSource(null);
      return;
    }

    if (!isLocal && sourceResult) {
      // Refresh source cache for enabled tools from this source
      // Use fresh metadata from the manifest we just fetched
      const storageResult = await chrome.storage.local.get<{enabledToolGroups: EnabledTools}>(['enabledToolGroups']);
      const enabledTools = storageResult.enabledToolGroups || {};
      const enabledToolNames = new Set(
        Object.values(enabledTools)
          .filter(tool => tool.sourceUrl === url)
          .map(tool => tool.name)
      );

      // Find enabled tools in the refreshed manifest and get their full metadata
      const toolsToRefresh = sourceResult.groups.flatMap(group =>
        group.tools
          .filter(tool => enabledToolNames.has(tool.name))
          .map(tool => ({
            name: tool.name,
            domains: tool.domains,
            pathPatterns: tool.pathPatterns,
            description: tool.description
          }))
      );

      if (toolsToRefresh.length > 0) {
        const baseUrl = url.replace(/\/$/, '');
        await refreshToolCache(url, baseUrl, toolsToRefresh);
      }
    }

    if (sourceResult) {
      updateSourceInRegistry(url, sourceResult, isEnabled);

      // Auto-enable new tools if source has autoEnable=true
      if (source?.autoEnable && onAutoEnable) {
        const baseUrl = isLocal ? 'local' : url.replace(/\/$/, '');
        await onAutoEnable(isLocal ? 'local' : url, sourceResult, baseUrl);
      }
    }

    setRefreshingSource(null);
  };

  const handleAddSource = async () => {
    const url = newSourceUrl.trim();
    if (!url) return;

    // Clear previous error
    setAddSourceError(null);

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setAddSourceError('Invalid URL format');
      return;
    }

    // Check for duplicates
    if (settings.packageSources.some((s) => s.url === url)) {
      setAddSourceError('Source already exists');
      return;
    }

    // Validate the source can be fetched
    setAddingSource(true);
    const result = await validateSource(url);

    if (!result.valid) {
      setAddSourceError(result.error || 'Failed to fetch source');
      setAddingSource(false);
      return;
    }

    const newSource: PackageSource = {url};
    const newSettings = {
      ...settings,
      packageSources: [...settings.packageSources, newSource]
    };

    await saveSettings(newSettings);
    setNewSourceUrl('');
    setAddingSource(false);

    // Reload registry with new source
    await loadRegistry(newSettings.packageSources);
  };

  const handleRemoveSource = async (url: string) => {
    // Don't allow removing the local source
    const source = settings.packageSources.find((s) => s.url === url);
    if (source?.type === 'local' || url === 'local') {
      return;
    }

    // Clear any error for this source
    clearSourceError(url);

    // Remove from both registries immediately (no loading state)
    removeFromRegistries(url);

    const newSettings = {
      ...settings,
      packageSources: settings.packageSources.filter((s) => s.url !== url)
    };

    await saveSettings(newSettings);
  };

  const handleSourceToggle = async (url: string, enabled: boolean) => {
    // Update settings
    const newSettings = {
      ...settings,
      packageSources: settings.packageSources.map((s) =>
        s.url === url ? {...s, enabled} : s
      )
    };
    await saveSettings(newSettings);

    const sourceUrl = url === 'local' ? 'local' : url;

    if (enabled) {
      // Move from inactive to active
      const sourceData = inactiveRegistry.find(
        (r) => r.sourceUrl === sourceUrl
      );
      if (sourceData) {
        moveToActive(sourceUrl, sourceData);
      } else {
        // No cached data - need to refetch
        const source = newSettings.packageSources.find((s) => s.url === url);
        const sourceToFetch = source?.type === 'local' ? LOCAL_SOURCE : {url};
        const results = await searchToolsGrouped([sourceToFetch], 'none');
        const sourceResult = results[0];
        if (sourceResult && !sourceResult.error) {
          moveToActive(sourceUrl, sourceResult);
        } else if (sourceResult?.error) {
          setSourceError(sourceUrl, sourceResult.error);
        }
      }
    } else {
      // Move from active to inactive
      const sourceData = activeRegistry.find((r) => r.sourceUrl === sourceUrl);
      if (sourceData) {
        moveToInactive(sourceUrl, sourceData);
      }
    }
  };

  const handleAutoEnableToggle = async (url: string, autoEnable: boolean) => {
    const newSettings = {
      ...settings,
      packageSources: settings.packageSources.map((s) =>
        s.url === url ? {...s, autoEnable} : s
      )
    };
    await saveSettings(newSettings);
  };

  return {
    newSourceUrl,
    setNewSourceUrl,
    refreshingSource,
    addingSource,
    addSourceError,
    clearAddSourceError,
    handleAddSource,
    handleRemoveSource,
    handleSourceToggle,
    handleRefreshSource,
    handleAutoEnableToggle
  };
}
