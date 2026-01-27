import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  settings,
  settingsLoading,
  derivedSources,
  loadSettings
} from './stores/settingsStore.js';
import {loadRegistry} from './stores/registryStore.js';
import {loadEnabledTools} from './stores/enabledToolsStore.js';
import {loadInstalledGroups} from './stores/installedToolsStore.js';
import {initBrowserControlPolling} from './stores/browserControlStore.js';
import {InstalledSection} from './components/InstalledSection.js';
import {SearchSection} from './components/SearchSection.js';
import {BrowserControlSection} from './components/BrowserControlSection.js';
import {CustomSourcesSection} from './components/CustomSourcesSection.js';

function Panel() {
  // Initialize stores on mount
  useEffect(() => {
    loadSettings();
    loadEnabledTools();
    loadInstalledGroups();

    const cleanupPolling = initBrowserControlPolling();

    return () => {
      cleanupPolling();
    };
  }, []);

  // Reload registry when settings change
  useEffect(() => {
    if (!settingsLoading.value) {
      loadRegistry(derivedSources.value);
    }
  }, [settingsLoading.value, settings.value.customSources]);

  const [activeTab, setActiveTab] = useState<'installed' | 'search' | 'advanced'>('installed');

  // Loading state
  if (settingsLoading.value) {
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
      <div class="panel-tabs">
        <button
          class={`tab ${activeTab === 'installed' ? 'active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          Installed
        </button>
        <button
          class={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
        <button
          class={`tab ${activeTab === 'advanced' ? 'active' : ''}`}
          onClick={() => setActiveTab('advanced')}
        >
          Advanced
        </button>
      </div>
      <div class="panel-content">
        {activeTab === 'installed' && <InstalledSection />}
        {activeTab === 'search' && <SearchSection />}
        {activeTab === 'advanced' && (
          <>
            <BrowserControlSection />
            <CustomSourcesSection />
          </>
        )}
      </div>
    </div>
  );
}

const root = document.getElementById('root');

if (root) {
  render(<Panel />, root);
}
