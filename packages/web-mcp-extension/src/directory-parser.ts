import type {
  BrowsedToolsData,
  BrowsedToolGroup,
  BrowsedTool,
  ToolFilter
} from './shared.js';

interface GroupMetaFile {
  id: string;
  name: string;
  description: string;
  tools: string[];
}

interface ToolMetaFile {
  id: string;
  description: string;
  filters: ToolFilter[];
  groupId?: string;
}

function isGroupMeta(data: unknown): data is GroupMetaFile {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as GroupMetaFile).id === 'string' &&
    'name' in data &&
    typeof (data as GroupMetaFile).name === 'string' &&
    'tools' in data &&
    Array.isArray((data as GroupMetaFile).tools)
  );
}

function isToolMeta(data: unknown): data is ToolMetaFile {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as ToolMetaFile).id === 'string' &&
    'filters' in data &&
    Array.isArray((data as ToolMetaFile).filters)
  );
}

/**
 * Map a metadata path in src/tools/ to the corresponding source path in lib/tools/
 * e.g., "src/tools/amazon/amazon_search.meta.json"
 *    -> "lib/tools/amazon/amazon_search.js"
 */
function getSourcePath(metaPath: string): string {
  return metaPath
    .replace('src/tools/', 'lib/tools/')
    .replace('.meta.json', '.js');
}

/**
 * Recursively collect all files from a directory handle into a Map of path -> File
 */
async function collectFiles(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string
): Promise<Map<string, File>> {
  const files = new Map<string, File>();

  for await (const entry of dirHandle.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      files.set(entryPath, file);
    } else if (entry.kind === 'directory') {
      const subDirHandle = entry as FileSystemDirectoryHandle;
      const subFiles = await collectFiles(subDirHandle, entryPath);
      subFiles.forEach((file, subPath) => files.set(subPath, file));
    }
  }

  return files;
}

/**
 * Parse a directory selected via showDirectoryPicker to extract tool groups and tools.
 * Expects the webmcp-tools repo structure:
 * - src/tools/{group}/{group}.meta.json (group metadata)
 * - src/tools/{group}/{tool}.meta.json (tool metadata)
 * - lib/tools/{group}/{tool}.js (compiled source)
 */
export async function parseToolDirectory(
  dirHandle: FileSystemDirectoryHandle
): Promise<BrowsedToolsData> {
  const rootPath = dirHandle.name;

  // Recursively collect all files
  const fileMap = await collectFiles(dirHandle, '');

  // Check for required directories
  const hasSrcTools = Array.from(fileMap.keys()).some((path) =>
    path.startsWith('src/tools/')
  );
  const hasLibTools = Array.from(fileMap.keys()).some((path) =>
    path.startsWith('lib/tools/')
  );

  if (!hasSrcTools) {
    throw new Error(
      'No tools directory found. Expected src/tools/ in the selected directory.'
    );
  }

  if (!hasLibTools) {
    throw new Error('Repository not built. Run `npm run build` first.');
  }

  // Find all .meta.json files in src/tools/
  const metaFiles = Array.from(fileMap.entries()).filter(
    ([path]) => path.startsWith('src/tools/') && path.endsWith('.meta.json')
  );

  if (metaFiles.length === 0) {
    throw new Error('No tool metadata found in src/tools/');
  }

  // Parse meta files and categorize as group or tool
  const groups: BrowsedToolGroup[] = [];
  const toolMetas: {meta: ToolMetaFile; path: string}[] = [];

  for (const [path, file] of metaFiles) {
    const content = await file.text();
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      console.warn(`WebMCP: Failed to parse ${path}`);
      continue;
    }

    if (isGroupMeta(data)) {
      groups.push({
        id: data.id,
        name: data.name,
        description: data.description,
        tools: data.tools
      });
    } else if (isToolMeta(data)) {
      toolMetas.push({meta: data, path});
    }
  }

  if (groups.length === 0) {
    throw new Error(
      'No tool groups found. Expected {groupId}.meta.json files with "tools" array.'
    );
  }

  // Find source files for each tool
  const tools: BrowsedTool[] = [];
  const missingSource: string[] = [];

  for (const {meta, path} of toolMetas) {
    const sourcePath = getSourcePath(path);
    const sourceFile = fileMap.get(sourcePath);

    if (!sourceFile) {
      missingSource.push(meta.id);
      continue;
    }

    const source = await sourceFile.text();

    tools.push({
      id: meta.id,
      description: meta.description,
      filters: meta.filters,
      groupId: meta.groupId || '',
      source
    });
  }

  if (tools.length === 0) {
    if (missingSource.length > 0) {
      throw new Error(
        `No compiled source files found in lib/tools/. Missing: ${missingSource.slice(0, 5).join(', ')}${missingSource.length > 5 ? '...' : ''}`
      );
    }
    throw new Error('No tools found in selected directory');
  }

  // Log warnings for missing sources (but don't fail)
  if (missingSource.length > 0) {
    console.warn(
      `WebMCP: Some tools missing compiled source: ${missingSource.join(', ')}`
    );
  }

  return {
    directoryName: rootPath,
    lastUpdated: Date.now(),
    groups,
    tools
  };
}
