import {filteredRegistry, searchQuery, setSearchQuery} from '../stores/searchStore.js';
import {
  fetchingIds,
  getGroupToggleState
} from '../stores/enabledToolsStore.js';
import {expandedGroups} from '../stores/uiStore.js';
import {ToolGroup} from './ToolGroup.js';

export function ToolsSection() {
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
        filteredRegistry.value.map((source) =>
          source.groups.map((group) => {
            const groupId = `${source.sourceUrl}:${group.name}`;
            const isExpanded = expandedGroups.value.has(groupId);
            const toggleState = getGroupToggleState(group, source.sourceUrl);
            const isGroupFetching = group.tools.some((t) =>
              fetchingIds.value.has(`${source.sourceUrl}:${t.name}`)
            );

            return (
              <ToolGroup
                key={groupId}
                group={group}
                sourceUrl={source.sourceUrl}
                baseUrl={source.baseUrl}
                isExpanded={isExpanded}
                toggleState={toggleState}
                isGroupFetching={isGroupFetching}
              />
            );
          })
        )
      )}
    </div>
  );
}
