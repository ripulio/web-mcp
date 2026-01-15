# webmcp-skill

Agent skill describing how to use the `navigator.modelContext` API in web pages.

**Skill name:** `webmcp`

## What This Skill Does

WebMCP allows web pages to expose tools via the `navigator.modelContext` API. These tools follow the [Model Context Protocol](https://modelcontextprotocol.io/) standard, enabling LLMs to interact with web applications programmatically.

This skill teaches LLMs how to use the WebMCP API when they have access to browser automation or JavaScript execution in a page context. The skill covers:

- **Tool Discovery** - Using `navigator.modelContext.list()` to find available tools and their JSON Schema input definitions
- **Tool Execution** - Calling `navigator.modelContext.executeTool(name, args)` with properly structured arguments
- **Result Handling** - Parsing `CallToolResult` responses which contain MCP-standard content blocks (text, images, resources) and optional structured data
- **Error Handling** - Detecting and responding to tool execution failures via the `isError` flag

## Installation

### Claude Code

1. Add the marketplace:
   ```
   /plugin marketplace add ripulio/web-mcp
   ```

2. Install the plugin:
   ```
   /plugin install webmcp-skill@web-mcp
   ```

### Codex

Use the skill installer:

```
$skill-installer install https://github.com/ripulio/web-mcp/tree/main/packages/webmcp-skill/skills/webmcp
```

Then restart Codex to pick up the new skill.

### OpenCode

Add to your `opencode.json` (project root) or `~/.config/opencode/opencode.json` (global):

```json
{
  "plugin": ["webmcp-skill"]
}
```

The package will be auto-installed from npm at startup.

## Prerequisites

The LLM must have access to a tool that can execute JavaScript in a web page context. This could be:

- Browser automation (Puppeteer, Playwright, Selenium)
- Browser DevTools integration
- An MCP server with browser control capabilities

## Related Packages

- [`webmcp-polyfill`](../polyfill) - The polyfill that provides `navigator.modelContext`
- [`@ripul/web-mcp-extension`](../web-mcp-extension) - Chrome extension for injecting tools into web pages

## License

MIT
