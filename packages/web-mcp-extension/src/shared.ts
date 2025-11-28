export interface StoredToolGroup {
  id: string;
  name: string;
  description: string;
  domains: string[];
  tools: {
    source: string; // the .js file content
    pathPattern?: string;
  }[];
}

export interface EnabledToolGroups {
  [entryId: string]: StoredToolGroup;
}
