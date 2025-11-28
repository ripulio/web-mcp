export interface TextContent {
  text: string;
  type: 'text';
}

export interface ImageContent {
  data: string;
  mimeType: string;
  type: 'image';
}

export interface AudioContent {
  data: string;
  mimeType: string;
  type: 'audio';
}

export interface ResourceLink {
  description?: string;
  mimeType?: string;
  name: string;
  size?: number;
  title?: string;
  type: 'resource_link';
  uri: string;
}

export interface TextResourceContents {
  mimeType?: string;
  text: string;
  uri: string;
}

export interface BlobResourceContents {
  blob: string;
  mimeType?: string;
  uri: string;
}

export interface EmbeddedResource {
  resource: TextResourceContents | BlobResourceContents;
  type: 'resource';
}

export type ContentBlock =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

export interface CallToolResult {
  content: ContentBlock[];
  isError?: boolean;
  structuredContent?: {[key: string]: unknown};
  [key: string]: unknown;
}
