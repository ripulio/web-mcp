import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import type {EnabledToolGroups, StoredToolGroup} from './shared.js';
import {searchTools, type ToolRegistryResult} from './tool-registry.js';

function Panel() {
  const [enabledToolGroups, setEnabledToolGroups] = useState<EnabledToolGroups>({});
  const [registry, setRegistry] = useState<ToolRegistryResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const tools = await searchTools();
      setRegistry(tools);

      chrome.storage.local.get<{enabledToolGroups: EnabledToolGroups}>(['enabledToolGroups'], (result) => {
        const storedGroups: EnabledToolGroups = result.enabledToolGroups || {};
        setEnabledToolGroups(storedGroups);
        setLoading(false);
      });
    })();
  }, []);

  const handleToggle = (entryId: string) => {
    const isCurrentlyEnabled = enabledToolGroups[entryId] !== undefined;
    let updatedGroups: EnabledToolGroups;

    if (!isCurrentlyEnabled) {
      const toolGroup = registry.find(entry => entry.id === entryId);

      if (!toolGroup) {
        return;
      }

      const storedGroup: StoredToolGroup = {
        id: toolGroup.id,
        name: toolGroup.name,
        description: toolGroup.description,
        domains: toolGroup.domains,
        tools: toolGroup.tools.map(tool => ({
          source: tool.source,
          pathPattern: tool.pathPattern
        }))
      };
      updatedGroups = {
        ...enabledToolGroups,
        [entryId]: storedGroup
      };
    } else {
      const {[entryId]: _, ...rest} = enabledToolGroups;
      updatedGroups = rest;
    }

    setEnabledToolGroups(updatedGroups);
    chrome.storage.local.set({enabledToolGroups: updatedGroups});
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

        {registry.map((entry: ToolRegistryResult, index: number) => {
          const isEnabled = enabledToolGroups[entry.id] !== undefined;
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
