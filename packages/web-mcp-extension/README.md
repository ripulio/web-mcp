# Web MCP Extension

*Part of the [web-mcp](https://github.com/ripulio/web-mcp) monorepo.*

A Chrome extension that enables AI assistants to discover and use tools on web pages through the Model Context Protocol.

## What is Web MCP?

Web MCP brings the [Model Context Protocol](https://modelcontextprotocol.io) to the browser. It allows websites to register tools that AI assistants can discover and invoke, enabling richer interactions between users, web applications, and AI.

This extension:
- Injects tools from the [web-mcp.org](https://web-mcp.org) registry into web pages
- Exposes tools via the `navigator.modelContext` API for AI assistants to discover
- Connects to MCP servers to enable browser control capabilities

## Features

- **Tool Registry** - Browse and install tools from web-mcp.org
- **Smart Filtering** - Tools only appear on relevant sites based on domain, path, or query parameters
- **Custom Sources** - Add your own tool sources alongside the default registry
- **Browser Control** - Allow MCP-compatible AI assistants to open tabs, navigate, and invoke tools

## Installation

### From Release

1. Download the latest release zip from [GitHub Releases](https://github.com/ripulio/web-mcp/releases)
2. Extract the zip file
3. Open `chrome://extensions` in Chrome
4. Enable "Developer mode"
5. Click "Load unpacked" and select the extracted folder

### From Source

1. Clone the repository and build:
   ```bash
   git clone https://github.com/ripulio/web-mcp.git
   cd web-mcp
   npm install
   npm run build -w @ripulio/web-mcp-extension
   ```
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select `packages/web-mcp-extension/extension`

## Usage

### Installing Tools

1. Click the extension icon and open **Settings**
2. Go to the **Search** tab
3. Browse available tool groups or search by name
4. Click **Install** on any group you want to use

### Managing Tools

In the **Installed** tab:
- Toggle groups on/off to enable or disable all tools in that group
- Click **Uninstall** to remove a group entirely

### Custom Tool Sources

In the **Advanced** tab:
- Add URLs to custom tool sources (must follow the web-mcp API format)
- Tools from custom sources appear alongside registry tools

### Browser Control

Browser control allows MCP servers to interact with your browser:
- Toggle it on/off in the **Advanced** tab
- When enabled, the extension listens on ports 8765-8785 for MCP server connections
- Connected servers can open/close tabs and invoke tools on pages

## Creating Tools

See the [web-mcp.org documentation](https://web-mcp.org) for information on authoring tools and publishing to the registry.

## Links

- [W3C Web Model Context Protocol Specification](https://anthropics.github.io/model-context-protocol/)
- [GitHub Repository](https://github.com/ripulio/web-mcp)
- [Tool Registry](https://web-mcp.org)
- [Report Issues](https://github.com/ripulio/web-mcp/issues)

## License

MIT
