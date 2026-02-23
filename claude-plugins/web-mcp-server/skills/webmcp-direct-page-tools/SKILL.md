---
name: webmcp-direct-page-tools
description: Use this to execute WebMCP tools on a webpage in a browser via `navigator.modelContext` when page-context JavaScript is available.
---

# WebMCP Direct Page Tools

Use this to perform actions on a webpage in a browser by calling that page's WebMCP tools through `navigator.modelContext`.

## Prerequisites

You need a tool that can:
1. Navigate to a page URL.
2. Execute JavaScript in that page context.
3. Return the JavaScript result.

## Discover available tools

```javascript
if (!navigator.modelContext) {
  return {error: 'Page does not expose WebMCP tools'};
}

const tools = [...navigator.modelContext.list()];
return tools;
```

Each tool includes:
- `name`
- `description`
- `inputSchema`

## Execute a tool

```javascript
if (!navigator.modelContext) {
  return {error: 'WebMCP not available on this page'};
}

const result = await navigator.modelContext.executeTool('tool-name', {
  // arguments matching inputSchema
});

if (result?.isError) {
  return {error: result.content?.[0]?.text ?? 'Tool execution failed'};
}

return result;
```

## Output handling

Prefer:
1. `structuredContent` when present.
2. `content` entries (`text`, `image`, `resource_link`).
3. `isError: true` as a failure path.

## Guardrails

- Always verify `navigator.modelContext` exists.
- Always run `list()` first; do not guess tool names or schemas.
- Validate arguments against `inputSchema` before execution.
- For browser-wide tab control, use the harness scripts in `webmcp-extension-websocket-protocol/scripts/`.
