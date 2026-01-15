import type {ToolRegistryResult, GroupedToolRegistryResult} from '../shared.js';

/**
 * Check if a tool matches a search query
 */
export function matchesTool(tool: ToolRegistryResult, query: string): boolean {
  const q = query.toLowerCase().trim();

  if (URL.canParse(q)) {
    try {
      const url = new URL(q.startsWith('www.') ? `https://${q}` : q);
      return tool.domains.some(
        (d) => url.hostname === d || url.hostname.endsWith(`.${d}`)
      );
    } catch {
      return true;
    }
  }

  const searchable = [
    tool.name,
    tool.description,
    ...tool.domains,
    tool.baseUrl
  ]
    .join(' ')
    .toLowerCase();
  return searchable.includes(q);
}

/**
 * Filter grouped registry results by search query
 */
export function filterGroupedRegistry(
  sources: GroupedToolRegistryResult[],
  query: string
): GroupedToolRegistryResult[] {
  if (!query.trim()) return sources;

  return sources
    .map((source) => ({
      ...source,
      groups: source.groups
        .map((group) => ({
          ...group,
          tools: group.tools.filter((tool) => matchesTool(tool, query))
        }))
        .filter((group) => group.tools.length > 0)
    }))
    .filter((source) => source.groups.length > 0);
}
