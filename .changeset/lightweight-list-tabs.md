---
"@ripulio/web-mcp-server": minor
---

Add `get_tab` action and make `list_tabs` lightweight

- `list_tabs` now returns only `{id, title, url}` without tools
- New `get_tab` action returns full tab details including tools
