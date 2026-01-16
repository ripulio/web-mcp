import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type {ToolMetadata, ToolRegistryMeta} from './types.js';

export interface LoadedCatalog {
  groups: Map<string, ToolRegistryMeta>;
  tools: Map<string, ToolMetadata>;
  sources: Map<string, string>;
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
      const groupMeta = JSON.parse(await fs.readFile(groupMetaPath, 'utf-8'));
      groups.set(groupMeta.id, {
        id: groupMeta.id,
        name: groupMeta.name,
        description: groupMeta.description,
        tools: groupMeta.tools
      });
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
        const toolMeta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
        tools.set(toolMeta.id, {
          id: toolMeta.id,
          description: toolMeta.description,
          filters: toolMeta.filters
        });

        const source = await fs.readFile(sourcePath, 'utf-8');
        sources.set(toolMeta.id, source);
      } catch (err) {
        console.warn(`Failed to load tool from ${metaPath}:`, err);
        continue;
      }
    }
  }

  return {groups, tools, sources};
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
