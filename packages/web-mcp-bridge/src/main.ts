#!/usr/bin/env node

import type {ToolDefinitionInfo} from '@ripul/web-mcp';
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
      tools: {
        listChanged: true
      }
    }
  }
);

const BROWSER_IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let browserInstance: Browser | null = null;
let browserIdleTimer: ReturnType<typeof setTimeout> | null = null;

const webToolsRegistry = new Map<string, ToolDefinitionInfo[]>();

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

async function registerWebPage(url: string) {
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

    webToolsRegistry.set(url, tools);

    return {
      content: [
        {
          type: 'text',
          text: `Registered ${tools.length} Web MCP tool(s) from ${url}:
${JSON.stringify(tools, null, 2)}
`
        }
      ]
    };
  } finally {
    await page.close();
  }
}

async function callWebTool(
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
  const tools = [
    {
      name: 'register_web_page',
      description:
        'Discovers and registers Web MCP tools exposed by a web page or web service. When given a URL (like example.com, or any web address), call this FIRST to discover what tools and data operations that page provides. After registration, you can use the call_webmcp_tool tool with one of the discovered tools to retrieve data or perform operations. This is the required first step for interacting with any web service that exposes Web MCP tools.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The web page URL to load tools from'
          }
        },
        required: ['url']
      }
    },
    {
      name: 'call_webmcp_tool',
      description:
        'Calls a specific Web MCP tool that was previously registered from a web page or web service using the register_web_page tool. You must first register the web page to discover its available tools, then you can call one of those tools by specifying its name and providing the required input parameters. This allows you to interact with the web service and retrieve data or perform operations as defined by the registered tools.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The web page URL where the tool was registered from'
          },
          tool_name: {
            type: 'string',
            description:
              'The name of the tool to call, as discovered during registration'
          },
          tool_input: {
            type: 'object',
            description: 'The input parameters required by the specified tool'
          }
        },
        required: ['url', 'tool_name', 'tool_input']
      }
    }
  ];

  return {
    tools
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const {name, arguments: args} = request.params;

  if (!args) {
    throw new Error(`Missing arguments for tool: ${name}`);
  }

  if (name === 'register_web_page') {
    return registerWebPage(args.url as string);
  }

  if (name === 'call_webmcp_tool') {
    return callWebTool(
      args.url as string,
      args.tool_name as string,
      args.tool_input as Record<string, unknown>
    );
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
});
