import type {ToolDefinition} from '@ripul/web-mcp';
import type {ToolRegistryEntry} from '../types.js';

export const listResultsTool: ToolDefinition = {
  name: 'google_search_list_results',
  description: 'List the organic search results currently visible on the page.',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return.'
      }
    }
  },
  async execute(rawInput) {
    const input = rawInput as {maxResults?: number};
    const maxResults =
      input && typeof input === 'object' && typeof input.maxResults === 'number'
        ? Math.max(1, Math.floor(input.maxResults))
        : null;

    const anchors = Array.from(document.querySelectorAll('#search a h3')).map(
      (heading) => {
        const anchor = heading.closest('a');
        if (!anchor) {
          return null;
        }

        return {
          title: heading.textContent?.trim() ?? '',
          url: anchor.href
        };
      }
    );

    const results = anchors.filter(
      (result): result is {title: string; url: string} => {
        return (
          result !== null &&
          result.title !== '' &&
          result.url !== '' &&
          !result.url.startsWith('javascript:')
        );
      }
    );

    const sliced = maxResults ? results.slice(0, maxResults) : results;

    const formattedList = sliced
      .map((item, index) => `${index + 1}. ${item.title}\n   ${item.url}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text:
            (sliced.length
              ? 'Here are the current Google search results:\\n'
              : 'No Google search results were found.') +
            (formattedList ? '\\n' + formattedList : '')
        }
      ],
      structuredContent: {
        results: sliced
      }
    };
  }
};

export const googleSearchTools: ToolRegistryEntry = {
  id: 'google-search',
  name: 'Google Search',
  // TODO (jg): allow regex in domains so we can match `google.*`
  domains: ['google.com', 'www.google.con'],
  tools: [
    {
      tool: listResultsTool,
      pathMatches: (path) => path.startsWith('/search')
    }
  ]
};
