import type {ToolDefinitionInfo} from '@ripul/web-mcp';

window.addEventListener('message', (event: MessageEvent) => {
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

    if (window.ToolCallEvent) {
      window.dispatchEvent(
        new window.ToolCallEvent(toolName, params, callback)
      );
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
      if (window.agent) {
        tools = [...window.agent.tools.list()];
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

window.postMessage({type: 'WEBMCP_BRIDGE_READY'}, '*');
