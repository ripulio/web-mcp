import type {ToolGroupResult} from '../shared.js';
import type {GroupToggleState} from '../stores/enabledToolsStore.js';
import {
  enabledTools,
  fetchingIds,
  fetchErrors,
  handleGroupToggle
} from '../stores/enabledToolsStore.js';
import {
  expandedDescriptions,
  overflowingDescriptions,
  descriptionRefs,
  toggleGroup,
  toggleDescription
} from '../stores/uiStore.js';
import {ToolEntry} from './ToolEntry.js';

export interface ToolGroupProps {
  group: ToolGroupResult;
  sourceUrl: string;
  baseUrl: string;
  isExpanded: boolean;
  toggleState: GroupToggleState;
  isGroupFetching: boolean;
}

export function ToolGroup({
  group,
  sourceUrl,
  baseUrl,
  isExpanded,
  toggleState,
  isGroupFetching
}: ToolGroupProps) {
  const groupId = `${sourceUrl}:${group.name}`;

  return (
    <div class="tool-group">
      <div class="group-header" onClick={() => toggleGroup(groupId)}>
        <span class={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▶</span>
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
          {isGroupFetching ? (
            <span class="fetching">Loading...</span>
          ) : (
            <label
              class={`toggle-switch ${toggleState === 'partial' ? 'partial' : ''}`}
            >
              <input
                type="checkbox"
                checked={toggleState !== 'none'}
                onChange={() => handleGroupToggle(group, sourceUrl, baseUrl)}
              />
              <span class="toggle-slider"></span>
            </label>
          )}
        </div>
      </div>
      {isExpanded && (
        <div class="tools-list">
          {group.tools.map((entry) => {
            const compositeId = `${entry.sourceUrl}:${entry.name}`;
            const isEnabled = enabledTools.value[compositeId] !== undefined;
            const isFetching = fetchingIds.value.has(compositeId);
            const error = fetchErrors.value[compositeId];
            const descKey = compositeId;
            const isDescExpanded = expandedDescriptions.value.has(descKey);
            const isOverflowing = overflowingDescriptions.value.has(descKey);

            return (
              <ToolEntry
                key={compositeId}
                entry={entry}
                isEnabled={isEnabled}
                isFetching={isFetching}
                error={error}
                isDescExpanded={isDescExpanded}
                isOverflowing={isOverflowing}
                descriptionRef={(el) => {
                  if (el) {
                    descriptionRefs.set(descKey, el);
                  }
                }}
                onToggleDescription={() => toggleDescription(descKey)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
