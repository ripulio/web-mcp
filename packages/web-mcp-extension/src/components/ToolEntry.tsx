import type {ToolRegistryResult} from '../shared.js';
import {handleToolToggle} from '../stores/enabledToolsStore.js';

export interface ToolEntryProps {
  entry: ToolRegistryResult;
  isEnabled: boolean;
  isFetching: boolean;
  error?: string;
  isDescExpanded: boolean;
  isOverflowing: boolean;
  descriptionRef: (el: HTMLSpanElement | null) => void;
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
  onToggleDescription
}: ToolEntryProps) {
  return (
    <div class="registry-entry">
      <div class="registry-row">
        <div class="registry-info">
          <span class="registry-name">{entry.name}</span>
          <div class="tool-filters">
            <div class="filter-row">
              <span class="filter-label">Domains</span>
              {entry.domains.includes('*') ? (
                <span class="filter-pill">All domains</span>
              ) : (
                entry.domains.map((domain) => (
                  <span key={domain} class="filter-pill">
                    {domain}
                  </span>
                ))
              )}
            </div>
            <div class="filter-row">
              <span class="filter-label">Paths</span>
              {entry.pathPatterns.length === 0 ||
              entry.pathPatterns.includes('.*') ? (
                <span class="filter-pill">All paths</span>
              ) : (
                entry.pathPatterns.map((pattern) => (
                  <span key={pattern} class="filter-pill">
                    {pattern}
                  </span>
                ))
              )}
            </div>
            {Object.keys(entry.queryParams).length > 0 && (
              <div class="filter-row">
                <span class="filter-label">Query</span>
                {Object.entries(entry.queryParams).map(([key, value]) => (
                  <span key={key} class="filter-pill">
                    {key}={value}
                  </span>
                ))}
              </div>
            )}
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
        </div>
        <div class="registry-actions">
          {isFetching ? (
            <span class="fetching">Loading...</span>
          ) : (
            <label class="toggle-switch">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() => handleToolToggle(entry)}
                disabled={isFetching}
              />
              <span class="toggle-slider"></span>
            </label>
          )}
        </div>
      </div>
      {error && <div class="fetch-error">{error}</div>}
    </div>
  );
}
