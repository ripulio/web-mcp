import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import {type ToolDefinitionInfo} from '@ripul/web-mcp';

// Fetch tools from the current tab
async function fetchToolsFromTab(): Promise<ToolDefinitionInfo[]> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval<ToolDefinitionInfo[]>(
      `(function() {
        try {
          if (window.agent) {
            const tools = [...window.agent.tools.list()];
            return tools;
          }
          return [];
        } catch (e) {
          return [];
        }
      })()`,
      (result, isException) => {
        if (isException || !result) {
          resolve([]);
        } else {
          resolve(result);
        }
      }
    );
  });
}

async function executeTool(
  toolName: string,
  params: unknown
): Promise<unknown> {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(
      `(function() {
        return new Promise((resolve) => {
          window.dispatchEvent(
            new window.ToolCallEvent(${JSON.stringify(String(toolName))}, ${JSON.stringify(params)}, resolve)
          );
        });
      })()`,
      (result, isException) => {
        if (isException) {
          resolve({error: 'Tool execution failed'});
        } else {
          resolve(result);
        }
      }
    );
  });
}

function ToolForm({
  onCancel,
  onExecute
}: {
  onCancel: () => void;
  onExecute: () => void;
}) {
  return (
    <div className="tool-form">
      <div className="form-field">
        <label>Text Input:</label>
        <input type="text" placeholder="Enter value" />
      </div>
      <div className="form-field">
        <label>
          <input type="checkbox" />
          Checkbox option
        </label>
      </div>
      <div className="form-actions">
        <button onClick={onCancel} className="cancel-button">
          Cancel
        </button>
        <button onClick={onExecute} className="tool-run-button">
          Run
        </button>
      </div>
    </div>
  );
}

function ToolRow({tool}: {tool: ToolDefinitionInfo}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleRunClick = () => {
    setIsExpanded(true);
    setResult(null);
  };

  const handleCancel = () => {
    setIsExpanded(false);
    setResult(null);
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const toolResult = await executeTool(tool.name, {});
      setResult(toolResult);
    } finally {
      setIsExecuting(false);
      setIsExpanded(false);
    }
  };

  return (
    <div className="tool-row">
      <div className="tool-header">
        <div className="tool-info">
          <div className="tool-name">{tool.name}</div>
          <div className="tool-description">{tool.description}</div>
        </div>
        {!isExpanded && (
          <button onClick={handleRunClick} className="tool-run-button">
            Run
          </button>
        )}
      </div>

      {isExpanded && (
        <ToolForm onCancel={handleCancel} onExecute={handleExecute} />
      )}

      {isExecuting && (
        <div className="spinner-overlay">
          <div className="spinner"></div>
        </div>
      )}

      {result && (
        <div className="tool-result">
          <label>Result:</label>
          <textarea
            readOnly
            value={JSON.stringify(result, null, 2)}
            rows={10}
          />
        </div>
      )}
    </div>
  );
}

function Panel() {
  const [activeNav, setActiveNav] = useState('tools');
  const [tools, setTools] = useState<ToolDefinitionInfo[]>([]);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    const fetchedTools = await fetchToolsFromTab();
    setTools(fetchedTools);
  };

  return (
    <div className="panel-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-category">WebMCP</div>
        <div
          onClick={() => setActiveNav('tools')}
          className={`sidebar-nav-item ${activeNav === 'tools' ? 'active' : ''}`}
        >
          Tools
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {activeNav === 'tools' &&
          (tools.length === 0 ? (
            <div className="empty-state">No tools detected on this page</div>
          ) : (
            <div className="tools-container">
              <div className="tools-list">
                {tools.map((tool) => (
                  <ToolRow key={tool.name} tool={tool} />
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function main(): void {
  renderTools();

  chrome.devtools.network.onNavigated.addListener(() => {
    setTimeout(renderTools, 500);
  });
}

if (chrome.devtools) {
  main();
}

function renderTools() {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    render(<Panel />, rootEl);
  }
}
