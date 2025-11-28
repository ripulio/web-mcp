export interface StoredToolGroup {
  id: string;
  name: string;
  description: string;
  domains: string[];
  pathPattern?: string;
  tools: {
    source: string; // the .js file content
  }[];
}

export interface EnabledToolGroups {
  [entryId: string]: StoredToolGroup;
}
