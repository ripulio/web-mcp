import '@ripul/web-mcp';
import {registry} from '@ripul/web-mcp-tools';
import type {ToolGroupState} from './shared.js';

function updateTools(
  enabledToolGroups: ToolGroupState,
  currentDomain: string,
  currentPath: string
) {
  if (!navigator.modelContext) {
    console.warn(
      '[WebMCP DevTools] navigator.modelContext not available, user tools not registered'
    );
    return;
  }

  for (const entry of registry) {
    const domainMatches = entry.domains.some(
      (domain) => currentDomain === domain
    );

    if (!domainMatches) {
      continue;
    }

    const isEnabled = enabledToolGroups[entry.id] !== false;

    for (const toolBinding of entry.tools) {
      const pathMatches =
        !toolBinding.pathMatches || toolBinding.pathMatches(currentPath);

      if (isEnabled && pathMatches) {
        try {
          navigator.modelContext.registerTool(toolBinding.tool);
        } catch (error) {
          console.error(
            `[WebMCP DevTools] Failed to register tool ${toolBinding.tool.name}:`,
            error
          );
        }
      } else {
        try {
          navigator.modelContext.unregisterTool(toolBinding.tool.name);
        } catch (error) {
          console.error(
            `[WebMCP DevTools] Failed to remove tool ${toolBinding.tool.name}:`,
            error
          );
        }
      }
    }
  }
}

window.postMessage({type: 'WEBMCP_INJECTOR_READY'}, '*');

window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.type === 'WEBMCP_UPDATE_TOOLS') {
    const {enabledToolGroups, currentDomain, currentPath} = event.data;
    updateTools(enabledToolGroups, currentDomain, currentPath);
  }
});
