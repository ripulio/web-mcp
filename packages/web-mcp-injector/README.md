# Web MCP Injector

This package hosts the Chrome extension that injects the MCP agent bootstrap into eligible pages at runtime. It lives inside the `web-mcp` monorepo and is designed as a lightweight MV3 service worker that reads domain-specific injection configs and executes them via the `chrome.userScripts.execute` API.

## Project Structure

- `src/background.ts` – TypeScript service worker that matches URLs against `config/injection-config.ts` and injects the configured snippets in the page’s main world via `chrome.userScripts.execute`. This is the single entry point declared in `manifest.json`.
- `src/config` & `src/shared` – utilities and strongly typed config used by the background script.
- `scripts/clean.js` & `scripts/copy-static.js` – helper scripts used by the NPM build to clear `dist/` and copy non-TypeScript assets (JSON, config data, etc.).
- `tsconfig.json` – extends the monorepo base config to emit ES2022 service worker output with inline source maps under `dist/`.

## Development Workflow

```bash
cd packages/web-mcp-injector
npm install
npm run build   # runs clean, tsc, and copies static assets
npm test        # vitest unit tests (if/when added)
```

Because the service worker is authored in TypeScript, `tsc` outputs `dist/background.js` plus `.map` files. Static assets (configs, HTML, etc.) are copied verbatim by `scripts/copy-static.js`.

To iterate quickly, run `tsc -w` in one terminal and `node scripts/copy-static.js --watch` (or rerun manually) in another, then reload the unpacked extension from `packages/web-mcp-injector/dist`.

## Permissions & Manifest Notes

- Only `activeTab` and `userScripts` permissions are declared, along with `<all_urls>` host access for runtime matching.
- Because we rely on `chrome.userScripts.execute`, the minimum Chrome version is bumped to 135+ and users must enable either Developer Mode (Chrome < 138) or the “Allow User Scripts” toggle (Chrome ≥ 138) for the extension.
- The DevTools page was removed; all entry points now flow through the action/service worker.

## Outstanding Work

- Delete the legacy `src/devtools.*` files once SIP/xattr restrictions allow it; they are no longer referenced.
- Fill in Vitest suites that cover the config matcher helpers.
- Consider following the `web-mcp-devtools` package’s example by bundling via esbuild if the background worker grows more complex.
