/// <reference types="chrome" />

import { agentInjectionConfigs } from "./config/injection-config.js";
import type { AgentInjectionConfig } from "./config/types.js";

const DEBUG_PREFIX = "[Web MCP Injector]";
let userScriptsAvailabilityWarningLogged = false;

type UserScriptsExecuteFn = (injection: MinimalUserScriptInjection) => Promise<unknown>;

type UserScriptsApi = typeof chrome.userScripts & {
  execute?: UserScriptsExecuteFn;
};

interface MinimalUserScriptInjection {
  js: Array<{ code?: string; file?: string }>;
  target: {
    tabId: number;
    allFrames?: boolean;
    frameIds?: number[];
    documentIds?: string[];
  };
  world?: "MAIN" | "USER_SCRIPT";
  worldId?: string;
  injectImmediately?: boolean;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log(`${DEBUG_PREFIX} extension installed`);
});

chrome.runtime.onStartup.addListener(() => {
  console.log(`${DEBUG_PREFIX} service worker started`);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab?.url) {
    return;
  }

  if (!/^https?:\/\//i.test(tab.url)) {
    return;
  }

  const matchingConfigs = selectMatchingConfigs(tab.url);
  if (!matchingConfigs.length) {
    return;
  }

  const snippets = matchingConfigs
    .map((config) => config.code)
    .filter((snippet): snippet is string => typeof snippet === "string" && snippet.trim().length > 0);

  if (!snippets.length) {
    return;
  }

  const userScriptsApi = getUserScriptsApi();
  const userScriptsAvailable = await isUserScriptsAvailable(userScriptsApi);
  if (!userScriptsAvailable) {
    if (!userScriptsAvailabilityWarningLogged) {
      console.warn(
        `${DEBUG_PREFIX} chrome.userScripts is unavailable. Ensure the permission is granted and the "Allow User Scripts" toggle (or Developer Mode on Chrome <138) is enabled. See https://developer.chrome.com/docs/extensions/reference/api/userScripts for details.`,
      );
      userScriptsAvailabilityWarningLogged = true;
    }
    return;
  }

  if (!userScriptsApi?.execute) {
    return;
  }

  const source = createInjectionSource(snippets, matchingConfigs.map((config) => config.id));

  try {
    await userScriptsApi.execute({
      target: { tabId },
      world: "MAIN",
      js: [{ code: source }],
    });

    console.info(
      `${DEBUG_PREFIX} injected agent via chrome.userScripts.execute for tab ${tabId} (config ids: ${matchingConfigs
        .map((config) => config.id)
        .join(", ")})`,
    );
  } catch (error) {
    console.error(`${DEBUG_PREFIX} chrome.userScripts.execute failed for tab ${tabId}:`, error);
  }
});

