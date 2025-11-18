import type {ToolDefinition} from '@ripul/web-mcp';
import type {ToolRegistryEntry} from '../types.js';

declare global {
  interface Window {
    DOCS_modelChunk?: unknown;
  }
}

function describeScriptElement(scriptEl: HTMLScriptElement | null): string {
  if (!scriptEl) {
    return 'null';
  }

  const src = scriptEl.getAttribute('src');
  if (src) {
    return '<script src="' + src + '">';
  }

  const snippet = (scriptEl.textContent || '')
    .replace(/\\s+/g, ' ')
    .trim()
    .slice(0, 80);
  if (!snippet) {
    return '<script>(empty inline script)</script>';
  }

  return (
    '<script>' + snippet + (snippet.length === 80 ? '...' : '') + '</script>'
  );
}

function findModelChunkScript(): {
  script: HTMLScriptElement | null;
  details: string;
} {
  const selector = 'body > script:nth-child(25)';
  const selectorMatch = document.querySelector<HTMLScriptElement>(selector);
  if (selectorMatch) {
    return {
      script: selectorMatch,
      details:
        'Selector ' +
        selector +
        ' returned ' +
        describeScriptElement(selectorMatch)
    };
  }

  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script')];
  const fallback = scripts.find((script) => {
    const source = script?.textContent || '';
    return source.includes('DOCS_modelChunk');
  });

  if (fallback) {
    return {
      script: fallback,
      details:
        'Fallback document.querySelectorAll("script") found index ' +
        scripts.indexOf(fallback) +
        ' => ' +
        describeScriptElement(fallback)
    };
  }

  return {
    script: null,
    details:
      'Selector ' +
      selector +
      ' returned null and fallback search did not locate an inline DOCS_modelChunk script.'
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
  const literalMatch = source.match(
    /DOCS_modelChunk\\s*=\\s*(\\{[\\s\\S]*?\\});/
  );
  if (literalMatch) {
    return JSON.parse(literalMatch[1]);
  }

  const jsonParseMatch = source.match(
    /DOCS_modelChunk\\s*=\\s*(JSON\\.parse\\(\\s*['"][\\s\\S]*?['"]\\s*\\))/
  );
  if (jsonParseMatch) {
    try {
      // Evaluate only the JSON.parse expression to safely decode the payload.
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
  }>;
  [key: string]: unknown;
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
    .map((chunk) => chunk.s)
    .join('');

  const cleaned = text
    .replace(/[\\u0000-\\u001F]+/g, ' ')
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

const isDocument = (path: string) =>
  /^https?:\/\/docs\.google\.com\/document\/d\//i.test(path);

export const googleDocsTools: ToolRegistryEntry = {
  domains: ['docs.google.com'],
  tools: [
    {
      tool: getContentTool,
      pathMatches: isDocument
    }
  ]
};
