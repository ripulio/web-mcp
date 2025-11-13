import { siteInjectionConfigs } from "./sites/index.js";
import type { AgentInjectionConfig } from "./types.js";

/**
 * Normalizes contributed site configs into the structure consumed by the
 * background service worker.
 */
export const agentInjectionConfigs: AgentInjectionConfig[] = siteInjectionConfigs.map((config) => ({
  id: config.id,
  description: config.description,
  matchers: Array.isArray(config.matchers) ? config.matchers : [],
  code: config.code,
}));
