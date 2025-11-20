import type {CallToolResult} from './mcp-types.js';

export interface ModelContext {
  clearContext(): void;
  provideContext(context: ProvidedContext): void;
  registerTool(tool: ToolDefinition): void;
  unregisterTool(toolName: string): void;
  executeTool(toolName: string, args: unknown): Promise<CallToolResult>;
  list(): Iterable<ToolDefinitionInfo>;
}

export interface ProvidedContext {
  tools?: ToolDefinition[];
}

export class ModelContextImpl implements ModelContext {
  #tools: Map<string, ToolDefinition> = new Map();

  clearContext(): void {
    this.#tools.clear();
  }

  provideContext(context: ProvidedContext): void {
    if (context.tools) {
      for (const tool of context.tools) {
        this.registerTool(tool);
      }
    }
  }

  registerTool(tool: ToolDefinition): void {
    this.#tools.set(tool.name, tool);
  }

  unregisterTool(toolName: string): void {
    this.#tools.delete(toolName);
  }

  *list(): Iterable<ToolDefinitionInfo> {
    for (const tool of this.#tools.values()) {
      const {execute, ...info} = tool;
      yield info;
    }
  }

  async executeTool(toolName: string, args: unknown): Promise<CallToolResult> {
    const tool = this.#tools.get(toolName);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool not found: ${toolName}`
          }
        ],
        isError: true
      };
    }
    try {
      const result = await tool.execute(args);
      return result;
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error executing tool ${toolName}: ${(error as Error).message}`
          }
        ],
        isError: true
      };
    }
  }
}

export type {CallToolResult};

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
  execute: (input: unknown) => Promise<CallToolResult>;
}

export type ToolDefinitionInfo = Omit<ToolDefinition, 'execute'>;

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

if (!navigator.modelContext) {
  navigator.modelContext = new ModelContextImpl();
}
