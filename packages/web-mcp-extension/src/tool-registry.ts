export interface ToolSource {
  source: string;
  pathPattern?: string;
}

export interface ToolRegistryResult {
  id: string;
  name: string;
  description: string;
  domains: string[];
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
