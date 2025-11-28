import type {ToolDefinitionInfo} from 'webmcp-polyfill';

window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source !== window) return;

  if (event.data.type === 'EXECUTE_TOOL_REQUEST') {
    const {callId, toolName, params} = event.data;

    const callback = (result: unknown) => {
      window.postMessage(
        {
          type: 'TOOL_RESULT',
          callId: callId,
          result: result
        },
        '*'
      );
    };

    if (navigator.modelContext) {
      const result = await navigator.modelContext.executeTool(toolName, params);
      callback(result);
    } else {
      callback({
        isError: true,
        content: [{type: 'text', text: 'ToolCallEvent not available on page'}]
      });
    }
  }

  if (event.data.type === 'FETCH_TOOLS_REQUEST') {
    const {callId} = event.data;
    let tools: ToolDefinitionInfo[] = [];

    try {
      if (navigator.modelContext) {
        tools = [...navigator.modelContext.list()];
      }
    } catch (e) {
      // do nothing
    }

    window.postMessage(
      {
        type: 'TOOLS_RESULT',
        callId: callId,
        tools
      },
      '*'
    );
  }
});

if (navigator.modelContext) {
  const original = navigator.modelContext.executeTool;

  navigator.modelContext.executeTool = async (toolName, params) => {
    window.postMessage(
      {
        type: 'TOOLCALL_EVENT',
        timestamp: Date.now(),
        toolName,
        params
      },
      '*'
    );

    const result = await original.call(
      navigator.modelContext,
      toolName,
      params
    );

    window.postMessage(
      {
        type: 'TOOLCALL_RESULT',
        toolName,
        result: result
      },
      '*'
    );

    return result;
  };
}

window.postMessage({type: 'WEBMCP_BRIDGE_READY'}, '*');
