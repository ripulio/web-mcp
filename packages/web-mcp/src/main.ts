export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<unknown>;
}

export type ToolDefinitionInfo = Omit<ToolDefinition, 'execute'>;

export interface Agent {
  tools: AgentToolRegistry;
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
    ToolCallEvent: typeof ToolCallEvent;
  }

  interface WindowEventMap {
    toolcall: ToolCallEvent;
  }
}

class AgentToolRegistry {
  #tools: Map<string, ToolDefinition> = new Map();
  #resolvers: Map<string, Array<(tool: ToolDefinition) => void>> = new Map();

  *list(): Iterable<ToolDefinitionInfo> {
    for (const tool of this.#tools.values()) {
      const {execute, ...info} = tool;
      yield info;
    }
  }

  define(tool: ToolDefinition) {
    this.#tools.set(tool.name, tool);
    const resolvers = this.#resolvers.get(tool.name);
    if (resolvers) {
      for (const resolve of resolvers) {
        resolve(tool);
      }
      this.#resolvers.delete(tool.name);
    }
  }

  get(name: string): ToolDefinition | undefined {
    return this.#tools.get(name);
  }

  whenDefined(name: string): Promise<ToolDefinition> {
    return new Promise((resolve) => {
      const tool = this.#tools.get(name);
      if (tool) {
        resolve(tool);
        return;
      }
      const resolvers = this.#resolvers.get(name) ?? [];
      resolvers.push(resolve);
      this.#resolvers.set(name, resolvers);
    });
  }
}

if (!window.agent) {
  window.agent = {
    tools: new AgentToolRegistry()
  };
  window.ToolCallEvent = ToolCallEvent;
}

window.addEventListener('toolcall', async (event) => {
  if (event.defaultPrevented) {
    return;
  }

  const tool = window.agent.tools.get(event.name);
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
