import {render} from 'preact';
import {useState} from 'preact/hooks';

const mockTools = [
  {
    name: 'search',
    description: 'Search the page content for specific text or patterns',
    inputSchema: {
      type: 'object',
      properties: {
        query: {type: 'string', description: 'Search query'},
        caseSensitive: {type: 'boolean', description: 'Case sensitive search'}
      },
      required: ['query']
    }
  },
  {
    name: 'extract_links',
    description: 'Extract all links from the current page',
    inputSchema: {
      type: 'object',
      properties: {
        includeInternal: {
          type: 'boolean',
          description: 'Include internal links'
        },
        includeExternal: {
          type: 'boolean',
          description: 'Include external links'
        }
      }
    }
  },
  {
    name: 'get_metadata',
    description:
      'Get metadata from the page including title, description, and OpenGraph tags',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'extract_tables',
    description: 'Extract table data from the page in structured format',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for specific tables'
        },
        format: {
          type: 'string',
          enum: ['json', 'csv'],
          description: 'Output format'
        }
      }
    }
  },
  {
    name: 'screenshot',
    description:
      'Capture a screenshot of the current page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for element to capture'
        },
        fullPage: {type: 'boolean', description: 'Capture full page'}
      }
    }
  }
];

// Mock tool execution function
async function executeTool(_toolName: string, _params: unknown): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

function ToolRow({tool}: {tool: (typeof mockTools)[0]}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleRunClick = () => {
    setIsExpanded(true);
  };

  const handleCancel = () => {
    setIsExpanded(false);
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await executeTool(tool.name, {});
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
        <div className="tool-form">
          {/* Mock form */}
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
            <button onClick={handleCancel} className="cancel-button">
              Cancel
            </button>
            <button onClick={handleExecute} className="tool-run-button">
              Run
            </button>
          </div>
        </div>
      )}

      {isExecuting && (
        <div className="spinner-overlay">
          <div className="spinner"></div>
        </div>
      )}
    </div>
  );
}

function Panel() {
  const [activeNav, setActiveNav] = useState('tools');
  const tools = mockTools; // TODO: Replace with actual tools from the page

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
  const errorEl = document.getElementById('error');
  const rootEl = document.getElementById('root');

  if (errorEl) {
    errorEl.style.display = 'none';
  }

  if (rootEl) {
    render(<Panel />, rootEl);
  }
}
