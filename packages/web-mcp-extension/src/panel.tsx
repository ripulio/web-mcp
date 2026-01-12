import {render} from 'preact';
import {useEffect} from 'preact/hooks';

import {
  useSettings,
} from './hooks/useSettings.js';
import {
  useToolRegistry,
} from './hooks/useToolRegistry.js';
import {
  useEnabledTools,
} from './hooks/useEnabledTools.js';
import {
  useToolSearch,
} from './hooks/useToolSearch.js';
import {
  useExpandableUI,
} from './hooks/useExpandableUI.js';
import {
  useBrowserControlStatus
} from './hooks/useBrowserControlStatus.js';

import {
  ToolsSection,
} from './components/ToolsSection.js';
import {
  BrowserControlSection
} from './components/BrowserControlSection.js';

function Panel() {
  // Initialize hooks
  const settingsHook = useSettings();
  const registryHook = useToolRegistry();
  const enabledToolsHook = useEnabledTools();
  const searchHook = useToolSearch();
  const expandableHook = useExpandableUI(registryHook.activeRegistry);
  const browserControlStatus = useBrowserControlStatus();

  // Initial load - use derived sources
  useEffect(() => {
    if (!settingsHook.loading) {
      registryHook.loadRegistry(settingsHook.derivedSources);
    }
  }, [settingsHook.loading]);

  // Reload when localToolsEnabled changes
  useEffect(() => {
    if (!settingsHook.loading) {
      registryHook.loadRegistry(settingsHook.derivedSources);
    }
  }, [settingsHook.localToolsEnabled]);

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
        {/* Browser Control MCP Server Section */}
        <BrowserControlSection
          enabled={settingsHook.browserControlEnabled}
          connectedPorts={browserControlStatus.status.connectedPorts}
          onToggle={settingsHook.handleBrowserControlToggle}
          localToolsEnabled={settingsHook.localToolsEnabled}
          onLocalToolsToggle={settingsHook.handleLocalToolsToggle}
          localToolsError={registryHook.sourceErrors['http://localhost:3000']}
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
