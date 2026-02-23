---
name: webmcp-direct-page-tools
description: Use this to execute WebMCP tools on a webpage in a browser via `navigator.modelContext` when page-context JavaScript is available.
---

# WebMCP Direct Page Tools

Use this to perform actions on a webpage in a browser by calling that page's WebMCP tools through `navigator.modelContext`.

Use this skill for page-scoped actions in one tab. For browser-wide tab control across ports `8765-8785`, use `/Users/eoghan/repos/web-mcp/claude-plugins/web-mcp-server/skills/webmcp-extension-websocket-protocol/SKILL.md`.

## Prerequisites

You need an execution path that can:
1. Navigate to a page URL.
2. Execute JavaScript in that page context.
3. Return structured JSON from the JavaScript result.

## Discover available tools

```javascript
const NOT_AVAILABLE = 'WebMCP tools are not available on this page';

if (!navigator.modelContext) {
  return {error: NOT_AVAILABLE};
}

const tools = [...navigator.modelContext.list()];
return {count: tools.length, tools};
```

Each tool includes:
- `name`
- `description`
- `inputSchema`

## Validate arguments before execution

```javascript
const NOT_AVAILABLE = 'WebMCP tools are not available on this page';
const toolName = 'tool-name';
const args = {
  // candidate args
};

if (!navigator.modelContext) {
  return {error: NOT_AVAILABLE};
}

const tools = [...navigator.modelContext.list()];
const tool = tools.find((item) => item.name === toolName);
if (!tool) {
  return {error: `Tool not found in list(): ${toolName}`};
}

const required = Array.isArray(tool.inputSchema?.required)
  ? tool.inputSchema.required
  : [];
const missing = required.filter((key) => !(key in args));

if (missing.length > 0) {
  return {error: `Missing required args: ${missing.join(', ')}`};
}

return {ok: true, toolName, args};
```

This snippet is a minimum preflight check for required fields. If your runtime has a JSON Schema validator, use it for full `inputSchema` validation.

## Execute a tool

```javascript
const NOT_AVAILABLE = 'WebMCP tools are not available on this page';

if (!navigator.modelContext) {
  return {error: NOT_AVAILABLE};
}

const result = await navigator.modelContext.executeTool('tool-name', {
  // args validated against inputSchema
});

if (result?.isError) {
  return {error: result.content?.[0]?.text ?? 'Tool execution failed', result};
}

return result;
```

## Output handling

Prefer:
1. `structuredContent` when present.
2. `content` entries (`text`, `image`, `resource_link`).
3. `isError: true` as a failure path.

Example:

```javascript
const preferred =
  result?.structuredContent ??
  result?.content?.find((item) => item?.type === 'text')?.text ??
  result?.content ??
  null;

return preferred;
```

## Guardrails

- Always verify `navigator.modelContext` exists.
- Always run `list()` first; do not guess tool names or schemas.
- Validate args against each tool `inputSchema` before `executeTool`.
- If a result is large, first re-run with narrower scope (filters, limits, smaller date range).
- If a large result is unavoidable, return a concise summary plus a clearly marked truncated payload.
- For browser-wide tab control, use the harness scripts in `/Users/eoghan/repos/web-mcp/claude-plugins/web-mcp-server/skills/webmcp-extension-websocket-protocol/scripts/`.
