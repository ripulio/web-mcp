import type {ToolFilter} from '../shared.js';

export function ToolFilters({filters}: {filters: ToolFilter[]}) {
  return (
    <div class="tool-filters">
      {filters.map((filter) => {
        if (filter.type === 'domain') {
          return (
            <div class="filter-row">
              <span class="filter-label">Domains</span>
              {filter.domains.includes('*') ? (
                <span class="filter-pill">All domains</span>
              ) : (
                filter.domains.map((domain) => (
                  <span key={domain} class="filter-pill">
                    {domain}
                  </span>
                ))
              )}
            </div>
          );
        }
        if (filter.type === 'path') {
          return (
            <div class="filter-row">
              <span class="filter-label">Paths</span>
              {filter.paths.length === 0 || filter.paths.includes('.*') ? (
                <span class="filter-pill">All paths</span>
              ) : (
                filter.paths.map((pattern) => (
                  <span key={pattern} class="filter-pill">
                    {pattern}
                  </span>
                ))
              )}
            </div>
          );
        }
        if (filter.type === 'query') {
          return (
            <div class="filter-row">
              <span class="filter-label">Query</span>
              {Object.entries(filter.parameters).map(([key, value]) => (
                <span key={key} class="filter-pill">
                  {key}={value}
                </span>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
