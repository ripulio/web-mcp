import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import {type ToolDefinitionInfo} from '@ripul/web-mcp';
import {dset} from 'dset';

async function ensureContentScript(): Promise<void> {
  const tabId = chrome.devtools.inspectedWindow.tabId;

  try {
    await chrome.tabs.sendMessage(tabId, {type: 'PING'});
  } catch {
    await chrome.scripting.executeScript({
      target: {tabId},
      files: ['content.js']
    });
  }
}

async function fetchToolsFromTab(): Promise<ToolDefinitionInfo[]> {
  await ensureContentScript();

  const tabId = chrome.devtools.inspectedWindow.tabId;

  const response = await chrome.tabs.sendMessage(tabId, {type: 'FETCH_TOOLS'});

  if (chrome.runtime.lastError) {
    return [];
  }

  return response.tools;
}

async function executeTool(
  toolName: string,
  params: unknown
): Promise<unknown> {
  await ensureContentScript();

  const tabId = chrome.devtools.inspectedWindow.tabId;

  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'EXECUTE_TOOL',
    toolName,
    params
  });

  if (chrome.runtime.lastError) {
    return {error: chrome.runtime.lastError.message};
  }

  return response?.result;
}

interface StringSchemaLike {
  type: 'string';
  description?: string;
}

interface NumberSchemaLike {
  type: 'number';
  description?: string;
}

interface BooleanSchemaLike {
  type: 'boolean';
  description?: string;
}

interface ObjectSchemaLike {
  type: 'object';
  properties: Record<string, SchemaLike>;
  required?: string[];
  description?: string;
}

interface ArraySchemaLike {
  type: 'array';
  items: SchemaLike;
  description?: string;
}

type SchemaLike =
  | StringSchemaLike
  | NumberSchemaLike
  | BooleanSchemaLike
  | ObjectSchemaLike
  | ArraySchemaLike;

function ToolFormSchema({
  schema,
  value,
  onChange,
  path = []
}: {
  schema: unknown;
  value: unknown;
  onChange: (path: string[], newValue: unknown) => void;
  path?: string[];
}) {
  if (typeof schema !== 'object' || schema === null) {
    return null;
  }

  const asSchema = schema as SchemaLike;

  switch (asSchema.type) {
    case 'string':
      return (
        <div className="form-field">
          {asSchema.description && <label>{asSchema.description}</label>}
          <input
            type="text"
            placeholder="Enter text"
            value={(value as string) ?? ''}
            onInput={(e) =>
              onChange(path, (e.target as HTMLInputElement).value)
            }
          />
        </div>
      );
    case 'number':
      return (
        <div className="form-field">
          {asSchema.description && <label>{asSchema.description}</label>}
          <input
            type="number"
            placeholder="Enter number"
            value={(value as number) ?? ''}
            onInput={(e) =>
              onChange(path, parseFloat((e.target as HTMLInputElement).value))
            }
          />
        </div>
      );
    case 'boolean':
      return (
        <div className="form-field">
          <label>
            <input
              type="checkbox"
              checked={(value as boolean) ?? false}
              onChange={(e) =>
                onChange(path, (e.target as HTMLInputElement).checked)
              }
            />
            {asSchema.description ?? ''}
          </label>
        </div>
      );
    case 'object':
      return (
        <div className="form-object">
          {asSchema.description && (
            <div className="form-description">{asSchema.description}</div>
          )}
          {Object.entries(asSchema.properties).map(([key, propSchema]) => (
            <div key={key}>
              <h3>{key}</h3>
              <ToolFormSchema
                schema={propSchema}
                value={(value as Record<string, unknown>)?.[key]}
                onChange={onChange}
                path={[...path, key]}
              />
            </div>
          ))}
        </div>
      );
    case 'array':
      return (
        <div className="form-field">
          {asSchema.description && <label>{asSchema.description}</label>}
          TODO
        </div>
      );
    default:
      return null;
  }
}

function ToolForm({
  tool,
  onCancel,
  onExecute
}: {
  tool: ToolDefinitionInfo;
  onCancel: () => void;
  onExecute: (params: unknown) => void;
}) {
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  const handleChange = (path: string[], newValue: unknown) => {
    setFormData((prev) => {
      const updated = {...prev};
      dset(updated, path.join('.'), newValue);
      return updated;
    });
  };

  const handleExecute = () => {
    onExecute(formData);
  };

  return (
    <div className="tool-form">
      <ToolFormSchema
        schema={tool.inputSchema}
        value={formData}
        onChange={handleChange}
      />
      <div className="form-actions">
        <button onClick={onCancel} className="cancel-button">
          Cancel
        </button>
        <button onClick={handleExecute} className="tool-run-button">
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

  const handleExecute = async (params: unknown) => {
    setIsExecuting(true);
    try {
      const toolResult = await executeTool(tool.name, params);
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
        <ToolForm
          tool={tool}
          onCancel={handleCancel}
          onExecute={handleExecute}
        />
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
