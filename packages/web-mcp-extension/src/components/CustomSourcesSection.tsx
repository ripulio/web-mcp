import {useState} from 'preact/hooks';
import type {PackageSource} from '../shared.js';
import {settings, saveSettings, derivedSources} from '../stores/settingsStore.js';
import {
  startHotReload,
  stopHotReload,
  hotReloadingSources
} from '../stores/registryStore.js';

export function CustomSourcesSection() {
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceName, setNewSourceName] = useState('');

  const customSources = settings.value.customSources;

  const handleAddSource = () => {
    if (!newSourceUrl.trim()) return;

    const newSource: PackageSource = {
      url: newSourceUrl.trim(),
      name: newSourceName.trim() || undefined
    };

    saveSettings({
      ...settings.value,
      customSources: [...customSources, newSource]
    });
    setNewSourceUrl('');
    setNewSourceName('');
  };

  const handleRemoveSource = (index: number) => {
    const sourceToRemove = customSources[index];
    // Stop hot reload if active
    if (hotReloadingSources.value.has(sourceToRemove.url)) {
      stopHotReload(sourceToRemove.url);
    }
    const updatedSources = customSources.filter((_, i) => i !== index);
    saveSettings({
      ...settings.value,
      customSources: updatedSources
    });
  };

  const handleToggleHotReload = (source: PackageSource, index: number) => {
    const isActive = hotReloadingSources.value.has(source.url);

    if (isActive) {
      stopHotReload(source.url);
    } else {
      startHotReload(source, derivedSources.value);
    }

    // Update source setting to persist hot reload preference
    const updatedSources = [...customSources];
    updatedSources[index] = {...source, hotReload: !isActive};
    saveSettings({
      ...settings.value,
      customSources: updatedSources
    });
  };

  const handleToggleAutoEnable = (source: PackageSource, index: number) => {
    const updatedSources = [...customSources];
    updatedSources[index] = {...source, autoEnable: !source.autoEnable};
    saveSettings({
      ...settings.value,
      customSources: updatedSources
    });
  };

  return (
    <div class="settings-section">
      <h2 class="section-title">Custom Tool Sources</h2>
      <p class="section-desc">
        Add custom sources for WebMCP tools. All sources must implement the
        WebMCP API.
      </p>

      {/* Add new source form */}
      <div class="custom-source-form">
        <div class="form-row">
          <input
            type="text"
            placeholder="Source URL (e.g., http://localhost:8766)"
            value={newSourceUrl}
            onInput={(e) =>
              setNewSourceUrl((e.currentTarget as HTMLInputElement).value)
            }
            class="source-input"
          />
          <input
            type="text"
            placeholder="Name (optional)"
            value={newSourceName}
            onInput={(e) =>
              setNewSourceName((e.currentTarget as HTMLInputElement).value)
            }
            class="source-input"
          />
          <button
            onClick={handleAddSource}
            disabled={!newSourceUrl.trim()}
            class="add-source-button"
          >
            Add Source
          </button>
        </div>
      </div>

      {/* List of custom sources */}
      {customSources.length > 0 && (
        <div class="custom-sources-list">
          {customSources.map((source, index) => {
            const isHotReloading = hotReloadingSources.value.has(source.url);
            return (
              <div key={index} class="custom-source-item">
                <div class="source-info">
                  <span class="source-name">{source.name || source.url}</span>
                  {source.name && (
                    <span class="source-url-secondary">{source.url}</span>
                  )}
                </div>
                <div class="source-actions">
                  <button
                    onClick={() => handleToggleHotReload(source, index)}
                    class={`hot-reload-btn ${isHotReloading ? 'active' : ''}`}
                    title={
                      isHotReloading
                        ? 'Hot reload active (polling every 3s)'
                        : 'Enable hot reload'
                    }
                  >
                    ↻
                  </button>
                  <button
                    onClick={() => handleToggleAutoEnable(source, index)}
                    class={`auto-enable-btn ${source.autoEnable ? 'active' : ''}`}
                    title="Auto-enable new tools/groups from this source"
                  >
                    auto-enable
                  </button>
                  <button
                    onClick={() => handleRemoveSource(index)}
                    class="remove-source-button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {customSources.length === 0 && (
        <p class="no-sources-message">
          No custom sources added. Add a source above to get started.
        </p>
      )}
    </div>
  );
}
