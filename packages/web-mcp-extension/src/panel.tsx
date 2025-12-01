import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type {
  EnabledToolGroups,
  StoredToolGroup,
  CacheMode,
  PackageSource,
  WebMCPSettings
} from './shared.js';
import { DEFAULT_SETTINGS } from './shared.js';
import { searchTools, fetchToolSource, type ToolRegistryResult } from './tool-registry.js';

function Panel() {
  const [enabledToolGroups, setEnabledToolGroups] = useState<EnabledToolGroups>({});
  const [registry, setRegistry] = useState<ToolRegistryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WebMCPSettings>(DEFAULT_SETTINGS);
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [fetchingId, setFetchingId] = useState<string | null>(null);
  const [fetchErrors, setFetchErrors] = useState<{ [id: string]: string }>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState<Set<string>>(new Set());
  const [checkingSource, setCheckingSource] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [overflowingDescriptions, setOverflowingDescriptions] = useState<Set<string>>(new Set());
  const descriptionRefs = useRef<Map<string, HTMLSpanElement>>(new Map());

  const toggleExpand = (compositeId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(compositeId)) {
        next.delete(compositeId);
      } else {
        next.add(compositeId);
      }
      return next;
    });
  };

  const toggleDescription = (key: string) => {
    setExpandedDescriptions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Check which descriptions are overflowing after render
  useEffect(() => {
    const newOverflowing = new Set<string>();
    descriptionRefs.current.forEach((el, key) => {
      if (el && el.scrollWidth > el.clientWidth) {
        newOverflowing.add(key);
      }
    });
    setOverflowingDescriptions(newOverflowing);
  }, [registry, expandedGroups]);

  const isUrl = (str: string) => str.includes('://') || str.startsWith('www.');

  const filterRegistry = (entries: ToolRegistryResult[], query: string) => {
    if (!query.trim()) return entries;

    const q = query.toLowerCase().trim();

    if (isUrl(q)) {
      // URL matching mode
      try {
        const url = new URL(q.startsWith('www.') ? `https://${q}` : q);
        return entries.filter(entry =>
          entry.domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))
        );
      } catch {
        return entries; // Invalid URL, show all
      }
    }

    // Free text mode
    return entries.filter(entry => {
      const searchable = [
        entry.name,
        entry.description,
        ...entry.domains,
        ...entry.tools.map(t => t.name),
        entry.baseUrl
      ].join(' ').toLowerCase();
      return searchable.includes(q);
    });
  };

  const filteredRegistry = filterRegistry(registry, searchQuery);

  const loadRegistry = async (sources: PackageSource[], cacheMode: CacheMode) => {
    setLoading(true);
    const tools = await searchTools(sources, cacheMode);
    setRegistry(tools);
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      // Load settings first
      const result = await chrome.storage.local.get<{
        enabledToolGroups: EnabledToolGroups;
        webmcpSettings: WebMCPSettings;
      }>(['enabledToolGroups', 'webmcpSettings']);

      const storedSettings = result.webmcpSettings || DEFAULT_SETTINGS;
      const storedGroups: EnabledToolGroups = result.enabledToolGroups || {};

      setSettings(storedSettings);
      setEnabledToolGroups(storedGroups);

      // Then load registry with those settings
      await loadRegistry(storedSettings.packageSources, storedSettings.cacheMode);
    })();
  }, []);

  const saveSettings = async (newSettings: WebMCPSettings) => {
    setSettings(newSettings);
    await chrome.storage.local.set({ webmcpSettings: newSettings });
  };

  const cacheMode = settings.cacheMode;
  const isPersistent = typeof cacheMode === 'object' && cacheMode.type === 'persistent';
  const cacheTTL = isPersistent ? cacheMode.ttlMinutes : 60;

  const handleCacheModeChange = async (mode: 'none' | 'session' | 'manual' | 'persistent') => {
    const previousMode = settings.cacheMode;
    const newCacheMode: CacheMode = mode === 'persistent'
      ? { type: 'persistent', ttlMinutes: cacheTTL }
      : mode;
    const newSettings = { ...settings, cacheMode: newCacheMode };
    await saveSettings(newSettings);

    // Clear update badges when switching modes
    setUpdateAvailable(new Set());

    // Only refetch when switching TO "none" (user expects fresh data)
    if (mode === 'none' && previousMode !== 'none') {
      await loadRegistry(newSettings.packageSources, newCacheMode);
    }
  };

  const handleTTLChange = async (ttl: number) => {
    if (ttl < 1) return;
    const newSettings = { ...settings, cacheMode: { type: 'persistent' as const, ttlMinutes: ttl } };
    await saveSettings(newSettings);
  };

  const handleRefresh = async () => {
    await loadRegistry(settings.packageSources, 'none');
  };

  const handleCheckUpdates = async (sourceUrl?: string) => {
    const sourcesToCheck = sourceUrl
      ? settings.packageSources.filter((s) => s.url === sourceUrl)
      : settings.packageSources;

    if (sourceUrl) {
      setCheckingSource(sourceUrl);
    } else {
      setLoading(true);
    }

    try {
      // Force-fetch fresh manifests
      const freshRegistry = await searchTools(sourcesToCheck, 'none');

      // If checking all sources, update the full registry
      if (!sourceUrl) {
        setRegistry(freshRegistry);
      }

      // Find enabled groups with version mismatches
      const newUpdateAvailable = new Set(updateAvailable);
      for (const entry of freshRegistry) {
        const compositeId = `${entry.sourceUrl}:${entry.id}`;
        const storedGroup = enabledToolGroups[compositeId];
        if (storedGroup && storedGroup.version !== entry.version) {
          newUpdateAvailable.add(compositeId);
        }
      }
      setUpdateAvailable(newUpdateAvailable);
    } finally {
      setCheckingSource(null);
      setLoading(false);
    }
  };

  const handleUpdateGroup = async (entry: ToolRegistryResult) => {
    const compositeId = `${entry.sourceUrl}:${entry.id}`;
    if (!confirm(`Update "${entry.name}" to version ${entry.version}?`)) return;

    setFetchingId(compositeId);
    setFetchErrors((prev) => {
      const { [compositeId]: _, ...rest } = prev;
      return rest;
    });

    try {
      const tools = await Promise.all(
        entry.tools.map(async (tool) => {
          const source = await fetchToolSource(entry.baseUrl, entry.id, tool.name);
          return { source, name: tool.name, description: tool.description, pathPattern: tool.pathPattern };
        })
      );

      // Preserve enabled indices if possible, otherwise enable all
      const existingGroup = enabledToolGroups[compositeId];
      const enabledIndices = existingGroup
        ? existingGroup.enabledToolIndices.filter((i) => i < tools.length)
        : tools.map((_, i) => i);

      const updatedGroup: StoredToolGroup = {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        domains: entry.domains,
        tools,
        sourceUrl: entry.sourceUrl,
        enabledToolIndices: enabledIndices.length > 0 ? enabledIndices : tools.map((_, i) => i)
      };

      const updatedGroups = { ...enabledToolGroups, [compositeId]: updatedGroup };
      setEnabledToolGroups(updatedGroups);
      await chrome.storage.local.set({ enabledToolGroups: updatedGroups });

      // Remove from update available set
      setUpdateAvailable((prev) => {
        const next = new Set(prev);
        next.delete(compositeId);
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update tools';
      setFetchErrors((prev) => ({ ...prev, [compositeId]: message }));
    } finally {
      setFetchingId(null);
    }
  };

  const handleAddSource = async () => {
    const url = newSourceUrl.trim();
    if (!url) return;

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return;
    }

    // Check for duplicates
    if (settings.packageSources.some((s) => s.url === url)) {
      return;
    }

    const newSource: PackageSource = { url };
    const newSettings = {
      ...settings,
      packageSources: [...settings.packageSources, newSource]
    };

    await saveSettings(newSettings);
    setNewSourceUrl('');

    // Reload registry with new source
    await loadRegistry(newSettings.packageSources, newSettings.cacheMode);
  };

  const handleRemoveSource = async (url: string) => {
    const newSettings = {
      ...settings,
      packageSources: settings.packageSources.filter((s) => s.url !== url)
    };

    await saveSettings(newSettings);

    // Reload registry without removed source
    await loadRegistry(newSettings.packageSources, newSettings.cacheMode);
  };

  const handleToggle = async (entry: ToolRegistryResult) => {
    const compositeId = `${entry.sourceUrl}:${entry.id}`;
    const storedGroup = enabledToolGroups[compositeId];
    const hasAnyEnabled = storedGroup && storedGroup.enabledToolIndices.length > 0;

    if (hasAnyEnabled) {
      // Disable all - remove from storage
      const { [compositeId]: _, ...rest } = enabledToolGroups;
      setEnabledToolGroups(rest);
      await chrome.storage.local.set({ enabledToolGroups: rest });
      return;
    }

    // Enable all - check if we need to fetch sources
    const needsFetch = !storedGroup || storedGroup.version !== entry.version;

    if (!needsFetch && storedGroup) {
      // Already have up-to-date sources, just enable all
      const updatedGroup: StoredToolGroup = {
        ...storedGroup,
        enabledToolIndices: storedGroup.tools.map((_, i) => i)
      };
      const updatedGroups = { ...enabledToolGroups, [compositeId]: updatedGroup };
      setEnabledToolGroups(updatedGroups);
      await chrome.storage.local.set({ enabledToolGroups: updatedGroups });
      return;
    }

    // Need to fetch tool sources
    setFetchingId(compositeId);
    setFetchErrors((prev) => {
      const { [compositeId]: _, ...rest } = prev;
      return rest;
    });

    try {
      const tools = await Promise.all(
        entry.tools.map(async (tool) => {
          const source = await fetchToolSource(entry.baseUrl, entry.id, tool.name);
          return { source, name: tool.name, description: tool.description, pathPattern: tool.pathPattern };
        })
      );

      const storedGroup: StoredToolGroup = {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        domains: entry.domains,
        tools,
        sourceUrl: entry.sourceUrl,
        enabledToolIndices: tools.map((_, i) => i) // Enable all by default
      };

      const updatedGroups = { ...enabledToolGroups, [compositeId]: storedGroup };
      setEnabledToolGroups(updatedGroups);
      await chrome.storage.local.set({ enabledToolGroups: updatedGroups });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch tools';
      setFetchErrors((prev) => ({ ...prev, [compositeId]: message }));
    } finally {
      setFetchingId(null);
    }
  };

  const handleToolToggle = async (entry: ToolRegistryResult, toolIndex: number) => {
    const compositeId = `${entry.sourceUrl}:${entry.id}`;
    const storedGroup = enabledToolGroups[compositeId];

    if (!storedGroup) {
      // Need to fetch sources first, then enable just this tool
      setFetchingId(compositeId);
      setFetchErrors((prev) => {
        const { [compositeId]: _, ...rest } = prev;
        return rest;
      });

      try {
        const tools = await Promise.all(
          entry.tools.map(async (tool) => {
            const source = await fetchToolSource(entry.baseUrl, entry.id, tool.name);
            return { source, name: tool.name, description: tool.description, pathPattern: tool.pathPattern };
          })
        );

        const newGroup: StoredToolGroup = {
          id: entry.id,
          name: entry.name,
          version: entry.version,
          description: entry.description,
          domains: entry.domains,
          tools,
          sourceUrl: entry.sourceUrl,
          enabledToolIndices: [toolIndex] // Only enable this tool
        };

        const updatedGroups = { ...enabledToolGroups, [compositeId]: newGroup };
        setEnabledToolGroups(updatedGroups);
        await chrome.storage.local.set({ enabledToolGroups: updatedGroups });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch tools';
        setFetchErrors((prev) => ({ ...prev, [compositeId]: message }));
      } finally {
        setFetchingId(null);
      }
      return;
    }

    // Update enabledToolIndices
    const currentIndices = storedGroup.enabledToolIndices || [];
    const isToolEnabled = currentIndices.includes(toolIndex);

    let newIndices: number[];
    if (isToolEnabled) {
      newIndices = currentIndices.filter((i) => i !== toolIndex);
    } else {
      newIndices = [...currentIndices, toolIndex].sort((a, b) => a - b);
    }

    if (newIndices.length === 0) {
      // Remove group entirely
      const { [compositeId]: _, ...rest } = enabledToolGroups;
      setEnabledToolGroups(rest);
      await chrome.storage.local.set({ enabledToolGroups: rest });
    } else {
      // Update group with new indices
      const updatedGroup: StoredToolGroup = {
        ...storedGroup,
        enabledToolIndices: newIndices
      };
      const updatedGroups = { ...enabledToolGroups, [compositeId]: updatedGroup };
      setEnabledToolGroups(updatedGroups);
      await chrome.storage.local.set({ enabledToolGroups: updatedGroups });
    }
  };

  const formatSourceUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.host + parsed.pathname.replace(/\/servers\/index\.json$/, '');
    } catch {
      return url;
    }
  };

  if (loading) {
    return (
      <div class="panel">
        <div class="panel-header">
          <h1 class="panel-title">WebMCP Settings</h1>
        </div>
        <div class="panel-content">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div class="panel">
      <div class="panel-header">
        <h1 class="panel-title">WebMCP Settings</h1>
        {settings.cacheMode === 'manual' ? (
          <button class="refresh-btn" onClick={() => handleCheckUpdates()} disabled={loading}>
            {loading ? 'Checking...' : 'Check for Updates'}
          </button>
        ) : (
          <button class="refresh-btn" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>
      <div class="panel-content">
        {/* Package Sources Section */}
        <div class="settings-section">
          <h2 class="section-title">Sources</h2>
          <div class="source-list">
            {settings.packageSources.map((source) => (
              <div key={source.url} class="source-item">
                <span class="source-url">{formatSourceUrl(source.url)}</span>
                <div class="source-actions">
                  {settings.cacheMode === 'manual' && (
                    <button
                      class="check-btn"
                      onClick={() => handleCheckUpdates(source.url)}
                      disabled={checkingSource === source.url}
                    >
                      {checkingSource === source.url ? 'Checking...' : 'Check'}
                    </button>
                  )}
                  <button
                    class="remove-btn"
                    onClick={() => handleRemoveSource(source.url)}
                    title="Remove source"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div class="add-source">
            <input
              type="text"
              class="source-input"
              placeholder="https://example.com/servers/index.json"
              value={newSourceUrl}
              onInput={(e) => setNewSourceUrl((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSource()}
            />
            <button class="add-btn" onClick={handleAddSource}>
              Add
            </button>
          </div>
        </div>

        {/* Cache Mode Section */}
        <div class="settings-section">
          <h2 class="section-title">Tool Updates</h2>
          <p class="section-desc">Controls how tool manifests are cached when loading from package sources.</p>
          <div class="cache-options">
            <label class="cache-option">
              <input
                type="radio"
                name="cacheMode"
                checked={settings.cacheMode === 'none'}
                onChange={() => handleCacheModeChange('none')}
              />
              <span class="cache-desc">Check for new tool versions on every page navigation (recommended)</span>
            </label>
            <label class="cache-option">
              <input
                type="radio"
                name="cacheMode"
                checked={settings.cacheMode === 'session'}
                onChange={() => handleCacheModeChange('session')}
              />
              <span class="cache-desc">Check for new versions on browser restart</span>
            </label>
            <label class="cache-option">
              <input
                type="radio"
                name="cacheMode"
                checked={isPersistent}
                onChange={() => handleCacheModeChange('persistent')}
              />
              <span class="cache-desc">
                Check for new versions every{' '}
                <input
                  type="number"
                  class="ttl-input"
                  value={cacheTTL}
                  min={1}
                  onClick={(e) => e.stopPropagation()}
                  onInput={(e) => handleTTLChange(parseInt((e.target as HTMLInputElement).value) || 1)}
                />{' '}
                minutes
              </span>
            </label>
            <label class="cache-option">
              <input
                type="radio"
                name="cacheMode"
                checked={settings.cacheMode === 'manual'}
                onChange={() => handleCacheModeChange('manual')}
              />
              <span class="cache-desc">Manually refresh and update tools</span>
            </label>
          </div>
        </div>

        {/* Tool Groups Section */}
        <div class="settings-section">
          <h2 class="section-title">Available Tools</h2>
          <input
            type="text"
            class="tools-search"
            placeholder="Search tools or paste URL..."
            value={searchQuery}
            onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
          />
          {filteredRegistry.length === 0 ? (
            searchQuery ? (
              <p class="no-tools">No tools match your search.</p>
            ) : (
              <p class="no-tools">No tools available from configured sources.</p>
            )
          ) : (
            filteredRegistry.map((entry) => {
              const compositeId = `${entry.sourceUrl}:${entry.id}`;
              const storedGroup = enabledToolGroups[compositeId];
              const enabledIndices = storedGroup?.enabledToolIndices || [];
              const someEnabled = enabledIndices.length > 0;
              const allEnabled = enabledIndices.length === entry.tools.length;
              const isPartial = someEnabled && !allEnabled;
              const isFetching = fetchingId === compositeId;
              const error = fetchErrors[compositeId];
              const toolCount = entry.tools.length;
              const isExpanded = expandedGroups.has(compositeId);

              return (
                <div key={compositeId} class="registry-entry">
                  <div class="registry-row">
                    <div
                      class="registry-header"
                      onClick={() => toggleExpand(compositeId)}
                    >
                      <span class={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                      <div class="registry-info">
                        <span class="registry-name">{entry.name}</span>
                        <span class="registry-tool-count">
                          {toolCount} tool{toolCount !== 1 ? 's' : ''}
                        </span>
                        <span class="registry-source">{formatSourceUrl(entry.baseUrl)}</span>
                        <div class="registry-domains">
                          {entry.domains.map((domain) => (
                            <span key={domain} class="domain-pill">{domain}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div class="registry-actions">
                      {updateAvailable.has(compositeId) && (
                        <button
                          class="update-badge"
                          onClick={() => handleUpdateGroup(entry)}
                          disabled={isFetching}
                        >
                          Update available
                        </button>
                      )}
                      {isFetching ? (
                        <span class="fetching">Loading...</span>
                      ) : (
                        <label class={`toggle-switch ${isPartial ? 'partial' : ''}`}>
                          <input
                            type="checkbox"
                            checked={someEnabled}
                            onChange={() => handleToggle(entry)}
                            disabled={isFetching}
                          />
                          <span class="toggle-slider"></span>
                        </label>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div class="tools-list">
                      {entry.tools.map((tool, index) => {
                        const isToolEnabled = enabledIndices.includes(index);
                        return (
                          <div key={index} class="tool-item">
                            <input
                              type="checkbox"
                              class="tool-checkbox"
                              checked={isToolEnabled}
                              onChange={() => handleToolToggle(entry, index)}
                              disabled={isFetching}
                            />
                            <div class="tool-content">
                              <span class="tool-name">{tool.name}</span>
                              {tool.pathPattern && (
                                <span class="tool-path-pattern">{tool.pathPattern}</span>
                              )}
                              {tool.description && (() => {
                                const descKey = `${compositeId}:${index}`;
                                const isExpanded = expandedDescriptions.has(descKey);
                                const isOverflowing = overflowingDescriptions.has(descKey);
                                return (
                                  <div class="tool-description-wrapper">
                                    <span
                                      class={`tool-description ${isExpanded ? 'expanded' : ''}`}
                                      ref={(el) => {
                                        if (el) descriptionRefs.current.set(descKey, el);
                                      }}
                                    >
                                      {tool.description}
                                    </span>
                                    {(isOverflowing || isExpanded) && (
                                      <button
                                        class="toggle-desc-btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleDescription(descKey);
                                        }}
                                      >
                                        {isExpanded ? 'show less' : 'show more'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {error && <div class="fetch-error">{error}</div>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById('root');

if (root) {
  render(<Panel />, root);
}
