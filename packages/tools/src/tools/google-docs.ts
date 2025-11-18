import type {ToolDefinition} from '@ripul/web-mcp';
import type {ToolRegistryEntry} from '../types.js';

declare global {
  interface Window {
    DOCS_modelChunk?: unknown;
  }
}

function findModelChunkScript(): {
  script: HTMLScriptElement | null;
  details: string;
} {
  const scripts = [
    ...document.querySelectorAll<HTMLScriptElement>('script:not([src])')
  ];

  // Only match the *assignment* to DOCS_modelChunk, not any usage.
  const candidates = scripts.filter((script) => {
    const source = script.textContent || '';
    return /DOCS_modelChunk\s*=\s*{/.test(source);
  });

  if (candidates.length > 0) {
    const script = candidates[candidates.length - 1]; // latest chunk if multiple
    return {
      script,
      details:
        'Matched DOCS_modelChunk assignment in inline script at index ' +
        scripts.indexOf(script)
    };
  }

  return {
    script: null,
    details:
      'No inline script found containing a DOCS_modelChunk object assignment.'
  };
}

function getGlobalModelChunk(): unknown {
  const chunk = window?.DOCS_modelChunk;
  if (chunk && typeof chunk === 'object') {
    return chunk;
  }
  return null;
}

function parseModelChunkFromScript(
  scriptEl: HTMLScriptElement | null,
  selectionDetails: string = ''
): unknown {
  const detailSuffix = selectionDetails ? ' ' + selectionDetails : '';

  if (!scriptEl) {
    throw new Error("Selector didn't match any script." + detailSuffix);
  }

  const source = scriptEl.textContent || '';

  // 1) Direct object literal assignment:
  // DOCS_modelChunk = { ... };
  const literalMatch = source.match(/DOCS_modelChunk\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (literalMatch) {
    // literalMatch[1] is the `{ ... }`
    return JSON.parse(literalMatch[1]);
  }

  // 2) JSON.parse wrapper:
  // DOCS_modelChunk = JSON.parse('...json...');
  const jsonParseMatch = source.match(
    /DOCS_modelChunk\s*=\s*(JSON\.parse\(\s*['"][\s\S]*?['"]\s*\))/
  );
  if (jsonParseMatch) {
    try {
      // Evaluate only the JSON.parse(...) expression with a fake JSON object
      return new Function('JSON', 'return (' + jsonParseMatch[1] + ');')(JSON);
    } catch {
      throw new Error(
        'Failed to evaluate DOCS_modelChunk JSON.parse expression.' +
          detailSuffix
      );
    }
  }

  throw new Error("Couldn't find DOCS_modelChunk assignment." + detailSuffix);
}

interface ChunkLike {
  chunk: Array<{
    ty: string;
    s?: string;
    ae?: string[];
    csst?: string[];
    csdr?: string[];
  }>;
  ae?: string[];
  csst?: string[];
  csdr?: string[];
  [key: string]: unknown;
}

function pickStringTable(
  doc: ChunkLike,
  chunk?: Partial<ChunkLike['chunk'][number]>
): string[] | null {
  return (
    chunk?.ae ||
    chunk?.csst ||
    chunk?.csdr ||
    doc.ae ||
    doc.csst ||
    doc.csdr ||
    null
  );
}

function getUncompressFn(): ((raw: string, table?: string[]) => string) | null {
  const maybe = [
    (globalThis as any)?.docs?.string?.uncompress,
    (globalThis as any)?.docs?.string?.O,
    (globalThis as any)?.csUncompress,
    (globalThis as any)?.uncompressDocString
  ].find((fn) => typeof fn === 'function');

  return maybe || null;
}

function localDecodeWithTable(raw: string, table: string[]): string {
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code != null && code < 32 && table[code] != null) {
      out += table[code];
    } else {
      out += ch;
    }
  }
  return out;
}

function decodeDocOpsString(
  raw: string,
  doc: ChunkLike,
  chunk?: Partial<ChunkLike['chunk'][number]>
): string {
  const table = pickStringTable(doc, chunk) ?? undefined;
  const uncompress = getUncompressFn();

  if (uncompress) {
    try {
      return uncompress(raw, table);
    } catch {
      // fall through to local decode
    }
  }

  if (table) {
    return localDecodeWithTable(raw, table);
  }

  return raw;
}

function getDocsModelChunk(): ChunkLike {
  let globalChunk = getGlobalModelChunk();

  if (!globalChunk) {
    const {script: scriptEl, details: scriptDetails} = findModelChunkScript();
    globalChunk = parseModelChunkFromScript(scriptEl, scriptDetails);
  }

  if (typeof globalChunk !== 'object' || globalChunk === null) {
    throw new Error('DOCS_modelChunk is not an object.');
  }

  if (!Object.hasOwn(globalChunk, 'chunk')) {
    throw new Error("DOCS_modelChunk is missing expected 'chunk' property.");
  }

  return globalChunk as ChunkLike;
}

function getGoogleDocsContent() {
  const obj = getDocsModelChunk();
  const text = (obj.chunk || [])
    .filter((chunk) => chunk?.ty === 'is' && typeof chunk.s === 'string')
    .map((chunk) => decodeDocOpsString(chunk.s || '', obj, chunk))
    .join('');

  const cleaned = text
    // Preserve decoded text, only normalize obvious whitespace noise.
    .replace(/[ \\t]+\\n/g, '\\n')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();

  return cleaned;
}

export const getContentTool: ToolDefinition = {
  name: 'google_docs_get_content',
  description:
    'Return the cleaned text content of the open Google Docs document.',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  async execute() {
    try {
      const text = getGoogleDocsContent();
      return {
        content: [
          {
            type: 'text',
            text: text || '(Document body appears empty.)'
          }
        ],
        structuredContent: {
          text
        }
      };
    } catch (error) {
      const message =
        error instanceof Error && typeof error.message === 'string'
          ? error.message
          : 'Failed to extract Google Docs content.';
      return {
        content: [
          {
            type: 'text',
            text: message
          }
        ],
        isError: true
      };
    }
  }
};

const isDocument = (path: string) => /document\/d\//i.test(path);

export const googleDocsTools: ToolRegistryEntry = {
  domains: ['docs.google.com'],
  tools: [
    {
      tool: getContentTool,
      pathMatches: isDocument
    }
  ]
};
