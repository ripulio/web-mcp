import type {PackageSource, BrowsedToolsData} from '../shared.js';
import {formatSourceUrl} from '../utils/format.js';

export interface SourceListProps {
  sources: PackageSource[];
  sourceErrors: {[url: string]: string};
  refreshingSource: string | null;
  isBrowsing: boolean;
  browsedTools: BrowsedToolsData | null;
  browsingError: string | null;
  onSourceToggle: (url: string, enabled: boolean) => void;
  onRefreshSource: (url: string) => void;
  onRemoveSource: (url: string) => void;
  onBrowseDirectory: () => void;
  onRefreshBrowsedTools: () => void;
  onClearBrowsedTools: () => void;
}

export function SourceList({
  sources,
  sourceErrors,
  refreshingSource,
  isBrowsing,
  browsedTools,
  browsingError,
  onSourceToggle,
  onRefreshSource,
  onRemoveSource,
  onBrowseDirectory,
  onRefreshBrowsedTools,
  onClearBrowsedTools
}: SourceListProps) {
  return (
    <div class="source-list">
      {sources.map((source) => {
        const hasError = !!sourceErrors[source.url];
        const isRefreshing = refreshingSource === source.url;
        const isLocal = source.type === 'local' || source.url === 'local';
        const isEnabled = source.enabled !== false;

        return (
          <div
            key={source.url}
            class={`source-item ${hasError ? 'error' : ''} ${!isEnabled ? 'disabled' : ''}`}
          >
            <div class="source-toggle">
              <label class="toggle-switch source-toggle-switch">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => onSourceToggle(source.url, !isEnabled)}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="source-info">
              {hasError && (
                <span
                  class="source-error-icon"
                  title={sourceErrors[source.url]}
                >
                  !
                </span>
              )}
              <span
                class="source-url"
                title={
                  isLocal
                    ? "Browse to select a local webmcp-tools repo (must be built with 'npm run build')"
                    : undefined
                }
              >
                {source.name || formatSourceUrl(source.url)}
              </span>
              {hasError && (
                <span class="source-error-message">
                  {sourceErrors[source.url]}
                </span>
              )}
            </div>
            <div class="source-actions">
              {isLocal && (
                <>
                  <button
                    class="browse-btn"
                    onClick={onBrowseDirectory}
                    disabled={isBrowsing}
                    title="Browse for tools directory"
                  >
                    {isBrowsing ? '...' : 'Browse'}
                  </button>
                  {browsedTools && (
                    <span
                      class="browsed-info"
                      title={`${browsedTools.directoryName} - Last updated: ${new Date(browsedTools.lastUpdated).toLocaleString()}`}
                    >
                      {browsedTools.groups.length} groups
                    </span>
                  )}
                  {browsedTools && (
                    <button
                      class="clear-browsed-btn"
                      onClick={onClearBrowsedTools}
                      title="Clear browsed tools"
                    >
                      ×
                    </button>
                  )}
                </>
              )}
              <button
                class={`source-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                onClick={() =>
                  isLocal && browsedTools
                    ? onRefreshBrowsedTools()
                    : onRefreshSource(source.url)
                }
                disabled={isRefreshing || isBrowsing}
                title={
                  isLocal && browsedTools
                    ? 'Refresh tools from directory'
                    : 'Refresh source'
                }
              >
                ↻
              </button>
              {!isLocal && (
                <button
                  class="remove-btn"
                  onClick={() => onRemoveSource(source.url)}
                  title="Remove source"
                >
                  ×
                </button>
              )}
            </div>
            {isLocal && browsingError && (
              <div class="browsing-error">{browsingError}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
