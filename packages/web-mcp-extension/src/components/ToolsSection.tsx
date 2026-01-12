import type {
  GroupedToolRegistryResult,
  ToolRegistryResult,
  ToolGroupResult,
  EnabledTools
} from '../shared.js';
import type {GroupToggleState} from '../hooks/useEnabledTools.js';
import type {DescriptionRefsType} from '../hooks/useExpandableUI.js';
import {ToolGroup} from './ToolGroup.js';

export interface ToolsSectionProps {
  filteredRegistry: GroupedToolRegistryResult[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  enabledTools: EnabledTools;
  fetchingIds: Set<string>;
  fetchErrors: {[id: string]: string};
  expandedGroups: Set<string>;
  expandedDescriptions: Set<string>;
  overflowingDescriptions: Set<string>;
  descriptionRefs: DescriptionRefsType;
  getGroupToggleState: (
    group: ToolGroupResult,
    sourceUrl: string
  ) => GroupToggleState;
  onToggleGroup: (groupId: string) => void;
  onGroupToggle: (
    group: ToolGroupResult,
    sourceUrl: string,
    baseUrl: string
  ) => void;
  onToolToggle: (entry: ToolRegistryResult) => void;
  onToggleDescription: (key: string) => void;
}

export function ToolsSection({
  filteredRegistry,
  searchQuery,
  onSearchChange,
  enabledTools,
  fetchingIds,
  fetchErrors,
  expandedGroups,
  expandedDescriptions,
  overflowingDescriptions,
  descriptionRefs,
  getGroupToggleState,
  onToggleGroup,
  onGroupToggle,
  onToolToggle,
  onToggleDescription
}: ToolsSectionProps) {
  return (
    <div class="settings-section">
      <h2 class="section-title">Available Tools</h2>
      <input
        type="text"
        class="tools-search"
        placeholder="Search tools or paste URL..."
        value={searchQuery}
        onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
      />
      {filteredRegistry.length === 0 ? (
        searchQuery ? (
          <p class="no-tools">No tools match your search.</p>
        ) : (
          <p class="no-tools">No tools available from configured sources.</p>
        )
      ) : (
        filteredRegistry.map((source) =>
          source.groups.map((group) => {
            const groupId = `${source.sourceUrl}:${group.name}`;
            const isExpanded = expandedGroups.has(groupId);
            const toggleState = getGroupToggleState(group, source.sourceUrl);
            const isGroupFetching = group.tools.some((t) =>
              fetchingIds.has(`${source.sourceUrl}:${t.name}`)
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
                enabledTools={enabledTools}
                fetchingIds={fetchingIds}
                fetchErrors={fetchErrors}
                expandedDescriptions={expandedDescriptions}
                overflowingDescriptions={overflowingDescriptions}
                descriptionRefs={descriptionRefs}
                onToggleGroup={onToggleGroup}
                onGroupToggle={() =>
                  onGroupToggle(group, source.sourceUrl, source.baseUrl)
                }
                onToolToggle={onToolToggle}
                onToggleDescription={onToggleDescription}
              />
            );
          })
        )
      )}
    </div>
  );
}
