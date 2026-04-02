import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {getTools} from './tools.js';
import {getState} from './state.js';
import {
  connectToExtension,
  startServer,
  openTab,
  closeTab,
  callPageTool,
  discoverToolsForTab,
  DEFAULT_SESSION_ID
} from './extension-client.js';
import {createSession, startSessionCleanup} from './session.js';
import {setResourcesChangedCallback} from './message-handler.js';

// Auto-connect to extension if not already connected
async function ensureConnected(): Promise<void> {
  const state = getState();
  if (!state.connected) {
    await connectToExtension(DEFAULT_SESSION_ID);
  }
}

// Handle tools/call requests
async function handleBrowserAction(
  action: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const state = getState();

  switch (action) {
    case 'list_tabs': {
      await ensureConnected();

      // Return tabs without tools (use get_tab to get tools)
      const tabs = Array.from(state.tabs.values()).map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url
      }));
      return {tabs};
    }

    case 'get_tab': {
      await ensureConnected();
      const tabId = params.tabId as number;
      if (tabId === undefined) {
        throw new Error('tabId parameter is required for get_tab');
      }
      const tab = state.tabs.get(tabId);
      if (!tab) {
        throw new Error(`Tab ${tabId} not found`);
      }

      // Discover tools for this tab
      await discoverToolsForTab(tabId, DEFAULT_SESSION_ID).catch((err) => {
        console.error(
          `Failed to discover tools for tab ${tabId}:`,
          err.message
        );
      });
      return {
        tab: {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          tools: tab.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        }
      };
    }

    case 'open_tab': {
      await ensureConnected();
      const url = params.url as string;
      if (!url) {
        throw new Error('url parameter is required for open_tab');
      }
      const tab = await openTab(url, DEFAULT_SESSION_ID);
      return {
        tab: {
          id: tab.id,
          title: tab.title,
          url: tab.url,
          tools: tab.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
          }))
        }
      };
    }

    case 'close_tab': {
      await ensureConnected();
      const tabId = params.tabId as number;
      if (tabId === undefined) {
        throw new Error('tabId parameter is required for close_tab');
      }
      if (!state.tabs.has(tabId)) {
        throw new Error(`Tab ${tabId} not found`);
      }
      await closeTab(tabId, DEFAULT_SESSION_ID);
      return {closed: true, tabId};
    }

    default: {
      // Assume it's a page-specific tool
      await ensureConnected();
      const tabId = params.tabId as number;
      if (tabId === undefined) {
        throw new Error('tabId parameter is required for page-specific tools');
      }
      if (!state.tabs.has(tabId)) {
        throw new Error(`Tab ${tabId} not found`);
      }
      // Pass all params except action and tabId to the page tool
      const {action: _, tabId: __, ...toolArgs} = params;
      const result = await callPageTool(
        tabId,
        action,
        toolArgs,
        DEFAULT_SESSION_ID
      );
      return result;
    }
  }
}

const server = new Server(
  {
    name: 'web-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {listChanged: true}
    }
  }
);

// Handle tools/list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {tools: getTools()};
});

// Handle tools/call requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const {name, arguments: args} = request.params;

  if (name !== 'executeTool') {
    return {
      content: [{type: 'text', text: `Error: Unknown tool: ${name}`}],
      isError: true
    };
  }

  const params = (args as Record<string, unknown>) ?? {};
  const action = params.action as string;

  if (!action) {
    return {
      content: [{type: 'text', text: 'Error: action parameter is required'}],
      isError: true
    };
  }

  try {
    const result = await handleBrowserAction(action, params);
    return {
      content: [{type: 'text', text: JSON.stringify(result, null, 2)}]
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{type: 'text', text: `Error: ${message}`}],
      isError: true
    };
  }
});

// Handle resources/list requests
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  await ensureConnected();

  const state = getState();
  const resources = Array.from(state.tabs.values()).map((tab) => ({
    uri: `browser://tab/${tab.id}`,
    name: tab.title || `Tab ${tab.id}`,
    description: `Browser tab: ${tab.url}`,
    mimeType: 'application/json'
  }));

  return {resources};
});

// Handle resources/read requests
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  await ensureConnected();

  const {uri} = request.params;
  const match = uri.match(/^browser:\/\/tab\/(\d+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  const tabId = parseInt(match[1], 10);
  const state = getState();
  const tab = state.tabs.get(tabId);
  if (!tab) {
    throw new Error(`Tab ${tabId} not found`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          {
            id: tab.id,
            title: tab.title,
            url: tab.url,
            tools: tab.tools.map((t) => ({
              name: t.name,
              description: t.description
            }))
          },
          null,
          2
        )
      }
    ]
  };
});

// Handle resources/templates/list requests
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
  return {
    resourceTemplates: [
      {
        uriTemplate: 'browser://tab/{tabId}',
        name: 'Browser Tab',
        description:
          'A browser tab identified by its Chrome tab ID. Returns tab metadata including title, URL, and available tools.',
        mimeType: 'application/json'
      }
    ]
  };
});

// Notify MCP clients when the tab list changes
setResourcesChangedCallback(() => {
  server.sendResourceListChanged().catch((err) => {
    console.error(
      'Failed to send resource list changed notification:',
      err.message
    );
  });
});

// Start the server
export async function start() {
  // Start WebSocket server for extension connections
  await startServer();

  // Start session cleanup
  startSessionCleanup();

  // Create default session
  createSession(DEFAULT_SESSION_ID);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Browser MCP server running on stdio');
}
