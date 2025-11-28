export interface ToolSource {
  source: string;
}

export interface ToolRegistryResult {
  id: string;
  name: string;
  description: string;
  domains: string[];
  pathPattern?: string;
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
