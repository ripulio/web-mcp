import type {
  ToolResponse,
  ToolFilter,
  SourceResult,
  DomainFilter
} from '../shared.js';

/**
 * Check if a single filter matches a URL
 */
export function matchesFilter(filter: ToolFilter, url: URL): boolean {
  if (filter.type === 'domain') {
    return (
      filter.domains.includes('*') ||
      filter.domains.some(
        (d) => url.hostname === d || url.hostname.endsWith(`.${d}`)
      )
    );
  }
  if (filter.type === 'path') {
    return (
      filter.paths.length === 0 ||
      filter.paths.some((pattern) => new RegExp(pattern).test(url.pathname))
    );
  }
  if (filter.type === 'query') {
    const keys = Object.keys(filter.parameters);
    const urlParams = new URLSearchParams(url.search);
    return (
      keys.length === 0 ||
      keys.every((key) => urlParams.get(key) === filter.parameters[key])
    );
  }
  return true;
}

/**
 * Check if a tool matches a search query
 */
export function matchesTool(
  tool: ToolResponse,
  query: string,
  baseUrl: string
): boolean {
  const q = query.toLowerCase().trim();

  if (URL.canParse(q)) {
    try {
      const url = new URL(q.startsWith('www.') ? `https://${q}` : q);
      return tool.filters.some(
        (f) => f.type === 'domain' && matchesFilter(f, url)
      );
    } catch {
      return true;
    }
  }

  const domains = tool.filters
    .filter((f): f is DomainFilter => f.type === 'domain')
    .flatMap((f) => f.domains);

  const searchable = [tool.id, tool.description, ...domains, baseUrl]
    .join(' ')
    .toLowerCase();
  return searchable.includes(q);
}

/**
 * Filter grouped registry results by search query
 */
export function filterGroupedRegistry(
  sources: SourceResult[],
  query: string
): SourceResult[] {
  if (!query.trim()) return sources;

  return sources
    .map((source) => ({
      ...source,
      groups: source.groups
        .map((group) => ({
          ...group,
          tools: group.tools.filter((tool) =>
            matchesTool(tool, query, source.baseUrl)
          )
        }))
        .filter((group) => group.tools.length > 0)
    }))
    .filter((source) => source.groups.length > 0);
}
