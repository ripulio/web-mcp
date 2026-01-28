import {useState} from 'preact/hooks';
import {
  filteredRegistry,
  searchQuery,
  setSearchQuery
} from '../stores/searchStore.js';
import {
  installedGroups,
  installGroup,
  isGroupInstalled
} from '../stores/installedToolsStore.js';
import type {ToolGroupResult} from '../shared.js';

function SearchGroupCard({
  group,
  sourceUrl,
  baseUrl
}: {
  group: ToolGroupResult;
  sourceUrl: string;
  baseUrl: string;
}) {
  const groupId = `${sourceUrl}:${group.name}`;
  const installed = isGroupInstalled(groupId);
  const [expanded, setExpanded] = useState(false);
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await installGroup(group, sourceUrl, baseUrl);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div class="tool-group">
      <div class="group-header" onClick={() => setExpanded(!expanded)}>
        <span class={`expand-icon ${expanded ? 'expanded' : ''}`}>▶</span>
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
          {installed ? (
            <span class="installed-badge">Installed</span>
          ) : installing ? (
            <span class="fetching">Installing...</span>
          ) : (
            <button class="install-btn" onClick={handleInstall}>
              Install
            </button>
          )}
        </div>
      </div>
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

export function SearchSection() {
  // Access installedGroups.value to subscribe to changes
  void installedGroups.value;

  return (
    <div class="settings-section">
      <h2 class="section-title">Search Tools</h2>
      <input
        type="text"
        class="tools-search"
        placeholder="Search tools or paste URL..."
        value={searchQuery.value}
        onInput={(e) => setSearchQuery(e.currentTarget.value)}
      />
      {filteredRegistry.value.length === 0 ? (
        searchQuery.value ? (
          <p class="no-tools">No tools match your search.</p>
        ) : (
          <p class="no-tools">No tools available from configured sources.</p>
        )
      ) : (
        filteredRegistry.value.map((source) =>
          source.groups.map((group) => (
            <SearchGroupCard
              key={`${source.sourceUrl}:${group.name}`}
              group={group}
              sourceUrl={source.sourceUrl}
              baseUrl={source.baseUrl}
            />
          ))
        )
      )}
    </div>
  );
}
