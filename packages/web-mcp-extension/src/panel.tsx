import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import {registry, type ToolRegistryEntry} from '@ripul/web-mcp-tools';
import type {ToolGroupState} from './shared.js';

function Panel() {
  const [toolGroupStates, setToolGroupStates] = useState<ToolGroupState>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.sync.get<{enabledToolGroups: ToolGroupState}>(['enabledToolGroups'], (result) => {
      const enabledToolGroups: ToolGroupState = result.enabledToolGroups || {};

      const initialState: ToolGroupState = {};
      for (const entry of registry) {
        initialState[entry.id] = enabledToolGroups[entry.id] ?? true;
      }

      setToolGroupStates(initialState);
      setLoading(false);
    });
  }, []);

  const handleToggle = (entryId: string) => {
    const newState: ToolGroupState = {
      ...toolGroupStates,
      [entryId]: !toolGroupStates[entryId]
    };

    setToolGroupStates(newState);
    chrome.storage.sync.set({enabledToolGroups: newState});
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
      </div>
      <div class="panel-content">
        <p>Enable or disable tool sets:</p>

        {registry.map((entry: ToolRegistryEntry, index: number) => {
          const isEnabled = toolGroupStates[entry.id] ?? true;
          const toolCount = entry.tools.length;

          return (
            <div key={index} class="registry-entry">
              <div class="registry-row">
                <div class="registry-info">
                  <span class="registry-name">{entry.name}</span>
                  <span class="registry-tool-count">
                    {toolCount} tool{toolCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => handleToggle(entry.id)}
                  />
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const root = document.getElementById('root');

if (root) {
  render(<Panel />, root);
}
