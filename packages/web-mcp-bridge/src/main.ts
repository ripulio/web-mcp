#!/usr/bin/env node

import type {} from '@ripul/web-mcp';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import puppeteer, {Browser} from 'puppeteer';

const server = new Server(
  {
    name: 'web-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const BROWSER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let browserInstance: Browser | null = null;
let browserIdleTimer: ReturnType<typeof setTimeout> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserIdleTimer) {
    clearTimeout(browserIdleTimer);
    browserIdleTimer = null;
  }

  if (!browserInstance || !browserInstance.connected) {
    browserInstance = await puppeteer.launch({
      headless: true
    });
  }

  browserIdleTimer = setTimeout(async () => {
    if (browserInstance) {
      await browserInstance.close();
      browserInstance = null;
    }
  }, BROWSER_IDLE_TIMEOUT);

  return browserInstance;
}

async function discoverTools(url: string) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle0'});

    const tools = await page.evaluate(() => {
      const tools = window.agent.tools.list();
      const result = [];
      for (const tool of tools) {
        result.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        });
      }
      return result;
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({tools})
        }
      ]
    };
  } finally {
    await page.close();
  }
}

async function callTool(
  url: string,
  name: string,
  input: Record<string, unknown>
) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.goto(url, {waitUntil: 'networkidle0'});

    const result = await page.evaluate(
      (toolInput) => {
        return new Promise((resolve) => {
          window.dispatchEvent(
            new window.ToolCallEvent(toolInput.name, toolInput.input, resolve)
          );
        });
      },
      {input, name}
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({result})
        }
      ]
    };
  } finally {
    await page.close();
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'discover_tools',
        description:
          'Discovers available web MCP tools in a given web page. These tools are not part of the MCP server itself and must be called using the call_tool tool.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The web page URL to analyze for available tools'
            }
          },
          required: ['url']
        }
      },
      {
        name: 'call_tool',
        description:
          'Calls a web MCP tool discovered by the discover_tools tool. The input schema is dynamic and depends on the tool being called.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The web page URL which hosts the tool to be called'
            },
            name: {
              type: 'string',
              description: 'The name of the web tool to call'
            },
            input: {
              type: 'object',
              description:
                'Input schema to the chosen web tool, conforming to the input schema returned by the discover_tools tool'
            }
          },
          required: ['url', 'name', 'input']
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const {name, arguments: args} = request.params;

  if (!args) {
    throw new Error(`Missing arguments for tool: ${name}`);
  }

  switch (name) {
    case 'discover_tools':
      return discoverTools(args.url as string);

    case 'call_tool':
      return callTool(
        args.url as string,
        args.name as string,
        args.input as Record<string, unknown>
      );

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
});
