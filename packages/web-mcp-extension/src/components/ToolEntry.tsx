import type {ToolRegistryResult} from '../shared.js';

export interface ToolEntryProps {
  entry: ToolRegistryResult;
  isEnabled: boolean;
  isFetching: boolean;
  error?: string;
  isDescExpanded: boolean;
  isOverflowing: boolean;
  descriptionRef: (el: HTMLSpanElement | null) => void;
  onToggle: () => void;
  onToggleDescription: () => void;
}

export function ToolEntry({
  entry,
  isEnabled,
  isFetching,
  error,
  isDescExpanded,
  isOverflowing,
  descriptionRef,
  onToggle,
  onToggleDescription
}: ToolEntryProps) {
  return (
    <div class="registry-entry">
      <div class="registry-row">
        <div class="registry-info">
          <span class="registry-name">{entry.name}</span>
          <span class="tool-group-badge">{entry.groupName}</span>
          {entry.pathPatterns.length > 0 && (
            <span class="tool-path-pattern">
              {entry.pathPatterns.join(', ')}
            </span>
          )}
          <div class="registry-domains">
            {entry.domains.map((domain) => (
              <span key={domain} class="domain-pill">
                {domain}
              </span>
            ))}
          </div>
        </div>
        <div class="registry-actions">
          {isFetching ? (
            <span class="fetching">Loading...</span>
          ) : (
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={onToggle}
                disabled={isFetching}
              />
              <span class="toggle-slider"></span>
            </label>
          )}
        </div>
      </div>
      {entry.description && (
        <div class="tool-description-wrapper">
          <span
            class={`tool-description ${isDescExpanded ? 'expanded' : ''}`}
            ref={descriptionRef}
          >
            {entry.description}
          </span>
          {(isOverflowing || isDescExpanded) && (
            <button
              class="toggle-desc-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleDescription();
              }}
            >
              {isDescExpanded ? 'show less' : 'show more'}
            </button>
          )}
        </div>
      )}
      {error && <div class="fetch-error">{error}</div>}
    </div>
  );
}
