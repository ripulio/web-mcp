# Web MCP Agent Injection

This document summarizes the page-level `window.agent` bootstrap flow and how the Chrome extension delivers it after the TypeScript migration.

## Architecture Overview
- **Service worker (`src/background.ts`)** listens for completed tab navigations, matches site configs, and injects the bootstrap directly into the main world via `chrome.userScripts.execute`, reusing any existing MCP surface when possible.
- **Injected page script** ensures `window.ToolCallEvent`, a compatible `AgentToolRegistry`, and the `toolcall` listener exist. If the page already defined them, the injector skips re-creation. After the surface is ready it runs the configuration snippets.
- **Configuration (`src/config/sites/*.ts`)** lists `{ id, matches, matchers, code }` entries. When a tab URL matches a user script's patterns, its snippet executes inside the page with `(agent)` provided, allowing tools or hooks to be registered idempotently.

## AgentToolRegistry API
The shimmed registry mirrors `@ripul/web-mcp` and exposes:
- `define(definition)` — Registers a tool (duplicate names overwrite previous entries).
- `get(name)` — Retrieves a registered tool.
- `list()` — Lists tool metadata without the `execute` function.
- `whenDefined(name)` — Resolves once the tool is available (immediately if already present).

Tool execution stays inside the page. Snippets calling `agent.tools.define` must provide an `execute` function that returns an MCP `CallToolResult`. The service worker does not proxy execution; it only seeds the registry and runs snippets.

## Lifecycle Notes & Recommendations
- **Agent reuse**: Because the injector respects pre-existing MCP shims, snippets should guard registrations (`if (!agent.tools.get("<name>"))`) to avoid duplicate definitions during reinjection or multi-config matches.
- **Shim installation**: When the page lacks an MCP surface, the injector creates one and marks that it installed the event listener to prevent duplicates on later runs.
- **Multiple configs**: If several configs match the same URL they run sequentially. Snippets should not rely on relative order and must remain self-contained.
- **SPA navigations**: The injector fires on every completed navigation event (including SPA route changes). Snippets should detect prior initialization (`agent.tools.get(...)`) and reuse their work to avoid redundant DOM parsing.

## Manual Validation Checklist
1. Run `npm run build --workspace web-mcp-injector` and load the `packages/web-mcp-injector/dist/` directory as an unpacked extension in Chrome.
2. Navigate to a supported page (e.g., Google Search results).
3. In DevTools console run `window.agent.tools.list()` and confirm the expected tools are present.
4. Execute a tool (e.g., `await window.agent.tools.get("google_search_list_results").execute({ maxResults: 3 })`) and verify the structured response.
5. Inspect the service worker logs in `chrome://extensions/?id=<extension-id>` should injection fail; look for warnings about shim creation or snippet errors.
