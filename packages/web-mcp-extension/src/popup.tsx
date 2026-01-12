import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import type {TabToolState, ToolInvocation} from './shared.js';

function Popup() {
  const [tabState, setTabState] = useState<TabToolState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        fetchTabState(tab.id);
      } else {
        setLoading(false);
      }
    });
  }, []);

  const fetchTabState = async (tabId: number) => {
    const response = await chrome.runtime.sendMessage({
      type: 'WEBMCP_GET_TAB_STATE',
      tabId
    });
    setTabState(response.state);
    setLoading(false);
  };

  const openSettings = () => {
    chrome.tabs.create({url: chrome.runtime.getURL('panel.html')});
  };

  if (loading) {
    return (
      <div class="popup">
        <div class="popup-header">
          <h1 class="popup-title">WebMCP</h1>
        </div>
        <div class="popup-content">
          <p class="popup-loading">Loading...</p>
        </div>
      </div>
    );
  }

  const hasTools = tabState && tabState.injectedTools.length > 0;

  return (
    <div class="popup">
      <div class="popup-header">
        <h1 class="popup-title">WebMCP</h1>
        <button class="popup-settings-btn" onClick={openSettings} title="Open Settings">
          Settings
        </button>
      </div>

      {!hasTools ? (
        <div class="popup-empty">
          <p>No tools injected on this page</p>
        </div>
      ) : (
        <div class="popup-content">
          <ToolList
            tools={tabState.injectedTools}
            invocations={tabState.invocations}
          />
        </div>
      )}
    </div>
  );
}

interface ToolListProps {
  tools: string[];
  invocations: ToolInvocation[];
}

function ToolList({tools, invocations}: ToolListProps) {
  // Group invocations by tool
  const invocationsByTool = new Map<string, ToolInvocation[]>();
  for (const tool of tools) {
    invocationsByTool.set(tool, []);
  }
  for (const inv of invocations) {
    const list = invocationsByTool.get(inv.toolName);
    if (list) list.push(inv);
  }

  return (
    <div class="popup-tool-list">
      {tools.map((toolName) => (
        <ToolItem
          key={toolName}
          toolName={toolName}
          invocations={invocationsByTool.get(toolName) ?? []}
        />
      ))}
    </div>
  );
}

interface ToolItemProps {
  toolName: string;
  invocations: ToolInvocation[];
}

function ToolItem({toolName, invocations}: ToolItemProps) {
  const [expanded, setExpanded] = useState(false);
  const count = invocations.length;

  return (
    <div class="popup-tool-item">
      <div class="popup-tool-header" onClick={() => setExpanded(!expanded)}>
        <span class="popup-expand-icon">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span class="popup-tool-name">{toolName}</span>
        <span class="popup-invocation-count">
          {count} call{count !== 1 ? 's' : ''}
        </span>
      </div>

      {expanded && invocations.length > 0 && (
        <div class="popup-invocation-list">
          {invocations.map((inv) => (
            <InvocationItem key={inv.id} invocation={inv} />
          ))}
        </div>
      )}

      {expanded && invocations.length === 0 && (
        <div class="popup-no-invocations">No invocations yet</div>
      )}
    </div>
  );
}

interface InvocationItemProps {
  invocation: ToolInvocation;
}

function InvocationItem({invocation}: InvocationItemProps) {
  const [expanded, setExpanded] = useState(false);
  const duration = invocation.completedAt
    ? `${invocation.completedAt - invocation.startedAt}ms`
    : 'pending...';

  return (
    <div class={`popup-invocation-item ${invocation.isError ? 'error' : ''}`}>
      <div class="popup-invocation-header" onClick={() => setExpanded(!expanded)}>
        <span class="popup-invocation-time">
          {new Date(invocation.startedAt).toLocaleTimeString()}
        </span>
        <span class="popup-invocation-duration">{duration}</span>
        {invocation.isError && <span class="popup-error-badge">Error</span>}
      </div>

      {expanded && (
        <div class="popup-invocation-details">
          <div class="popup-detail-section">
            <strong>Arguments:</strong>
            <pre class="popup-code-block">
              {JSON.stringify(invocation.args, null, 2)}
            </pre>
          </div>
          {invocation.result !== null && (
            <div class="popup-detail-section">
              <strong>Result:</strong>
              <pre class="popup-code-block">
                {JSON.stringify(invocation.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  render(<Popup />, root);
}
