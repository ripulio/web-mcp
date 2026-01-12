import type {ToolDefinition} from 'webmcp-polyfill';
import 'webmcp-polyfill';

// Helper to safely serialize objects for postMessage
function sanitizeForMessage(obj: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return {_serializationError: true, value: String(obj)};
  }
}

// Wrap registerTool to intercept tool invocations
// The polyfill guarantees navigator.modelContext exists after import
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const modelContext = navigator.modelContext!;
const originalRegisterTool = modelContext.registerTool.bind(modelContext);

modelContext.registerTool = (tool: ToolDefinition) => {
  const originalExecute = tool.execute;

  const wrappedTool: ToolDefinition = {
    ...tool,
    execute: async (args: unknown) => {
      const invocationId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // Notify invocation start
      window.postMessage(
        {
          type: 'WEBMCP_TOOL_INVOCATION_START',
          toolName: tool.name,
          args: sanitizeForMessage(args),
          invocationId
        },
        '*'
      );

      try {
        const result = await originalExecute.call(tool, args);

        // Notify invocation success
        window.postMessage(
          {
            type: 'WEBMCP_TOOL_INVOCATION_END',
            invocationId,
            result: sanitizeForMessage(result),
            isError: result.isError ?? false
          },
          '*'
        );

        return result;
      } catch (error) {
        // Notify invocation error
        window.postMessage(
          {
            type: 'WEBMCP_TOOL_INVOCATION_END',
            invocationId,
            result: {
              content: [{type: 'text', text: String(error)}],
              isError: true
            },
            isError: true
          },
          '*'
        );
        throw error;
      }
    }
  };

  originalRegisterTool(wrappedTool);
};

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
