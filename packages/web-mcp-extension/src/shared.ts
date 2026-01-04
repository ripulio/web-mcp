import type {ToolFilter} from './tool-registry.js';

export interface StoredToolGroup {
  id: string;
  name: string;
  description: string;
  tools: {
    source: string; // the .js file content
    filters?: ToolFilter[];
  }[];
}

export interface EnabledToolGroups {
  [entryId: string]: StoredToolGroup;
}
