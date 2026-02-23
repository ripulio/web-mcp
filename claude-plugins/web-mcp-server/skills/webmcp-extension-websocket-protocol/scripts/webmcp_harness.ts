import {randomUUID} from 'node:crypto';
import {WebSocket, WebSocketServer} from 'ws';

type Command = 'list-tabs' | 'open-tab' | 'discover-tools' | 'call-tool';

type JsonObject = Record<string, unknown>;

interface GlobalOptions {
  port: number;
  timeoutMs: number;
  sessionId?: string;
  pretty: boolean;
}

interface ParsedArgs {
  command: Command;
  options: GlobalOptions;
  url?: string;
  focus: boolean;
  tabId?: number;
  toolName?: string;
  toolArgs: Record<string, unknown>;
}

interface PendingState<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface ConnectedSnapshot {
  browser: JsonObject;
  tabs: JsonObject[];
}

function parseBoolean(value: string, flag: string): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }

  throw new Error(`${flag} must be true or false`);
}

function parseInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${flag} must be an integer`);
  }
  return parsed;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: GlobalOptions = {
    port: 8765,
    timeoutMs: 70_000,
    pretty: false
  };

  let command: Command | null = null;
  let url: string | undefined;
  let focus = true;
  let tabId: number | undefined;
  let toolName: string | undefined;
  let toolArgs: Record<string, unknown> = {};

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];

    if (token.startsWith('--')) {
      if (token === '--pretty') {
        options.pretty = true;
        i += 1;
        continue;
      }

      const value = requireValue(argv, i, token);
      switch (token) {
        case '--port':
          options.port = parseInteger(value, token);
          break;
        case '--timeout-ms':
          options.timeoutMs = parseInteger(value, token);
          break;
        case '--session-id':
          options.sessionId = value;
          break;
        case '--url':
          url = value;
          break;
        case '--focus':
          focus = parseBoolean(value, token);
          break;
        case '--tab-id':
          tabId = parseInteger(value, token);
          break;
        case '--tool-name':
          toolName = value;
          break;
        case '--args-json': {
          let parsed: unknown;
          try {
            parsed = JSON.parse(value);
          } catch {
            throw new Error('--args-json must be valid JSON');
          }

          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('--args-json must be a JSON object');
          }

          toolArgs = parsed as Record<string, unknown>;
          break;
        }
        default:
          throw new Error(`Unknown flag: ${token}`);
      }

      i += 2;
      continue;
    }

    if (command === null) {
      if (
        token === 'list-tabs' ||
        token === 'open-tab' ||
        token === 'discover-tools' ||
        token === 'call-tool'
      ) {
        command = token;
      } else {
        throw new Error(`Unknown command: ${token}`);
      }
      i += 1;
      continue;
    }

    throw new Error(`Unexpected positional argument: ${token}`);
  }

  if (command === null) {
    throw new Error(
      'Missing command. Use one of: list-tabs, open-tab, discover-tools, call-tool'
    );
  }

  if (options.port < 8765 || options.port > 8785) {
    throw new Error('--port must be in range 8765-8785');
  }

  if (options.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be > 0');
  }

  if (command === 'open-tab' && !url) {
    throw new Error('open-tab requires --url <url>');
  }

  if ((command === 'discover-tools' || command === 'call-tool') && tabId === undefined) {
    throw new Error(`${command} requires --tab-id <id>`);
  }

  if (command === 'call-tool' && !toolName) {
    throw new Error('call-tool requires --tool-name <name>');
  }

  return {
    command,
    options,
    url,
    focus,
    tabId,
    toolName,
    toolArgs
  };
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function mergeSessionId(payload: JsonObject, sessionId?: string): JsonObject {
  if (!sessionId) {
    return payload;
  }

  return {
    ...payload,
    sessionId
  };
}

class Harness {
  private readonly options: GlobalOptions;
  private server: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private connectionResolve: (() => void) | null = null;
  private connectionReject: ((error: Error) => void) | null = null;
  private readonly tabs = new Map<number, JsonObject>();
  private browser: JsonObject | null = null;

  private pendingConnect: {
    promise: Promise<ConnectedSnapshot>;
    state: PendingState<ConnectedSnapshot>;
  } | null = null;

  private readonly pendingCalls = new Map<string, PendingState<unknown>>();
  private readonly pendingRequests = new Map<string, PendingState<JsonObject>>();

  constructor(options: GlobalOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    await this.startServer();
    await this.waitForConnection();
  }

  private async startServer(): Promise<void> {
    if (this.server) {
      return;
    }

    const server = new WebSocketServer({port: this.options.port});
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening);
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EADDRINUSE') {
          reject(
            new Error(
              `Port ${this.options.port} is already in use. Choose another port in the allowed range 8765-8785.`
            )
          );
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
    });

    server.on('connection', (socket) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        socket.close();
        return;
      }

      this.socket = socket;
      this.connectionResolve?.();
      this.connectionResolve = null;
      this.connectionReject = null;

      socket.on('message', (data) => {
        this.handleIncoming(data.toString());
      });

      socket.on('close', () => {
        if (this.socket === socket) {
          this.socket = null;
          this.rejectAllPending(new Error('Extension disconnected'));
        }
      });

      socket.on('error', () => {
        // "close" performs cleanup.
      });
    });
  }

  private async waitForConnection(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionResolve = null;
        this.connectionReject = null;
        reject(
          new Error(
            `Timed out waiting for extension connection on ws://localhost:${this.options.port}`
          )
        );
      }, this.options.timeoutMs);

      this.connectionResolve = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.connectionReject = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  }

  private handleIncoming(raw: string): void {
    let message: JsonObject;
    try {
      message = JSON.parse(raw) as JsonObject;
    } catch {
      return;
    }

    const type = asString(message.type);
    if (!type) {
      return;
    }

    if (type === 'ping') {
      this.safeSend({type: 'pong'});
      return;
    }

    switch (type) {
      case 'connected': {
        const browser = asObject(message.browser);
        const tabs = Array.isArray(message.tabs)
          ? (message.tabs.filter((tab) => asObject(tab) !== null) as JsonObject[])
          : [];

        if (browser) {
          this.browser = browser;
        }
        this.tabs.clear();
        for (const tab of tabs) {
          const tabId = asNumber(tab.id);
          if (tabId !== undefined) {
            this.tabs.set(tabId, tab);
          }
        }

        if (this.pendingConnect) {
          const {state} = this.pendingConnect;
          clearTimeout(state.timeout);
          this.pendingConnect = null;
          state.resolve({
            browser: this.browser ?? {},
            tabs: this.listTabs()
          });
        }
        break;
      }

      case 'tabCreated': {
        const tab = asObject(message.tab);
        const tabId = tab ? asNumber(tab.id) : undefined;
        if (tab && tabId !== undefined) {
          this.tabs.set(tabId, tab);
        }

        const requestId = asString(message.requestId);
        if (requestId) {
          const pending = this.pendingRequests.get(requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(requestId);
            pending.resolve(tab ?? {});
          }
        }
        break;
      }

      case 'tabFocused': {
        const tabId = asNumber(message.tabId);
        if (tabId !== undefined) {
          const existing = this.tabs.get(tabId) ?? {id: tabId};
          const tools = message.tools;
          this.tabs.set(tabId, {
            ...existing,
            ...(Array.isArray(tools) ? {tools} : {})
          });
        }

        const requestId = asString(message.requestId);
        if (requestId) {
          const pending = this.pendingRequests.get(requestId);
          if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(requestId);
            const tab = tabId !== undefined ? this.tabs.get(tabId) ?? {id: tabId} : {};
            pending.resolve(tab);
          }
        }
        break;
      }

      case 'tabUpdated': {
        const tab = asObject(message.tab);
        const tabId = tab ? asNumber(tab.id) : undefined;
        if (tab && tabId !== undefined) {
          this.tabs.set(tabId, tab);
        }
        break;
      }

      case 'tabClosed': {
        const tabId = asNumber(message.tabId);
        if (tabId !== undefined) {
          this.tabs.delete(tabId);
        }
        break;
      }

      case 'toolsChanged': {
        const tabId = asNumber(message.tabId);
        if (tabId !== undefined) {
          const existing = this.tabs.get(tabId) ?? {id: tabId};
          const tools = Array.isArray(message.tools) ? message.tools : [];
          this.tabs.set(tabId, {
            ...existing,
            tools
          });
        }
        break;
      }

      case 'toolsDiscovered': {
        const callId = asString(message.callId);
        if (!callId) {
          break;
        }

        const pending = this.pendingCalls.get(callId);
        if (!pending) {
          break;
        }

        clearTimeout(pending.timeout);
        this.pendingCalls.delete(callId);
        pending.resolve({
          tabId: message.tabId,
          tools: Array.isArray(message.tools) ? message.tools : []
        });
        break;
      }

      case 'toolResult': {
        const callId = asString(message.callId);
        if (!callId) {
          break;
        }

        const pending = this.pendingCalls.get(callId);
        if (!pending) {
          break;
        }

        clearTimeout(pending.timeout);
        this.pendingCalls.delete(callId);

        const error = asString(message.error);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(message.result);
        }
        break;
      }

      case 'disconnected': {
        this.rejectAllPending(new Error('Extension sent disconnected event'));
        break;
      }
    }
  }

  async ensureConnectedSnapshot(): Promise<ConnectedSnapshot> {
    if (this.browser) {
      return {
        browser: this.browser,
        tabs: this.listTabs()
      };
    }

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Extension socket is not connected');
    }

    if (this.pendingConnect) {
      return await this.pendingConnect.promise;
    }

    const pendingPromise = new Promise<ConnectedSnapshot>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingConnect = null;
        reject(new Error(`connect timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      this.pendingConnect = {
        promise: Promise.resolve({browser: {}, tabs: []}),
        state: {
          timeout,
          resolve,
          reject
        }
      };
    });

    if (this.pendingConnect) {
      this.pendingConnect.promise = pendingPromise;
    }

    this.send(mergeSessionId({type: 'connect'}, this.options.sessionId));

    try {
      return await pendingPromise;
    } catch (error) {
      if (this.pendingConnect) {
        clearTimeout(this.pendingConnect.state.timeout);
        this.pendingConnect = null;
      }
      throw error;
    }
  }

  async openTab(url: string, focus: boolean): Promise<JsonObject> {
    await this.ensureConnectedSnapshot();

    const requestId = `request_${randomUUID()}`;
    const response = this.createPendingInMap<JsonObject>(
      this.pendingRequests,
      requestId,
      'openTab'
    );

    this.send(
      mergeSessionId(
        {
          type: 'openTab',
          url,
          focus,
          requestId
        },
        this.options.sessionId
      )
    );

    return await response;
  }

  async discoverTools(tabId: number): Promise<{tabId: number; tools: unknown[]}> {
    await this.ensureConnectedSnapshot();

    const callId = `call_${randomUUID()}`;
    const response = this.createPendingInMap<{tabId: number; tools: unknown[]}>(
      this.pendingCalls,
      callId,
      'discoverTools'
    );

    this.send(
      mergeSessionId(
        {
          type: 'discoverTools',
          callId,
          tabId
        },
        this.options.sessionId
      )
    );

    return await response;
  }

  async callTool(
    tabId: number,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    await this.ensureConnectedSnapshot();

    const callId = `call_${randomUUID()}`;
    const response = this.createPendingInMap<unknown>(
      this.pendingCalls,
      callId,
      'callTool'
    );

    this.send(
      mergeSessionId(
        {
          type: 'callTool',
          callId,
          tabId,
          toolName,
          args
        },
        this.options.sessionId
      )
    );

    return await response;
  }

  listTabs(): JsonObject[] {
    return Array.from(this.tabs.values());
  }

  private createPendingInMap<T>(
    map: Map<string, PendingState<T>>,
    key: string,
    label: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        map.delete(key);
        reject(new Error(`${label} timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      map.set(key, {
        timeout,
        resolve,
        reject
      });
    });
  }

  private send(message: JsonObject): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('Extension socket is not connected');
    }

    this.socket.send(JSON.stringify(message));
  }

  private safeSend(message: JsonObject): void {
    try {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(message));
      }
    } catch {
      // ignore
    }
  }

  private rejectAllPending(error: Error): void {
    if (this.pendingConnect) {
      clearTimeout(this.pendingConnect.state.timeout);
      this.pendingConnect.state.reject(error);
      this.pendingConnect = null;
    }

    for (const [key, pending] of this.pendingCalls) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingCalls.delete(key);
    }

    for (const [key, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(key);
    }

    this.connectionReject?.(error);
    this.connectionReject = null;
    this.connectionResolve = null;
  }

  async close(): Promise<void> {
    this.rejectAllPending(new Error('Harness shutting down'));

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
    }
    this.socket = null;

    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}

