export interface DomainFilter {
  type: 'domain';
  domains: string[];
}

export interface PathFilter {
  type: 'path';
  patterns: string[];
}

export type ToolFilter = DomainFilter | PathFilter;

export interface ToolSource {
  source: string;
  filters?: ToolFilter[];
}

export interface ToolRegistryResult {
  id: string;
  name: string;
  description: string;
  tools: ToolSource[];
}

export async function searchTools(
  name?: string
): Promise<ToolRegistryResult[]> {
  // TODO: implement remote tool search
  if (name) {
    return [];
  }
  return [];
}
