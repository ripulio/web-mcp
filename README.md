# Web MCP

A monorepo implementing the [Web Model Context Protocol](https://anthropics.github.io/model-context-protocol/) for browser integration.

The Web MCP specification defines a `navigator.modelContext` API that allows web pages to register tools for AI assistants to discover and invoke. This repo provides:

- An MCP server that connects AI assistants to browser tabs
- A Chrome extension that exposes page tools to the MCP server
- A polyfill for the `navigator.modelContext` API
- A registry of pre-built tools that can be injected into pages (optional)

## How It Works

```
┌─────────────────────────────────┐
│  AI Assistant (Claude, etc.)   │
└───────────────┬─────────────────┘
                │ stdio
                ▼
┌─────────────────────────────────┐
│     web-mcp-server (CLI)        │
│  MCP server for browser control │
└───────────────┬─────────────────┘
                │ WebSocket
                ▼
┌─────────────────────────────────┐
│   Chrome Extension              │
│  Exposes page tools via MCP     │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│   Web Pages                     │
│  navigator.modelContext API     │
└─────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| [web-mcp-server](packages/web-mcp-server) | MCP server CLI that enables AI assistants to control browser tabs and invoke page tools |
| [web-mcp-extension](packages/web-mcp-extension) | Chrome extension for browsing/installing tools and connecting to MCP servers |
| [web-mcp-devtools](packages/web-mcp-devtools) | Chrome DevTools panel for inspecting and testing tools on pages |
| [webmcp-polyfill](packages/polyfill) | Browser polyfill implementing the `navigator.modelContext` API |

## Quick Start

### 1. Install the Chrome Extension

See [web-mcp-extension](packages/web-mcp-extension) for installation instructions.

### 2. Configure Your AI Assistant

Add the MCP server to your AI assistant's configuration:

```json
{
  "mcpServers": {
    "web-mcp": {
      "command": "npx",
      "args": ["@ripulio/web-mcp-server"]
    }
  }
}
```

### 3. Enable Browser Control

In the extension settings, enable browser control to allow the MCP server to interact with your browser.

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Lint and format
npm run lint
npm run format
```

## Links

- [Web Model Context Protocol Specification](https://anthropics.github.io/model-context-protocol/)
- [Tool Registry](https://web-mcp.org)
- [Report Issues](https://github.com/ripulio/web-mcp/issues)

## License

MIT
