import {Tool} from '@modelcontextprotocol/sdk/types.js';

export const browserTool: Tool = {
  name: 'executeTool',
  description: `Control the browser and execute page tools. Actions:
- list_tabs: List open tabs (id, title, url)
- get_tab: Get a tab's tools (params: tabId)
- open_tab: Open a new tab (params: url)
- close_tab: Close a tab (params: tabId)
- <tool_name>: Call a page-specific tool (params: tabId, plus tool-specific args)`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description:
          'The action to perform: list_tabs, get_tab, open_tab, close_tab, or a page-specific tool name'
      },
      tabId: {
        type: 'number',
        description: 'Tab ID (required for get_tab, close_tab, and page-specific tools)'
      },
      url: {
        type: 'string',
        description: 'URL to open (for open_tab action)'
      }
    },
    required: ['action']
  }
};

export function getTools(): Tool[] {
  return [browserTool];
}
