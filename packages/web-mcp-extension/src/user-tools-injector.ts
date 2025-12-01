import 'webmcp-polyfill';

// Signal that polyfill is ready
window.postMessage({type: 'WEBMCP_INJECTOR_READY'}, '*');

// Listen for unregister requests from content script
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data.type === 'WEBMCP_UNREGISTER_TOOLS' && navigator.modelContext) {
    const toolNames: string[] = event.data.toolNames;
    for (const name of toolNames) {
      try {
        navigator.modelContext.unregisterTool(name);
      } catch (error) {
        console.error(`[WebMCP] Failed to unregister tool ${name}:`, error);
      }
    }
  }
});
