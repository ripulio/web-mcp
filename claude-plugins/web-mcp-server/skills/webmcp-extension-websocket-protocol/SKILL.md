---
name: webmcp-extension-websocket-protocol
description: Use this to browse the web, control browser tabs, and execute WebMCP actions through the installed browser extension protocol.
---

# WebMCP Extension WebSocket Protocol

Use this to control browser tabs and execute WebMCP actions across pages through the extension protocol.

## Script-first quickstart

Harness scripts are included in `scripts/`:
- `webmcp_harness.ts`
- `webmcp_harness.py`

### TypeScript harness

```bash
cd claude-plugins/web-mcp-server/skills/webmcp-extension-websocket-protocol/scripts
npm install ws tsx
npx tsx webmcp_harness.ts list-tabs --pretty
```

### Python harness

```bash
cd claude-plugins/web-mcp-server/skills/webmcp-extension-websocket-protocol/scripts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 webmcp_harness.py list-tabs --pretty
```

## CLI commands (both harnesses)

Global flags:
- `--port <n>` (must be `8765-8785`)
- `--timeout-ms <n>` (default `70000`)
- `--session-id <id>`
- `--pretty`

Commands:
- `list-tabs`
- `open-tab --url <url> [--focus true|false]`
- `discover-tools --tab-id <id>`
- `call-tool --tab-id <id> --tool-name <name> --args-json '<json-object>'`

Examples:

```bash
npx tsx webmcp_harness.ts open-tab --url https://www.google.com --focus true --pretty
python3 webmcp_harness.py discover-tools --tab-id 123 --pretty
python3 webmcp_harness.py call-tool --tab-id 123 --tool-name search-products --args-json '{"query":"laptop"}' --pretty
```

## Transport model

- You run a local WebSocket server.
- The extension acts as the client and connects to `ws://localhost:<port>`.
- It scans ports `8765` through `8785` while browser control is enabled.

## Port range note

- The harness accepts only ports in `8765-8785`.
- If your chosen port is in use, pick a different port within that same range.

## Compact protocol reference

| Direction | Type | Purpose |
| --- | --- | --- |
| extension -> server | `ping` | Keepalive ping; reply with `pong`. |
| extension -> server | `connected` | Initial browser snapshot (`browser`, `tabs`). |
| extension -> server | `disconnected` | Connection/session ended. |
| extension -> server | `tabCreated` / `tabUpdated` / `tabClosed` / `tabFocused` | Tab lifecycle updates. |
| extension -> server | `toolsChanged` | Tool set changed for a tab. |
| extension -> server | `toolsDiscovered` | Response to `discoverTools` (`callId`). |
| extension -> server | `toolResult` | Response to `callTool` (`callId`, `result` or `error`). |
| server -> extension | `pong` | Reply to `ping`. |
| server -> extension | `connect` | Request browser snapshot. |
| server -> extension | `openTab` / `focusTab` / `closeTab` | Tab control commands. |
| server -> extension | `discoverTools` | Request tool list for `tabId` (`callId`). |
| server -> extension | `callTool` | Invoke page tool (`callId`, `tabId`, `toolName`, `args`). |

## Runtime requirements

- Auto-reply to `ping` with `pong`.
- Send `connect` and wait for `connected` before issuing commands.
- Track tab state from async events (`tabUpdated`, `tabClosed`, `toolsChanged`).
- Correlate `discoverTools`/`callTool` via `callId`.
- Correlate `openTab` flows via `requestId`.
- Exit nonzero on timeout or protocol errors.

## Manual message examples (reference)

Discover tools:
```json
{"type":"discoverTools","callId":"c1","tabId":123}
```
Expected:
```json
{"type":"toolsDiscovered","callId":"c1","tabId":123,"tools":[...]}
```

Call tool:
```json
{"type":"callTool","callId":"c2","tabId":123,"toolName":"tool-name","args":{"k":"v"}}
```
Expected:
```json
{"type":"toolResult","callId":"c2","result":{...}}
```
or
```json
{"type":"toolResult","callId":"c2","error":"..."}
```

## Guardrails

- Do not guess tool names or arguments. Discover first.
- Validate args against each tool `inputSchema`.
- Re-list tabs when IDs may be stale.
- Handle reconnects by re-running `connect` and rebuilding local state.
