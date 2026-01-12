import type {ToolGroupResult, ToolRegistryResult, EnabledTools} from '../shared.js';
import type {GroupToggleState} from '../hooks/useEnabledTools.js';
import type {DescriptionRefsType} from '../hooks/useExpandableUI.js';
import {ToolEntry} from './ToolEntry.js';

export interface ToolGroupProps {
  group: ToolGroupResult;
  sourceUrl: string;
  baseUrl: string;
  isExpanded: boolean;
  toggleState: GroupToggleState;
  isGroupFetching: boolean;
  enabledTools: EnabledTools;
  fetchingIds: Set<string>;
  fetchErrors: {[id: string]: string};
  expandedDescriptions: Set<string>;
  overflowingDescriptions: Set<string>;
  descriptionRefs: DescriptionRefsType;
  onToggleGroup: (groupId: string) => void;
  onGroupToggle: () => void;
  onToolToggle: (entry: ToolRegistryResult) => void;
  onToggleDescription: (key: string) => void;
}

export function ToolGroup({
  group,
  sourceUrl,
  isExpanded,
  toggleState,
  isGroupFetching,
  enabledTools,
  fetchingIds,
  fetchErrors,
  expandedDescriptions,
  overflowingDescriptions,
  descriptionRefs,
  onToggleGroup,
  onGroupToggle,
  onToolToggle,
  onToggleDescription
}: ToolGroupProps) {
  const groupId = `${sourceUrl}:${group.name}`;

  return (
    <div class="tool-group">
      <div class="group-header" onClick={() => onToggleGroup(groupId)}>
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
                onChange={onGroupToggle}
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
            const isEnabled = !!enabledTools[compositeId];
            const isFetching = fetchingIds.has(compositeId);
            const error = fetchErrors[compositeId];
            const descKey = compositeId;
            const isDescExpanded = expandedDescriptions.has(descKey);
            const isOverflowing = overflowingDescriptions.has(descKey);

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
                    descriptionRefs.current.set(descKey, el);
                  }
                }}
                onToggle={() => onToolToggle(entry)}
                onToggleDescription={() => onToggleDescription(descKey)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
