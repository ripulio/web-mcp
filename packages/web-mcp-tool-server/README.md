# web-mcp-tool-server

Local HTTP server for serving WebMCP tool files.

## Installation

```bash
# Run directly with npx (no installation required)
npx @ripulio/web-mcp-tool-server [options] <directory>

# Or install globally
npm install -g @ripulio/web-mcp-tool-server
web-mcp-tool-server [options] <directory>
```

## Usage

```bash
web-mcp-tool-server [options] <directory>
```

### Options

- `-p, --port <port>` - Port to listen on (default: 3000)
- `-H, --host <host>` - Host to bind to (default: localhost)
- `-w, --watch` - Watch for file changes and reload
- `-h, --help` - Show help message

### Example

```bash
npx @ripulio/web-mcp-tool-server -w ./tools
```

## How It Works

The tool server scans a directory for tool groups and their tools, then exposes them via a REST API. Each group is a subdirectory containing:

1. A `{group}.meta.json` file with group metadata
2. One or more tool files (`.js`) with corresponding `.meta.json` metadata files

When a browser extension or other client connects, it can discover available tools through the API and fetch their source code to execute.

## API

### `GET /api/groups` - List all groups

```json
[
  {
    "id": "example-group",
    "name": "Example Group",
    "description": "A collection of example tools"
  }
]
```

### `GET /api/groups/:id` - Get group by id

```json
{
  "id": "example-group",
  "name": "Example Group",
  "description": "A collection of example tools"
}
```

### `GET /api/tools` - List all tools

```json
[
  {
    "id": "example-group/my-tool",
    "name": "My Tool",
    "description": "Does something useful",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string" }
      },
      "required": ["query"]
    }
  }
]
```

### `GET /api/tools/:id` - Get tool metadata

```json
{
  "id": "example-group/my-tool",
  "name": "My Tool",
  "description": "Does something useful",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  }
}
```

### `GET /api/tools/:id/source` - Get tool source code

Returns the JavaScript source code as `text/javascript`.

## Directory Structure

```
tools/
  {group}/
    {group}.meta.json      # Group metadata
    {tool}.meta.json       # Tool metadata (JSON Schema)
    {tool}.js              # Tool source (must be compiled JS, not TypeScript)
```

**Note:** Tool source files must be `.js` files containing compiled JavaScript. If you write tools in TypeScript, compile them to JavaScript before serving.
