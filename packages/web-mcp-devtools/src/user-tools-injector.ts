import '@ripul/web-mcp';
import {registry} from '@ripul/web-mcp-tools';

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

  // Check which tools are enabled from storage
  // This will be injected via a script tag, so we need to communicate with the content script
  // For now, let's register all matching tools (we'll add enable/disable later)

  for (const entry of registry) {
    const domainMatches = entry.domains.some(
      (domain) => currentDomain === domain
    );

    if (!domainMatches) {
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
