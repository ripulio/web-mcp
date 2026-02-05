# @ripulio/web-mcp-server

## 0.1.0

### Minor Changes

- 9adbcf5: Add `get_tab` action and make `list_tabs` lightweight
  - `list_tabs` now returns only `{id, title, url}` without tools
  - New `get_tab` action returns full tab details including tools

## 0.0.4

### Patch Changes

- a1a49f0: Remove another accidental readonly.
- 7a2807c: Make non-maps writable
- e27b9b8: Make session properties readonly

## 0.0.3

### Patch Changes

- f5f62c4: Default to public access.

## 0.0.2

### Patch Changes

- 61d514c: Rename server to web-mcp-server.
