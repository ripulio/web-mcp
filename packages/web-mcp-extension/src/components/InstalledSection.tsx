import {useState} from 'preact/hooks';
import {installedGroups, uninstallGroup} from '../stores/installedToolsStore.js';
import {
  enabledTools,
  fetchingGroupIds,
  fetchErrors,
  isGroupEnabled,
  toggleGroup
} from '../stores/enabledToolsStore.js';
import type {InstalledGroup} from '../shared.js';

function InstalledGroupCard({group}: {group: InstalledGroup}) {
  const groupId = `${group.sourceUrl}:${group.name}`;
  const enabled = isGroupEnabled(group);
  const isFetching = fetchingGroupIds.value.has(groupId);
  const error = fetchErrors.value[groupId];
  const [expanded, setExpanded] = useState(false);

  // Count enabled tools
  const enabledCount = group.tools.filter((tool) => {
    const compositeId = `${group.sourceUrl}:${tool.name}`;
    return !!enabledTools.value[compositeId];
  }).length;

  return (
    <div class="tool-group">
      <div class="group-header" onClick={() => setExpanded(!expanded)}>
        <span class={`expand-icon ${expanded ? 'expanded' : ''}`}>▶</span>
        <div class="group-info">
          <div class="group-title-row">
            <span class="group-name">{group.name}</span>
            <span class="group-tool-count">
              {enabledCount}/{group.tools.length} enabled
            </span>
          </div>
          {group.description && (
            <span class="group-description">{group.description}</span>
          )}
        </div>
        <div class="group-actions" onClick={(e) => e.stopPropagation()}>
          {isFetching ? (
            <span class="fetching">Loading...</span>
          ) : (
            <>
              <label class="toggle-switch">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => toggleGroup(group)}
                />
                <span class="toggle-slider"></span>
              </label>
              <button
                class="uninstall-btn"
                onClick={() => uninstallGroup(groupId)}
                title="Uninstall"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
      {error && <div class="fetch-error">{error}</div>}
      {expanded && (
        <div class="tools-list">
          {group.tools.map((tool) => (
            <div key={tool.name} class="registry-entry">
              <div class="registry-row">
                <div class="registry-info">
                  <span class="registry-name">{tool.name}</span>
                  <div class="tool-filters">
                    <div class="filter-row">
                      <span class="filter-label">Domains</span>
                      {tool.domains.includes('*') ? (
                        <span class="filter-pill">All domains</span>
                      ) : (
                        tool.domains.map((domain) => (
                          <span key={domain} class="filter-pill">
                            {domain}
                          </span>
                        ))
                      )}
                    </div>
                    <div class="filter-row">
                      <span class="filter-label">Paths</span>
                      {tool.pathPatterns.length === 0 ||
                      tool.pathPatterns.includes('.*') ? (
                        <span class="filter-pill">All paths</span>
                      ) : (
                        tool.pathPatterns.map((pattern) => (
                          <span key={pattern} class="filter-pill">
                            {pattern}
                          </span>
                        ))
                      )}
                    </div>
                    {Object.keys(tool.queryParams).length > 0 && (
                      <div class="filter-row">
                        <span class="filter-label">Query</span>
                        {Object.entries(tool.queryParams).map(([key, value]) => (
                          <span key={key} class="filter-pill">
                            {key}={value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {tool.description && (
                    <span class="tool-description">{tool.description}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InstalledSection() {
  const [filter, setFilter] = useState('');
  const groups = Object.values(installedGroups.value);

  // Filter groups by name
  const filteredGroups = filter
    ? groups.filter((g) =>
        g.name.toLowerCase().includes(filter.toLowerCase())
      )
    : groups;

  // Sort: enabled first, then alphabetically
  const sortedGroups = [...filteredGroups].sort((a, b) => {
    const aEnabled = isGroupEnabled(a);
    const bEnabled = isGroupEnabled(b);
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div class="settings-section">
      <h2 class="section-title">Installed Tools</h2>
      <input
        type="text"
        class="tools-search"
        placeholder="Filter installed tools..."
        value={filter}
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
      {groups.length === 0 ? (
        <p class="no-tools">
          No tools installed. Go to <strong>Search</strong> to find and install
          tools.
        </p>
      ) : filteredGroups.length === 0 ? (
        <p class="no-tools">No installed tools match your filter.</p>
      ) : (
        sortedGroups.map((group) => (
          <InstalledGroupCard
            key={`${group.sourceUrl}:${group.name}`}
            group={group}
          />
        ))
      )}
    </div>
  );
}
