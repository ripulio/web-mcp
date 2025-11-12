import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';
import {type ToolDefinitionInfo} from '@ripul/web-mcp';
import {dset} from 'dset';
import type {ToolCallEventInfo} from './types.js';
import {registry, type ToolRegistryEntry} from '@ripul/web-mcp-tools';

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

async function waitForToolsReady(): Promise<void> {
  await ensureContentScript();

  const tabId = chrome.devtools.inspectedWindow.tabId;

  await chrome.tabs.sendMessage(tabId, {type: 'WAIT_FOR_TOOLS_READY'});
}

async function fetchToolsFromTab(): Promise<ToolDefinitionInfo[]> {
  await waitForToolsReady();

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

async function fetchEventsFromTab(): Promise<ToolCallEventInfo[]> {
  await ensureContentScript();

  const tabId = chrome.devtools.inspectedWindow.tabId;

  const response = await chrome.tabs.sendMessage(tabId, {type: 'FETCH_EVENTS'});

  if (chrome.runtime.lastError) {
    return [];
  }

  return response.events || [];
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
    <>
      <div className="table-cell">{tool.name}</div>
      <div className="table-cell">{tool.description}</div>
      <div className="table-cell table-cell-action">
        {!isExpanded && (
          <button onClick={handleRunClick} className="tool-run-button">
            Run
          </button>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="table-expanded-cell"></div>
          <div className="table-expanded-cell">
            <ToolForm
              tool={tool}
              onCancel={handleCancel}
              onExecute={handleExecute}
            />
          </div>
          <div className="table-expanded-cell"></div>
        </>
      )}

      {isExecuting && (
        <div className="spinner-overlay">
          <div className="spinner"></div>
        </div>
      )}

      {result && (
        <>
          <div className="table-expanded-cell"></div>
          <div className="table-expanded-cell">
            <div className="tool-result">
              <label>Result:</label>
              <textarea
                readOnly
                value={JSON.stringify(result, null, 2)}
                rows={10}
              />
            </div>
          </div>
          <div className="table-expanded-cell"></div>
        </>
      )}
    </>
  );
}

