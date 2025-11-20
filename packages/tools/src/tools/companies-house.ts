import type {ToolDefinition} from '@ripul/web-mcp';
import type {ToolRegistryEntry} from '../types.js';

export const companySearchTool: ToolDefinition = {
  name: 'companySearch',
  description:
    'Search for company information by name or person. This tool will trigger a search but will not return results directly. Use the `listCompanies` tool to retrieve search results after performing a search.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query (company name or person).'
      }
    }
  },
  execute: async (input: unknown) => {
    const {query} = input as {query: string};
    const searchInput =
      document.querySelector<HTMLInputElement>('#site-search-text');

    if (!searchInput) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Search input element not found on the page.'
          }
        ]
      };
    }

    searchInput.value = query;

    const form = searchInput.closest('form');

    if (!form) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Search form element not found on the page.'
          }
        ]
      };
    }

    form.submit();

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `Search submitted for query: "${query}"`
        }
      ]
    };
  }
};

export const listCompaniesTool: ToolDefinition = {
  name: 'listCompanies',
  description: 'List companies from the current search results page.',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  execute: async () => {
    const rows = document.querySelectorAll<HTMLElement>(
      '#results > .type-company'
    );
    if (rows.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'No company results found on the page.'
          }
        ]
      };
    }

    const results: Array<{
      name: string;
      id: string;
      address: string;
      status: string;
    }> = [];

    for (const row of rows) {
      const name =
        row.querySelector<HTMLElement>(':scope > h3')?.textContent?.trim() ||
        'N/A';
      const address =
        row
          .querySelector<HTMLElement>(':scope > p:last-of-type')
          ?.textContent?.trim() || 'N/A';
      const meta =
        row.querySelector<HTMLElement>(':scope > p.meta')?.textContent || '';
      const [id, status] = meta.split(' - ').map((s) => s.trim());

      results.push({name, id: id || 'N/A', address, status: status || 'N/A'});
    }

    return {
      isError: false,
      content: results.map((company) => ({
        type: 'text',
        text: `Name: ${company.name}\nID: ${company.id}\nAddress: ${company.address}\nStatus: ${company.status}`
      }))
    };
  }
};

export const companiesHouseTools: ToolRegistryEntry = {
  id: 'companies-house',
  name: 'Companies House',
  domains: ['find-and-update.company-information.service.gov.uk'],
  tools: [
    {
      tool: companySearchTool,
      pathMatches: (path) => path === '/'
    },
    {
      tool: listCompaniesTool,
      pathMatches: (path) => path.startsWith('/search')
    }
  ]
};
