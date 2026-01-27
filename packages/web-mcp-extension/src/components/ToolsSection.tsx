import {filteredRegistry, searchQuery, setSearchQuery} from '../stores/searchStore.js';
import {
  fetchingIds,
  getGroupToggleState
} from '../stores/enabledToolsStore.js';
import {expandedGroups} from '../stores/uiStore.js';
import {ToolGroup} from './ToolGroup.js';
import type {ToolGroupResult} from '../shared.js';

export function ToolsSection() {
  const sortedGroups: Array<{
    group: ToolGroupResult;
    sourceUrl: string;
    baseUrl: string;
    toggleState: ReturnType<typeof getGroupToggleState>;
  }> = [];

  for (const source of filteredRegistry.value) {
    for (const group of source.groups) {
      sortedGroups.push({
        group,
        sourceUrl: source.sourceUrl,
        baseUrl: source.baseUrl,
        toggleState: getGroupToggleState(group, source.sourceUrl)
      });
    }
  }

  sortedGroups.sort((a, b) => {
    const aEnabled = a.toggleState !== 'none';
    const bEnabled = b.toggleState !== 'none';
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
    return a.group.name.localeCompare(b.group.name);
  });

  return (
    <div class="settings-section">
      <h2 class="section-title">Available Tools</h2>
      <input
        type="text"
        class="tools-search"
        placeholder="Search tools or paste URL..."
        value={searchQuery.value}
        onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
      />
      {filteredRegistry.value.length === 0 ? (
        searchQuery.value ? (
          <p class="no-tools">No tools match your search.</p>
        ) : (
          <p class="no-tools">No tools available from configured sources.</p>
        )
      ) : (
        sortedGroups.map(({group, sourceUrl, baseUrl, toggleState}) => {
          const groupId = `${sourceUrl}:${group.name}`;
          const isExpanded = expandedGroups.value.has(groupId);
          const isGroupFetching = group.tools.some((t) =>
            fetchingIds.value.has(`${sourceUrl}:${t.name}`)
          );

          return (
            <ToolGroup
              key={groupId}
              group={group}
              sourceUrl={sourceUrl}
              baseUrl={baseUrl}
              isExpanded={isExpanded}
              toggleState={toggleState}
              isGroupFetching={isGroupFetching}
            />
          );
        })
      )}
    </div>
  );
}