function EventRow({event}: {event: ToolCallEventInfo}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <>
      <div
        className="table-cell table-cell-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {formatTimestamp(event.timestamp)}
      </div>
      <div
        className="table-cell table-cell-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {event.toolName}
      </div>
      <div
        className="table-cell table-cell-expand table-cell-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? '▼' : '▶'}
      </div>
      {isExpanded && (
        <>
          <div className="table-expanded-cell"></div>
          <div className="table-expanded-cell">
            <div className="event-details">
              <div className="detail-section">
                <label>Parameters:</label>
                <textarea
                  readOnly
                  value={JSON.stringify(event.params, null, 2)}
                  rows={5}
                />
              </div>
              {event.result && (
                <div className="detail-section">
                  <label>Result:</label>
                  <textarea
                    readOnly
                    value={JSON.stringify(event.result, null, 2)}
                    rows={5}
                    className={event.result.isError ? 'error' : ''}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="table-expanded-cell"></div>
        </>
      )}
    </>
  );
}

interface UserToolState {
  [key: string]: boolean;
}

function UserToolRow({
  entry,
  index,
  enabled,
  onToggle
}: {
  entry: ToolRegistryEntry;
  index: number;
  enabled: boolean;
  onToggle: (index: number, enabled: boolean) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <div
        className="table-cell table-cell-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {entry.domains.join(', ')}
      </div>
      <div
        className="table-cell table-cell-clickable"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {entry.tools.map((tb) => tb.tool.name).join(', ')}
      </div>
      <div className="table-cell table-cell-action">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(index, (e.target as HTMLInputElement).checked)}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>
      {isExpanded && (
        <>
          <div className="table-expanded-cell"></div>
          <div className="table-expanded-cell">
            <div className="user-tool-details">
              <div className="detail-section">
                <label>Domains:</label>
                <div className="detail-value">
                  {entry.domains.map((domain, i) => (
                    <div key={i}>{domain}</div>
                  ))}
                </div>
              </div>
              <div className="detail-section">
                <label>Tools:</label>
                <div className="detail-value">
                  {entry.tools.map((toolBinding, i) => (
                    <div key={i} style={{marginBottom: '8px'}}>
                      <strong>{toolBinding.tool.name}</strong> — {toolBinding.tool.description}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="table-expanded-cell"></div>
        </>
      )}
    </>
  );
}

function UserToolsPage() {
  const [toolStates, setToolStates] = useState<UserToolState>({});

  useEffect(() => {
    loadToolStates();
  }, []);

  const loadToolStates = async () => {
    const result = await chrome.storage.local.get('userToolStates');
    if (result.userToolStates) {
      setToolStates(result.userToolStates);
    } else {
      const initialStates: UserToolState = {};
      for (let i = 0; i < registry.length; i++) {
        initialStates[`tool_${i}`] = true;
      }
      setToolStates(initialStates);
      await chrome.storage.local.set({userToolStates: initialStates});
    }
  };

  const handleToggle = async (index: number, enabled: boolean) => {
    // TODO (jg): key by an ID rather than index
    const newStates = {
      ...toolStates,
      [`tool_${index}`]: enabled
    };
    setToolStates(newStates);
    await chrome.storage.local.set({userToolStates: newStates});
  };

  return (
    <div className="table-container">
      {registry.length === 0 ? (
        <div className="empty-state">No user tools configured</div>
      ) : (
        <div className="table-grid">
          <div className="table-header-cell">Domains</div>
          <div className="table-header-cell">Tools</div>
          <div className="table-header-cell">Enabled</div>
          {registry.map((entry, index) => (
            <UserToolRow
              key={index}
              entry={entry}
              index={index}
              enabled={toolStates[`tool_${index}`] !== false}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventsPage() {
  const [events, setEvents] = useState<ToolCallEventInfo[]>([]);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    const fetchedEvents = await fetchEventsFromTab();
    setEvents(fetchedEvents);
  };

  return (
    <div className="table-container">
      {events.length === 0 ? (
        <div className="empty-state">No tool call events captured yet</div>
      ) : (
        <div className="table-grid">
          <div className="table-header-cell">Time</div>
          <div className="table-header-cell">Tool Name</div>
          <div className="table-header-cell"></div>
          {events.map((event, index) => (
            <EventRow key={index} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function Panel() {
  const [activeNav, setActiveNav] = useState('tools');
  const [tools, setTools] = useState<ToolDefinitionInfo[]>([]);

  const loadTools = async () => {
    const fetchedTools = await fetchToolsFromTab();
    setTools(fetchedTools);
  };

  useEffect(() => {
    loadTools();
  }, []);

  useEffect(() => {
    if (activeNav === 'tools') {
      loadTools();
    }
  }, [activeNav]);

  useEffect(() => {
    const handleNavigation = () => {
      loadTools();
    };

    chrome.devtools.network.onNavigated.addListener(handleNavigation);

    return () => {
      chrome.devtools.network.onNavigated.removeListener(handleNavigation);
    };
  }, []);

  return (
    <div className="panel-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-category">WebMCP</div>
        <div
          onClick={() => setActiveNav('tools')}
          className={`sidebar-nav-item ${activeNav === 'tools' ? 'active' : ''}`}
        >
          Page Tools
        </div>
        <div
          onClick={() => setActiveNav('events')}
          className={`sidebar-nav-item ${activeNav === 'events' ? 'active' : ''}`}
        >
          Events
        </div>
        <div
          onClick={() => setActiveNav('userTools')}
          className={`sidebar-nav-item ${activeNav === 'userTools' ? 'active' : ''}`}
        >
          User Tools
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {activeNav === 'tools' &&
          (tools.length === 0 ? (
            <div className="empty-state">No tools detected on this page</div>
          ) : (
            <div className="table-container">
              <div className="table-grid">
                <div className="table-header-cell">Name</div>
                <div className="table-header-cell">Description</div>
                <div className="table-header-cell"></div>
                {tools.map((tool) => (
                  <ToolRow key={tool.name} tool={tool} />
                ))}
              </div>
            </div>
          ))}
        {activeNav === 'events' && <EventsPage />}
        {activeNav === 'userTools' && <UserToolsPage />}
      </div>
    </div>
  );
}

function main(): void {
  renderTools();
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