function writeJson(payload: JsonObject, pretty: boolean): void {
  process.stdout.write(`${JSON.stringify(payload, null, pretty ? 2 : 0)}\n`);
}

async function run(): Promise<number> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    writeJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      true
    );
    return 1;
  }

  const harness = new Harness(parsed.options);

  try {
    await harness.start();
    const snapshot = await harness.ensureConnectedSnapshot();

    switch (parsed.command) {
      case 'list-tabs': {
        writeJson(
          {
            ok: true,
            port: parsed.options.port,
            browser: snapshot.browser,
            tabs: harness.listTabs()
          },
          parsed.options.pretty
        );
        return 0;
      }

      case 'open-tab': {
        const tab = await harness.openTab(parsed.url!, parsed.focus);
        writeJson(
          {
            ok: true,
            tab
          },
          parsed.options.pretty
        );
        return 0;
      }

      case 'discover-tools': {
        const discovered = await harness.discoverTools(parsed.tabId!);
        writeJson(
          {
            ok: true,
            tabId: parsed.tabId,
            tools: discovered.tools
          },
          parsed.options.pretty
        );
        return 0;
      }

      case 'call-tool': {
        const result = await harness.callTool(
          parsed.tabId!,
          parsed.toolName!,
          parsed.toolArgs
        );

        writeJson(
          {
            ok: true,
            tabId: parsed.tabId,
            toolName: parsed.toolName,
            result
          },
          parsed.options.pretty
        );
        return 0;
      }
    }
  } catch (error) {
    writeJson(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      parsed.options.pretty
    );
    return 1;
  } finally {
    await harness.close();
  }
}

void run().then((code) => {
  process.exit(code);
});
