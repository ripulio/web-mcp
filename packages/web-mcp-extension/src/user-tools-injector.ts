import '@ripul/web-mcp';
import {registry} from '@ripul/web-mcp-tools';
import type {ToolGroupState} from './shared.js';

(async () => {
  if (!window.agent) {
    console.warn(
      '[WebMCP DevTools] window.agent not available, user tools not registered'
    );
    window.postMessage({type: 'WEBMCP_USER_TOOLS_READY'}, '*');
    return;
  }

  const currentDomain = window.location.hostname;
  const currentPath = window.location.pathname;

  const result = await chrome.storage.sync.get<{
    enabledToolGroups: ToolGroupState;
  }>(['enabledToolGroups']);
  const enabledToolGroups = result.enabledToolGroups || {};

  for (const entry of registry) {
    const domainMatches = entry.domains.some(
      (domain) => currentDomain === domain
    );

    if (!domainMatches) {
      continue;
    }

    const isEnabled = enabledToolGroups[entry.id] ?? true;

    if (!isEnabled) {
      console.log(
        `[WebMCP DevTools] Skipping disabled tool group: ${entry.id} (${entry.domains.join(', ')})`
      );
      continue;
    }

    for (const toolBinding of entry.tools) {
      const pathMatches =
        !toolBinding.pathMatches || toolBinding.pathMatches(currentPath);

      if (pathMatches) {
        try {
          window.agent.tools.define(toolBinding.tool);
          console.log(
            `[WebMCP DevTools] Registered user tool: ${toolBinding.tool.name}`
          );
        } catch (error) {
          console.error(
            `[WebMCP DevTools] Failed to register tool ${toolBinding.tool.name}:`,
            error
          );
        }
      }
    }
  }

  // Signal that user tools are ready
  window.postMessage({type: 'WEBMCP_USER_TOOLS_READY'}, '*');
})();
