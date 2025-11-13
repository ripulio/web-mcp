export interface AgentToolDefinition<TResult = unknown, TInput = unknown> {
  name: string;
  execute: (input: TInput) => TResult | Promise<TResult>;
  [key: string]: unknown;
}

type Waiter<TResult, TInput> = (definition: AgentToolDefinition<TResult, TInput>) => void;

/**
 * AgentToolRegistry maintains a set of tool definitions keyed by name.
 * Definitions are frozen to avoid accidental mutation after registration.
 */
export class AgentToolRegistry<TResult = unknown, TInput = unknown> {
  #tools = new Map<string, AgentToolDefinition<TResult, TInput>>();
  #waiters = new Map<string, Waiter<TResult, TInput>[]>();

  /**
   * Register a new tool definition.
   */
  define(definition: AgentToolDefinition<TResult, TInput>): AgentToolDefinition<TResult, TInput> {
    const normalized = this.#normalizeDefinition(definition);

    if (this.#tools.has(normalized.name)) {
      throw new Error(`Tool "${normalized.name}" already defined.`);
    }

    this.#tools.set(normalized.name, normalized);
    this.#resolveWaiters(normalized.name, normalized);

    return normalized;
  }

  /**
   * Retrieve a tool definition by name.
   */
  get(name: string): AgentToolDefinition<TResult, TInput> | undefined {
    return this.#tools.get(name);
  }

  /**
   * List all registered tool definitions.
   */
  list(): AgentToolDefinition<TResult, TInput>[] {
    return Array.from(this.#tools.values());
  }

  /**
   * Resolve when a given tool name has been defined.
   */
  whenDefined(name: string): Promise<AgentToolDefinition<TResult, TInput>> {
    const existing = this.#tools.get(name);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve) => {
      const waiters = this.#waiters.get(name);

      if (waiters) {
        waiters.push(resolve);
      } else {
        this.#waiters.set(name, [resolve]);
      }
    });
  }

  #normalizeDefinition(definition: AgentToolDefinition<TResult, TInput>): AgentToolDefinition<TResult, TInput> {
    if (!definition || typeof definition !== "object") {
      throw new TypeError("Tool definition must be an object.");
    }

    const { name, execute, ...rest } = definition;

    if (!name || typeof name !== "string") {
      throw new TypeError("Tool definition requires a string name.");
    }

    if (typeof execute !== "function") {
      throw new TypeError(`Tool "${name}" is missing an execute function.`);
    }

    return Object.freeze({ name, execute, ...rest }) as AgentToolDefinition<TResult, TInput>;
  }

  #resolveWaiters(
    name: string,
    definition: AgentToolDefinition<TResult, TInput>,
  ): void {
    const waiters = this.#waiters.get(name);
    if (!waiters) {
      return;
    }

    this.#waiters.delete(name);
    for (const resolve of waiters) {
      resolve(definition);
    }
  }
}
