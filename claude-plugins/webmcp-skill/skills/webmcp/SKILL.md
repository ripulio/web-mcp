---
name: webmcp
description: Instructions for discovering and executing WebMCP tools exposed by web pages. Only use this skill when you have tools available for executing javascript in a browser's page context. This skill details how to invoke WebMCP tools to efficiently interact with web pages.
---

# WebMCP

Use this skill when you can execute JavaScript in a web page context (via browser automation, DevTools, or similar) and want to interact with tools exposed via the `navigator.modelContext` API.

## Prerequisites

You need a tool that can:
1. Navigate to a web page URL
2. Execute JavaScript code in that page's context
3. Return the results of that JavaScript execution

## Discovering Available Tools

Before calling any tools, discover what the page exposes:

```javascript
if (!navigator.modelContext) {
  return { error: 'Page does not expose WebMCP tools' };
}

const tools = [...navigator.modelContext.list()];
return JSON.stringify(tools, null, 2);
```

Each tool in the list has:
- `name` - Tool identifier to use when executing
- `description` - What the tool does
- `inputSchema` - JSON Schema defining parameters

Example output:
```json
[
  {
    "name": "search-products",
    "description": "Search for products by query",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "Search query" },
        "limit": { "type": "number", "description": "Max results" }
      },
      "required": ["query"]
    }
  }
]
```

## Executing a Tool

Call a tool by name with arguments matching its `inputSchema`:

```javascript
return await navigator.modelContext.executeTool('tool-name', {
  // arguments matching inputSchema
});
```

## Result Format

Tool results follow this structure:

```ts
{
  content: [
    { type: 'text', text: '...' },
    // or { type: 'image', data: '...base64...', mimeType: 'image/png' }
    // or { type: 'resource_link', uri: '...', name: '...' }
  ],
  isError?: boolean,          // true if execution failed
  structuredContent?: {...}   // optional structured data
}
```

Common content types:
- `text` - Plain text response
- `image` - Base64-encoded image with mimeType
- `resource_link` - Link to external resource

## Error Handling

Check for errors in the result:

```javascript
const result = await navigator.modelContext.executeTool('tool-name', args);

if (result.isError) {
  // Error details in result.content[0].text
  return { error: result.content[0].text };
}

return result;
```

Errors occur when:
- Tool name doesn't exist: `"Tool not found: <name>"`
- Tool execution throws: `"Error executing tool <name>: <message>"`

## Complete Workflow Example

```javascript
// 1. Check for WebMCP support
if (!navigator.modelContext) {
  return { error: 'WebMCP not available on this page' };
}

// 2. List available tools
const tools = [...navigator.modelContext.list()];
console.log('Available tools:', tools.map(t => t.name));

// 3. Find and inspect a specific tool
const searchTool = tools.find(t => t.name === 'search-products');
if (!searchTool) {
  return { error: 'search-products tool not found' };
}
console.log('Schema:', searchTool.inputSchema);

// 4. Execute the tool
const result = await navigator.modelContext.executeTool('search-products', {
  query: 'laptop',
  limit: 5
});

// 5. Handle the result
if (result.isError) {
  return { error: result.content[0].text };
}

return result.structuredContent || result.content;
```

## Tips

- Always check if `navigator.modelContext` exists before using it
- Use `list()` first to discover available tools and their schemas
- Validate arguments against `inputSchema` before calling `executeTool`
- Check `isError` on every result before processing
- Prefer `structuredContent` when available for programmatic access
