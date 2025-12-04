import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type {
  EnabledTools,
  StoredTool,
  CacheMode,
  PackageSource,
  WebMCPSettings,
  GroupedToolRegistryResult,
  ToolGroupResult,
  ToolRegistryResult
} from './shared.js';
import { DEFAULT_SETTINGS } from './shared.js';
import { searchToolsGrouped, fetchToolSource, validateSource } from './tool-registry.js';

type GroupToggleState = 'all' | 'none' | 'partial';

function Panel() {
  const [enabledTools, setEnabledTools] = useState<EnabledTools>({});
  const [groupedRegistry, setGroupedRegistry] = useState<GroupedToolRegistryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<WebMCPSettings>(DEFAULT_SETTINGS);
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [fetchErrors, setFetchErrors] = useState<{ [id: string]: string }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [overflowingDescriptions, setOverflowingDescriptions] = useState<Set<string>>(new Set());
  const descriptionRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  // Source management state
  const [sourceErrors, setSourceErrors] = useState<{ [url: string]: string }>({});
  const [refreshingSource, setRefreshingSource] = useState<string | null>(null);
  const [addingSource, setAddingSource] = useState(false);
  const [addSourceError, setAddSourceError] = useState<string | null>(null);

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
  }, [groupedRegistry]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const getGroupToggleState = (group: ToolGroupResult, sourceUrl: string): GroupToggleState => {
    const enabledCount = group.tools.filter((tool) => {
      const compositeId = `${sourceUrl}:${tool.name}`;
      return !!enabledTools[compositeId];
    }).length;

    if (enabledCount === 0) return 'none';
    if (enabledCount === group.tools.length) return 'all';
    return 'partial';
  };

  const isUrl = (str: string) => str.includes('://') || str.startsWith('www.');

  const matchesTool = (tool: ToolRegistryResult, query: string): boolean => {
    const q = query.toLowerCase().trim();

    if (isUrl(q)) {
      try {
        const url = new URL(q.startsWith('www.') ? `https://${q}` : q);
        return tool.domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`));
      } catch {
        return true;
      }
    }

    const searchable = [
      tool.name,
      tool.description,
      ...tool.domains,
      tool.baseUrl
    ].join(' ').toLowerCase();
    return searchable.includes(q);
  };

  const filterGroupedRegistry = (
    sources: GroupedToolRegistryResult[],
    query: string
  ): GroupedToolRegistryResult[] => {
    if (!query.trim()) return sources;

    return sources
      .map((source) => ({
        ...source,
        groups: source.groups
          .map((group) => ({
            ...group,
            tools: group.tools.filter((tool) => matchesTool(tool, query))
          }))
          .filter((group) => group.tools.length > 0)
      }))
      .filter((source) => source.groups.length > 0);
  };

  const filteredRegistry = filterGroupedRegistry(groupedRegistry, searchQuery);

  const loadRegistry = async (sources: PackageSource[], cacheMode: CacheMode) => {
    setLoading(true);
    const results = await searchToolsGrouped(sources, cacheMode);

    // Extract errors from results
    const errors: { [url: string]: string } = {};
    for (const r of results) {
      if (r.error) {
        errors[r.sourceUrl] = r.error;
      }
    }
    setSourceErrors(errors);

    // Store all results (including errored ones with empty groups)
    setGroupedRegistry(results.filter((r) => !r.error));
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      // Load settings first
      const result = await chrome.storage.local.get<{
        enabledTools: EnabledTools;
        webmcpSettings: WebMCPSettings;
      }>(['enabledTools', 'webmcpSettings']);

      const storedSettings = result.webmcpSettings || DEFAULT_SETTINGS;
      const storedTools: EnabledTools = result.enabledTools || {};

      setSettings(storedSettings);
      setEnabledTools(storedTools);

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

  const handleRefreshSource = async (url: string) => {
    setRefreshingSource(url);

    // Clear any existing error for this source
    setSourceErrors((prev) => {
      const { [url]: _, ...rest } = prev;
      return rest;
    });

    const result = await validateSource(url);

    if (!result.valid) {
      setSourceErrors((prev) => ({ ...prev, [url]: result.error! }));
      // Remove from registry if it was previously successful
      setGroupedRegistry((prev) => prev.filter((r) => r.sourceUrl !== url));
    } else {
      // Reload just this source's tools
      const results = await searchToolsGrouped([{ url }], 'none');
      const sourceResult = results[0];
      if (sourceResult && !sourceResult.error) {
        setGroupedRegistry((prev) => {
          const filtered = prev.filter((r) => r.sourceUrl !== url);
          return [...filtered, sourceResult];
        });
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

    const newSource: PackageSource = { url };
    const newSettings = {
      ...settings,
      packageSources: [...settings.packageSources, newSource]
    };

    await saveSettings(newSettings);
    setNewSourceUrl('');
    setAddingSource(false);

    // Reload registry with new source
    await loadRegistry(newSettings.packageSources, newSettings.cacheMode);
  };

  const handleRemoveSource = async (url: string) => {
    // Clear any error for this source
    setSourceErrors((prev) => {
      const { [url]: _, ...rest } = prev;
      return rest;
    });

    // Remove from registry immediately (no loading state)
    setGroupedRegistry((prev) => prev.filter((r) => r.sourceUrl !== url));

    const newSettings = {
      ...settings,
      packageSources: settings.packageSources.filter((s) => s.url !== url)
    };

    await saveSettings(newSettings);
  };

  const handleToolToggle = async (entry: ToolRegistryResult) => {
    const compositeId = `${entry.sourceUrl}:${entry.name}`;
    const storedTool = enabledTools[compositeId];

    if (storedTool) {
      // Disable - remove from storage
      const { [compositeId]: _, ...rest } = enabledTools;
      setEnabledTools(rest);
      await chrome.storage.local.set({ enabledTools: rest });
      return;
    }

    // Enable - fetch tool source
    setFetchingIds((prev) => new Set(prev).add(compositeId));
    setFetchErrors((prev) => {
      const { [compositeId]: _, ...rest } = prev;
      return rest;
    });

    try {
      const source = await fetchToolSource(entry.baseUrl, entry.name);

      const storedTool: StoredTool = {
        name: entry.name,
        description: entry.description,
        domains: entry.domains,
        pathPattern: entry.pathPattern,
        source,
        sourceUrl: entry.sourceUrl
      };

      const updatedTools = { ...enabledTools, [compositeId]: storedTool };
      setEnabledTools(updatedTools);
      await chrome.storage.local.set({ enabledTools: updatedTools });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch tool';
      setFetchErrors((prev) => ({ ...prev, [compositeId]: message }));
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(compositeId);
        return next;
      });
    }
  };

  const handleGroupToggle = async (group: ToolGroupResult, sourceUrl: string, baseUrl: string) => {
    const currentState = getGroupToggleState(group, sourceUrl);
    const shouldEnable = currentState !== 'all';

    if (shouldEnable) {
      // Enable all tools that aren't already enabled
      const toolsToEnable = group.tools.filter((tool) => {
        const compositeId = `${sourceUrl}:${tool.name}`;
        return !enabledTools[compositeId];
      });

      // Mark all as fetching
      const ids = toolsToEnable.map((t) => `${sourceUrl}:${t.name}`);
      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });

      // Fetch all in parallel
      const results = await Promise.allSettled(
        toolsToEnable.map(async (tool) => {
          const compositeId = `${sourceUrl}:${tool.name}`;
          const source = await fetchToolSource(baseUrl, tool.name);
          return {
            compositeId,
            storedTool: {
              name: tool.name,
              description: tool.description,
              domains: tool.domains,
              pathPattern: tool.pathPattern,
              source,
              sourceUrl
            } as StoredTool
          };
        })
      );

      // Process results
      const updatedTools = { ...enabledTools };
      const newErrors: { [id: string]: string } = {};

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const compositeId = `${sourceUrl}:${toolsToEnable[i].name}`;
        if (result.status === 'fulfilled') {
          updatedTools[result.value.compositeId] = result.value.storedTool;
        } else {
          newErrors[compositeId] = result.reason?.message || 'Failed to fetch tool';
        }
      }

      setEnabledTools(updatedTools);
      await chrome.storage.local.set({ enabledTools: updatedTools });
      setFetchErrors((prev) => ({ ...prev, ...newErrors }));
      setFetchingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Disable all tools in group
      const updatedTools = { ...enabledTools };
      for (const tool of group.tools) {
        const compositeId = `${sourceUrl}:${tool.name}`;
        delete updatedTools[compositeId];
      }
      setEnabledTools(updatedTools);
      await chrome.storage.local.set({ enabledTools: updatedTools });
    }
  };

  const formatSourceUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.host + parsed.pathname.replace(/\/$/, '');
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
        <button class="refresh-btn" onClick={handleRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <div class="panel-content">
        {/* Package Sources Section */}
        <div class="settings-section">
          <h2 class="section-title">Sources</h2>
          <div class="source-list">
            {settings.packageSources.map((source) => {
              const hasError = !!sourceErrors[source.url];
              const isRefreshing = refreshingSource === source.url;

              return (
                <div key={source.url} class={`source-item ${hasError ? 'error' : ''}`}>
                  <div class="source-info">
                    {hasError && <span class="source-error-icon" title={sourceErrors[source.url]}>!</span>}
                    <span class="source-url">{formatSourceUrl(source.url)}</span>
                  </div>
                  <div class="source-actions">
                    <button
                      class={`source-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                      onClick={() => handleRefreshSource(source.url)}
                      disabled={isRefreshing}
                      title="Refresh source"
                    >
                      ↻
                    </button>
                    <button
                      class="remove-btn"
                      onClick={() => handleRemoveSource(source.url)}
                      title="Remove source"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div class="add-source">
            <input
              type="text"
              class="source-input"
              placeholder="https://example.com/"
              value={newSourceUrl}
              onInput={(e) => {
                setNewSourceUrl((e.target as HTMLInputElement).value);
                setAddSourceError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && !addingSource && handleAddSource()}
            />
            <button class="add-btn" onClick={handleAddSource} disabled={addingSource}>
              {addingSource ? '...' : 'Add'}
            </button>
          </div>
          {addSourceError && <div class="add-source-error">{addSourceError}</div>}
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

        {/* Tools Section */}
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
            filteredRegistry.map((source) =>
              source.groups.map((group) => {
                const groupId = `${source.sourceUrl}:${group.name}`;
                const isExpanded = expandedGroups.has(groupId);
                const toggleState = getGroupToggleState(group, source.sourceUrl);
                const isGroupFetching = group.tools.some((t) =>
                  fetchingIds.has(`${source.sourceUrl}:${t.name}`)
                );

                return (
                  <div key={groupId} class="tool-group">
                    <div class="group-header" onClick={() => toggleGroup(groupId)}>
                      <span class={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
                      <div class="group-info">
                        <div class="group-title-row">
                          <span class="group-name">{group.name}</span>
                          <span class="group-tool-count">{group.tools.length} tools</span>
                        </div>
                        {group.description && (
                          <span class="group-description">{group.description}</span>
                        )}
                      </div>
                      <div class="group-actions" onClick={(e) => e.stopPropagation()}>
                        {isGroupFetching ? (
                          <span class="fetching">Loading...</span>
                        ) : (
                          <label class={`toggle-switch ${toggleState === 'partial' ? 'partial' : ''}`}>
                            <input
                              type="checkbox"
                              checked={toggleState !== 'none'}
                              onChange={() => handleGroupToggle(group, source.sourceUrl, source.baseUrl)}
                            />
                            <span class="toggle-slider"></span>
                          </label>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div class="tools-list">
                        {group.tools.map((entry) => {
                          const compositeId = `${entry.sourceUrl}:${entry.name}`;
                          const isEnabled = !!enabledTools[compositeId];
                          const isFetching = fetchingIds.has(compositeId);
                          const error = fetchErrors[compositeId];
                          const descKey = compositeId;
                          const isDescExpanded = expandedDescriptions.has(descKey);
                          const isOverflowing = overflowingDescriptions.has(descKey);

                          return (
                            <div key={compositeId} class="registry-entry">
                              <div class="registry-row">
                                <div class="registry-info">
                                  <span class="registry-name">{entry.name}</span>
                                  {entry.pathPattern && (
                                    <span class="tool-path-pattern">{entry.pathPattern}</span>
                                  )}
                                  <div class="registry-domains">
                                    {entry.domains.map((domain) => (
                                      <span key={domain} class="domain-pill">{domain}</span>
                                    ))}
                                  </div>
                                </div>
                                <div class="registry-actions">
                                  {isFetching ? (
                                    <span class="fetching">Loading...</span>
                                  ) : (
                                    <label class="toggle-switch">
                                      <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        onChange={() => handleToolToggle(entry)}
                                        disabled={isFetching}
                                      />
                                      <span class="toggle-slider"></span>
                                    </label>
                                  )}
                                </div>
                              </div>
                              {entry.description && (
                                <div class="tool-description-wrapper">
                                  <span
                                    class={`tool-description ${isDescExpanded ? 'expanded' : ''}`}
                                    ref={(el) => {
                                      if (el) descriptionRefs.current.set(descKey, el);
                                    }}
                                  >
                                    {entry.description}
                                  </span>
                                  {(isOverflowing || isDescExpanded) && (
                                    <button
                                      class="toggle-desc-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleDescription(descKey);
                                      }}
                                    >
                                      {isDescExpanded ? 'show less' : 'show more'}
                                    </button>
                                  )}
                                </div>
                              )}
                              {error && <div class="fetch-error">{error}</div>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )
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