async function isUserScriptsAvailable(api: UserScriptsApi | null = getUserScriptsApi()): Promise<boolean> {
  if (!api || typeof api.getScripts !== "function" || typeof api.execute !== "function") {
    return false;
  }

  try {
    await api.getScripts({ ids: [] });
    return true;
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} chrome.userScripts is defined but not available:`, error);
    return false;
  }
}

function selectMatchingConfigs(url: string): AgentInjectionConfig[] {
  return agentInjectionConfigs.filter((config) => {
    if (!Array.isArray(config.matchers) || !config.matchers.length) {
      return false;
    }

    return config.matchers.some((matcher) => {
      try {
        return matcher.test(url);
      } catch (error) {
        console.warn(`${DEBUG_PREFIX} invalid matcher in config ${config.id}:`, error);
        return false;
      }
    });
  });
}

const SNIPPET_PLACEHOLDER = "__WEB_MCP_SNIPPETS__";

function createInjectionSource(snippets: string[], configIds: string[]): string {
  const serializedConfigIds = JSON.stringify(configIds);
  const sourceUrl = createSourceLabel(configIds);
  const snippetBlocks = buildSnippetBlocks(snippets);

  const template = `
    (() => {
      const CONFIG_IDS = ${serializedConfigIds};

      if (Array.isArray(CONFIG_IDS) && CONFIG_IDS.length) {
        console.info("[Web MCP Injector] Executing config(s):", CONFIG_IDS.join(", "));
      }

      const LISTENER_MARKER = "__webMcpToolListenerInstalled__";

      function ensureToolCallEvent() {
        if (typeof window.ToolCallEvent === "function") {
          return { created: false };
        }

        class ToolCallEvent extends Event {
          constructor(name, args, callback) {
            super("toolcall");
            this.name = name;
            this.args = args;
            this._callback = callback;
          }

          respondWith(result) {
            try {
              this._callback(result);
            } catch (error) {
              console.error("[Web MCP Injector] ToolCallEvent respondWith failed:", error);
            }
          }
        }

        Object.defineProperty(window, "ToolCallEvent", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: ToolCallEvent,
        });

        return { created: true };
      }

      class AgentToolRegistry {
        constructor() {
          this._tools = new Map();
          this._resolvers = new Map();
        }

        define(tool) {
          if (!tool || typeof tool !== "object") {
            throw new TypeError("Tool definition must be an object.");
          }

          const { name, execute, ...rest } = tool;

          if (!name || typeof name !== "string") {
            throw new TypeError("Tool definition requires a string name.");
          }

          if (typeof execute !== "function") {
            throw new TypeError(\`Tool "\${name}" is missing an execute function.\`);
          }

          const definition = { name, execute, ...rest };
          this._tools.set(name, definition);

          const waiters = this._resolvers.get(name);
          if (waiters) {
            for (const resolve of waiters) {
              resolve(definition);
            }
            this._resolvers.delete(name);
          }

          return definition;
        }

        get(name) {
          return this._tools.get(name);
        }

        list() {
          const results = [];
          for (const tool of this._tools.values()) {
            const { execute, ...info } = tool;
            results.push({ ...info });
          }
          return results;
        }

        whenDefined(name) {
          const existing = this._tools.get(name);
          if (existing) {
            return Promise.resolve(existing);
          }

          return new Promise((resolve) => {
            const waiters = this._resolvers.get(name);
            if (waiters) {
              waiters.push(resolve);
            } else {
              this._resolvers.set(name, [resolve]);
            }
          });
        }
      }

      function ensureAgent() {
        if (window.agent && window.agent.tools) {
          return { agent: window.agent, created: false };
        }

        const agent = { tools: new AgentToolRegistry() };
        Object.defineProperty(window, "agent", {
          configurable: true,
          enumerable: false,
          writable: false,
          value: agent,
        });
        return { agent, created: true };
      }

      function ensureToolCallListener(shouldInstall) {
        if (!shouldInstall) {
          return { created: false };
        }

        if (window[LISTENER_MARKER]) {
          return { created: false };
        }

        const listener = async (event) => {
          if (!(event instanceof Event) || event.defaultPrevented) {
            return;
          }

          const agent = window.agent;
          const registry = agent && agent.tools;
          if (!registry || typeof registry.get !== "function") {
            if (typeof event.respondWith === "function") {
              event.respondWith({
                content: [
                  {
                    type: "text",
                    text: "Tool registry is unavailable.",
                  },
                ],
                isError: true,
              });
            }
            return;
          }

          const tool = registry.get(event.name);
          if (!tool || typeof tool.execute !== "function") {
            event.respondWith({
              content: [
                {
                  type: "text",
                  text: \`Tool not found: \${event.name}\`,
                },
              ],
              isError: true,
            });
            return;
          }

          try {
            const result = await tool.execute(event.args);
            event.respondWith(result);
          } catch (error) {
            const message =
              error && typeof error.message === "string"
                ? error.message
                : "Unknown error executing tool.";
            event.respondWith({
              content: [
                {
                  type: "text",
                  text: \`Error executing tool \${event.name}: \${message}\`,
                },
              ],
              isError: true,
            });
          }
        };

        window.addEventListener("toolcall", listener);
        Object.defineProperty(window, LISTENER_MARKER, {
          configurable: true,
          enumerable: false,
          writable: false,
          value: true,
        });

        return { created: true };
      }

      const toolCallEventState = ensureToolCallEvent();
      const agentState = ensureAgent();
      const listenerState = ensureToolCallListener(agentState.created);
      const agent = agentState.agent;

      if (toolCallEventState.created) {
        console.info("[Web MCP Injector] Installed ToolCallEvent shim.");
      }

      if (agentState.created) {
        console.info("[Web MCP Injector] Created window.agent shim.");
      }

      if (listenerState.created) {
        console.info("[Web MCP Injector] Registered toolcall bridge listener.");
      }

${SNIPPET_PLACEHOLDER}
    })();
    //# sourceURL=${sourceUrl}
  `;

  return template.replace(SNIPPET_PLACEHOLDER, snippetBlocks);
}

function createSourceLabel(configIds: string[]): string {
  if (!Array.isArray(configIds) || !configIds.length) {
    return "web-mcp-agent-bootstrap.js";
  }

  const sanitized = configIds.map((id) => sanitizeFileSegment(id)).filter(Boolean);
  return `web-mcp-agent-bootstrap-${sanitized.join("-")}.js`;
}

function sanitizeFileSegment(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, "_");
}

function getUserScriptsApi(): UserScriptsApi | null {
  const api = chrome.userScripts;
  if (!api) {
    return null;
  }

  return api as UserScriptsApi;
}

function buildSnippetBlocks(snippets: string[]): string {
  if (!snippets.length) {
    return "";
  }

  return snippets
    .map((snippet, index) => {
      const indentedSnippet = indentSnippet(snippet);
      return [
        "      try {",
        "        ((agent) => {",
        indentedSnippet,
        "        })(agent);",
        "      } catch (error) {",
        `        console.error("[Web MCP Injector] snippet ${index} failed", error);`,
        "      }",
      ].join("\n");
    })
    .join("\n\n");
}

function indentSnippet(snippet: string): string {
  return snippet
    .split("\n")
    .map((line) => `          ${line}`)
    .join("\n");
}
