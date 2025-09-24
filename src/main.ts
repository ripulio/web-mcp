interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
}

interface AgentContext {
  tools?: ToolDefinition[];
}

interface Agent {
  provideContext(context: AgentContext): void;
}

export class ToolCallEvent extends Event {
  name: string;
  args: unknown;
  #callback: (result: unknown) => void;

  constructor(
    name: string,
    args: unknown,
    callback: (result: unknown) => void
  ) {
    super('toolcall');
    this.name = name;
    this.args = args;
    this.#callback = callback;
  }

  respondWith(result: unknown) {
    this.#callback(result);
  }
}

declare global {
  interface Window {
    agent: Agent;
  }

  interface WindowEventMap {
    toolcall: ToolCallEvent;
  }
}

const tools = new Map<string, ToolDefinition>();

function provideContext(context: AgentContext) {
  if (context.tools) {
    for (const tool of context.tools) {
      tools.set(tool.name, tool);
    }
  }
}

if (!window.agent) {
  window.agent = {
    provideContext
  };
}

window.addEventListener('toolcall', async (event) => {
  if (event.defaultPrevented) {
    return;
  }

  const tool = tools.get(event.name);
  if (!tool) {
    event.respondWith({
      error: `Tool not found: ${event.name}`
    });
    return;
  }
  try {
    const result = await tool.execute(event.args);
    event.respondWith({
      result
    });
  } catch (error) {
    event.respondWith({
      error: (error as Error).message
    });
  }
});

window.agent.provideContext({
  tools: [
    {
      name: 'add-todo',
      description: 'Add a new todo item to the list',
      inputSchema: {
        type: 'object',
        properties: {
          text: {type: 'string', description: 'The text of the todo item'}
        },
        required: ['text']
      },
      async execute(input) {
        console.log(input);
      }
    },
    {
      name: 'list-todos',
      description: 'List all todo items',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      async execute() {}
    }
  ]
});
