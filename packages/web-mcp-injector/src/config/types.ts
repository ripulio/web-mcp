export interface SiteInjectionConfig {
  id: string;
  description?: string;
  matchers: RegExp[];
  code: string;
}

export type AgentInjectionConfig = SiteInjectionConfig;
