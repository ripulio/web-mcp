import {render} from 'preact';
import {useEffect} from 'preact/hooks';

import {
  useSettings,
  useToolRegistry,
  useEnabledTools,
  useBrowsedTools,
  useSources,
  useToolSearch,
  useExpandableUI,
  useBrowserControlStatus
} from './hooks/index.js';

import {
  SourceList,
  AddSourceForm,
  ToolsSection,
  BrowserControlSection
} from './components/index.js';

function Panel() {
  // Initialize hooks
  const settingsHook = useSettings();
  const registryHook = useToolRegistry();
  const enabledToolsHook = useEnabledTools();

  const browsedToolsHook = useBrowsedTools({
    onRefresh: async () => {
      await registryHook.loadRegistry(settingsHook.settings.packageSources);
    }
  });

  const sourcesHook = useSources({
    settings: settingsHook.settings,
    saveSettings: settingsHook.saveSettings,
    loadRegistry: registryHook.loadRegistry,
    clearSourceError: registryHook.clearSourceError,
    setSourceError: registryHook.setSourceError,
    removeFromRegistries: registryHook.removeFromRegistries,
    updateSourceInRegistry: registryHook.updateSourceInRegistry,
    moveToActive: registryHook.moveToActive,
    moveToInactive: registryHook.moveToInactive,
    inactiveRegistry: registryHook.inactiveRegistry,
    activeRegistry: registryHook.activeRegistry,
    browsedTools: browsedToolsHook.browsedTools,
    onRefreshBrowsedTools: browsedToolsHook.handleRefreshBrowsedTools
  });

  const searchHook = useToolSearch();
  const expandableHook = useExpandableUI(registryHook.activeRegistry);
  const browserControlStatus = useBrowserControlStatus();

  // Initial load - coordinate settings and registry
  useEffect(() => {
    if (!settingsHook.loading) {
      registryHook.loadRegistry(settingsHook.settings.packageSources);
    }
  }, [settingsHook.loading]);

  // Filter registry based on search
  const filteredRegistry = searchHook.filterRegistry(registryHook.activeRegistry);

  // Loading state
  if (settingsHook.loading) {
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
      </div>
      <div class="panel-content">
        {/* Package Sources Section */}
        <div class="settings-section">
          <h2 class="section-title">Sources</h2>
          <SourceList
            sources={settingsHook.settings.packageSources}
            sourceErrors={registryHook.sourceErrors}
            refreshingSource={sourcesHook.refreshingSource}
            isBrowsing={browsedToolsHook.isBrowsing}
            browsedTools={browsedToolsHook.browsedTools}
            browsingError={browsedToolsHook.browsingError}
            activeRegistry={registryHook.activeRegistry}
            inactiveRegistry={registryHook.inactiveRegistry}
            onSourceToggle={sourcesHook.handleSourceToggle}
            onRefreshSource={sourcesHook.handleRefreshSource}
            onRemoveSource={sourcesHook.handleRemoveSource}
            onBrowseDirectory={browsedToolsHook.handleBrowseDirectory}
            onRefreshBrowsedTools={browsedToolsHook.handleRefreshBrowsedTools}
            onClearBrowsedTools={browsedToolsHook.handleClearBrowsedTools}
            pollingEnabled={browsedToolsHook.pollingEnabled}
            pollingError={browsedToolsHook.pollingError}
            onPollingToggle={browsedToolsHook.handlePollingToggle}
          />
          <AddSourceForm
            newSourceUrl={sourcesHook.newSourceUrl}
            onNewSourceUrlChange={sourcesHook.setNewSourceUrl}
            addingSource={sourcesHook.addingSource}
            addSourceError={sourcesHook.addSourceError}
            onAddSource={sourcesHook.handleAddSource}
            onClearError={sourcesHook.clearAddSourceError}
          />
        </div>

        {/* Browser Control MCP Server Section */}
        <BrowserControlSection
          enabled={settingsHook.browserControlEnabled}
          connectedPorts={browserControlStatus.status.connectedPorts}
          onToggle={settingsHook.handleBrowserControlToggle}
        />

        {/* Tools Section */}
        <ToolsSection
          filteredRegistry={filteredRegistry}
          searchQuery={searchHook.searchQuery}
          onSearchChange={searchHook.setSearchQuery}
          enabledTools={enabledToolsHook.enabledTools}
          fetchingIds={enabledToolsHook.fetchingIds}
          fetchErrors={enabledToolsHook.fetchErrors}
          expandedGroups={expandableHook.expandedGroups}
          expandedDescriptions={expandableHook.expandedDescriptions}
          overflowingDescriptions={expandableHook.overflowingDescriptions}
          descriptionRefs={expandableHook.descriptionRefs}
          getGroupToggleState={enabledToolsHook.getGroupToggleState}
          onToggleGroup={expandableHook.toggleGroup}
          onGroupToggle={enabledToolsHook.handleGroupToggle}
          onToolToggle={enabledToolsHook.handleToolToggle}
          onToggleDescription={expandableHook.toggleDescription}
        />
      </div>
    </div>
  );
}

const root = document.getElementById('root');

if (root) {
  render(<Panel />, root);
}
