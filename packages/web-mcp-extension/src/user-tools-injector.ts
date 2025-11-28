import 'webmcp-polyfill';
import type {EnabledToolGroups} from './shared.js';

const registeredTools = new Set<string>();

function updateTools(
  enabledToolGroups: EnabledToolGroups,
  currentDomain: string,
  currentPath: string
) {
  if (!navigator.modelContext) {
    console.warn(
      '[WebMCP] navigator.modelContext not available, user tools not registered'
    );
    return;
  }

  const toolsToRegister = new Set<string>();

  for (const toolGroup of Object.values(enabledToolGroups)) {
    const domainMatches = toolGroup.domains.some(
      (domain) => currentDomain === domain
    );

    if (!domainMatches) {
      continue;
    }

    const pathMatches =
      !toolGroup.pathPattern ||
      new RegExp(toolGroup.pathPattern).test(currentPath);

    if (pathMatches) {
      for (const tool of toolGroup.tools) {
        try {
          // TODO (jg): user scripts
          const toolFn = new Function('return ' + tool.source);
          const toolObject = toolFn();

          navigator.modelContext.registerTool(toolObject);
          toolsToRegister.add(toolObject.name);
        } catch (error) {
          console.error(
            `[WebMCP DevTools] Failed to register tool from group ${toolGroup.name}:`,
            error
          );
        }
      }
    }
  }

  for (const toolName of registeredTools) {
    if (!toolsToRegister.has(toolName)) {
      try {
        navigator.modelContext.unregisterTool(toolName);
      } catch (error) {
        console.error(`[WebMCP] Failed to unregister tool ${toolName}:`, error);
      }
    }
  }

  registeredTools.clear();
  for (const toolName of toolsToRegister) {
    registeredTools.add(toolName);
  }
}

window.postMessage({type: 'WEBMCP_INJECTOR_READY'}, '*');

window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.type === 'WEBMCP_UPDATE_TOOLS') {
    const {enabledToolGroups, currentDomain, currentPath} = event.data;
    updateTools(enabledToolGroups, currentDomain, currentPath);
  }
});
