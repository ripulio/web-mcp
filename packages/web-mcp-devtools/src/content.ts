import type {ToolCallEventInfo} from './types.js';
import type {CallToolResult} from '@ripul/web-mcp';

const bridgeReadyPromise = new Promise<void>((resolve) => {
  if (document.documentElement.hasAttribute('data-webmcp-bridge-injected')) {
    resolve();
    return;
  }

  const handleBridgeReady = (event: MessageEvent) => {
    if (event.source === window && event.data.type === 'WEBMCP_BRIDGE_READY') {
      window.removeEventListener('message', handleBridgeReady);
      resolve();
    }
  };

  window.addEventListener('message', handleBridgeReady);

  const bridgeScript = document.createElement('script');
  bridgeScript.src = chrome.runtime.getURL('bridge.js');
  bridgeScript.type = 'module';
  document.documentElement.appendChild(bridgeScript);
  document.documentElement.setAttribute('data-webmcp-bridge-injected', 'true');
});

const pendingCalls = new Map<string, (response: unknown) => void>();
const toolCallEvents: Array<ToolCallEventInfo> = [];
const pendingToolCalls = new Map<string, ToolCallEventInfo>();

type ToolEvent =
  | {type: 'TOOL_RESULT'; callId: string; result: unknown}
  | {type: 'TOOLS_RESULT'; callId: string; tools: unknown[]}
  | {
      type: 'EXECUTE_TOOL_REQUEST';
      callId: string;
      toolName: string;
      params: unknown;
    }
  | {type: 'FETCH_TOOLS_REQUEST'; callId: string}
  | {
      type: 'TOOLCALL_EVENT';
      timestamp: number;
      toolName: string;
      params: unknown;
    }
  | {type: 'TOOLCALL_RESULT'; toolName: string; result: CallToolResult};
type ToolRequest =
  | {type: 'EXECUTE_TOOL'; toolName: string; params: unknown}
  | {type: 'FETCH_TOOLS'}
  | {type: 'FETCH_EVENTS'}
  | {type: 'PING'};

window.addEventListener('message', (event: MessageEvent<ToolEvent>) => {
  if (event.source !== window) {
    return;
  }

  const {type} = event.data;

  if (type === 'TOOLCALL_EVENT') {
    const toolEvent: ToolCallEventInfo = {
      timestamp: event.data.timestamp,
      toolName: event.data.toolName,
      params: event.data.params,
      result: undefined
    };
    toolCallEvents.push(toolEvent);
    pendingToolCalls.set(event.data.toolName, toolEvent);
    return;
  }

  if (type === 'TOOLCALL_RESULT') {
    const toolEvent = pendingToolCalls.get(event.data.toolName);
    if (toolEvent) {
      toolEvent.result = event.data.result;
      pendingToolCalls.delete(event.data.toolName);
    }
    return;
  }

  if (type === 'TOOL_RESULT') {
    const sendResponse = pendingCalls.get(event.data.callId);
    if (sendResponse) {
      sendResponse({result: event.data.result});
      pendingCalls.delete(event.data.callId);
    }
  } else if (type === 'TOOLS_RESULT') {
    const sendResponse = pendingCalls.get(event.data.callId);
    if (sendResponse) {
      sendResponse({tools: event.data.tools});
      pendingCalls.delete(event.data.callId);
    }
  }
});

function handleRequest(
  request: ToolRequest,
  sendResponse: (response: unknown) => void
) {
  const callId = crypto.randomUUID();

  if (request.type === 'EXECUTE_TOOL') {
    pendingCalls.set(callId, sendResponse);
    window.postMessage(
      {
        type: 'EXECUTE_TOOL_REQUEST',
        callId: callId,
        toolName: request.toolName,
        params: request.params
      } satisfies ToolEvent,
      '*'
    );
  } else if (request.type === 'FETCH_TOOLS') {
    pendingCalls.set(callId, sendResponse);
    window.postMessage(
      {
        type: 'FETCH_TOOLS_REQUEST',
        callId: callId
      } satisfies ToolEvent,
      '*'
    );
  }
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({pong: true});
    return true;
  }

  if (request.type === 'FETCH_EVENTS') {
    sendResponse({events: toolCallEvents});
    return true;
  }

  bridgeReadyPromise.then(() => {
    handleRequest(request, sendResponse);
  });

  return true;
});
