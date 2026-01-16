# web-mcp-tool-server

Local HTTP server for serving WebMCP tool files.

## Usage

```bash
npx @ripulio/web-mcp-tool-server [options] <directory>
```

### Options

- `-p, --port <port>` - Port to listen on (default: 3000)
- `-h, --host <host>` - Host to bind to (default: localhost)
- `-w, --watch` - Watch for file changes and reload

### Example

```bash
npx @ripulio/web-mcp-tool-server -w ./tools
```

## API

- `GET /api/groups` - List all groups
- `GET /api/groups/:id` - Get group by id
- `GET /api/tools` - List all tools
- `GET /api/tools/:id` - Get tool metadata
- `GET /api/tools/:id/source` - Get tool source code

## Directory Structure

```
tools/
  {group}/
    {group}.meta.json
    {tool}.meta.json
    {tool}.js
```
