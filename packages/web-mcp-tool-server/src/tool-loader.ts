import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {ToolMetadata, ToolRegistryMeta} from './types.js';

export interface LoadedCatalog {
  groups: Map<string, ToolRegistryMeta>;
  tools: Map<string, ToolMetadata>;
  sources: Map<string, string>;
  version: string;
  updatedAt: number;
}

function validateGroupMeta(data: unknown, filePath: string): ToolRegistryMeta {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Invalid group metadata in ${filePath}: expected object`);
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== 'string') {
    throw new Error(`Invalid group metadata in ${filePath}: missing or invalid 'id'`);
  }
  if (typeof obj.name !== 'string') {
    throw new Error(`Invalid group metadata in ${filePath}: missing or invalid 'name'`);
  }
  if (typeof obj.description !== 'string') {
    throw new Error(`Invalid group metadata in ${filePath}: missing or invalid 'description'`);
  }
  if (!Array.isArray(obj.tools)) {
    throw new Error(`Invalid group metadata in ${filePath}: missing or invalid 'tools' array`);
  }
  return {
    id: obj.id,
    name: obj.name,
    description: obj.description,
    tools: obj.tools as string[]
  };
}

function validateToolMeta(data: unknown, filePath: string): ToolMetadata {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Invalid tool metadata in ${filePath}: expected object`);
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.id !== 'string') {
    throw new Error(`Invalid tool metadata in ${filePath}: missing or invalid 'id'`);
  }
  return {
    id: obj.id,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    filters: Array.isArray(obj.filters) ? obj.filters : undefined
  };
}

export async function loadCatalog(directory: string): Promise<LoadedCatalog> {
  const groups = new Map<string, ToolRegistryMeta>();
  const tools = new Map<string, ToolMetadata>();
  const sources = new Map<string, string>();

  const entries = await fs.readdir(directory, {withFileTypes: true});

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const groupDir = path.join(directory, entry.name);
    const groupMetaPath = path.join(groupDir, `${entry.name}.meta.json`);

    try {
      const rawGroupMeta = JSON.parse(await fs.readFile(groupMetaPath, 'utf-8'));
      const groupMeta = validateGroupMeta(rawGroupMeta, groupMetaPath);
      groups.set(groupMeta.id, groupMeta);
    } catch (err) {
      console.warn(`Failed to load group metadata from ${groupMetaPath}:`, err);
      continue;
    }

    const files = await fs.readdir(groupDir);
    const metaFiles = files.filter(
      (f) => f.endsWith('.meta.json') && f !== `${entry.name}.meta.json`
    );

    for (const metaFile of metaFiles) {
      const toolId = metaFile.replace('.meta.json', '');
      const metaPath = path.join(groupDir, metaFile);
      const sourcePath = path.join(groupDir, `${toolId}.js`);

      try {
        const rawToolMeta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
        const toolMeta = validateToolMeta(rawToolMeta, metaPath);
        tools.set(toolMeta.id, toolMeta);

        const source = await fs.readFile(sourcePath, 'utf-8');
        sources.set(toolMeta.id, source);
      } catch (err) {
        console.warn(`Failed to load tool from ${metaPath}:`, err);
        continue;
      }
    }
  }

  const updatedAt = Date.now();
  return {groups, tools, sources, version: String(updatedAt), updatedAt};
}

export function watchCatalog(
  directory: string,
  onChange: (catalog: LoadedCatalog) => void
): () => void {
  const ac = new AbortController();
  const {signal} = ac;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastChangedFile: string | null = null;

  const reload = async (): Promise<void> => {
    if (lastChangedFile) {
      console.log(`File changed: ${lastChangedFile}`);
    }
    const catalog = await loadCatalog(directory);
    onChange(catalog);
  };

  (async () => {
    const watcher = fs.watch(directory, {recursive: true, signal});
    for await (const event of watcher) {
      lastChangedFile = event.filename;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        reload().catch((err) => {
          console.error('Failed to reload catalog:', err);
        });
      }, 100);
    }
  })().catch((err) => {
    if (err.name !== 'AbortError') {
      console.error('Watch error:', err);
    }
  });

  return () => {
    ac.abort();
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  };
}
