export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
}

export interface AgentContext {
  tools?: ToolDefinition[];
}

export interface Agent {
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
