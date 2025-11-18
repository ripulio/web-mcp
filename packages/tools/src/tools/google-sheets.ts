import type {ToolDefinition} from '@ripul/web-mcp';
import type {ToolRegistryEntry} from '../types.js';

const MAX_ROWS = 50;

function findBootstrapDataScript(): HTMLScriptElement | null {
  return (
    document.querySelector<HTMLScriptElement>('body > script:nth-child(13)') ||
    Array.from(document.querySelectorAll<HTMLScriptElement>('script')).find(
      (script) => {
        const source = script?.textContent || '';
        return source.includes('bootstrapData') && source.includes('trixApp');
      }
    ) ||
    null
  );
}

function parseBootstrapDataFromScript(
  scriptEl: HTMLScriptElement | null
): unknown {
  if (!scriptEl) {
    throw new Error('Could not find the Google Sheets bootstrap script tag.');
  }

  const source = scriptEl.textContent || '';
  const match = source.match(/bootstrapData\\s*=\\s*({[\\s\\S]*?});/);
  if (!match) {
    throw new Error(
      'bootstrapData assignment was not found in the script content.'
    );
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error('Failed to parse bootstrapData JSON.');
  }
}

function decodeCellValue(cell: Record<PropertyKey, unknown> | undefined) {
  if (!cell || typeof cell !== 'object') {
    return '';
  }

  const raw = cell['3'];
  if (raw == null) {
    return '';
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return '';
    }

    if (raw[0] === 2 && typeof raw[1] === 'string') {
      return raw[1];
    }

    const pieces = raw
      .map((part) => {
        if (part && typeof part === 'object' && '3' in part) {
          return part['3'];
        }

        if (typeof part === 'string' || typeof part === 'number') {
          return part;
        }

        return '';
      })
      .filter((piece) => piece !== null && piece !== undefined);

    return pieces.map((piece) => String(piece)).join('');
  }

  if (typeof raw === 'string' || typeof raw === 'number') {
    return String(raw);
  }

  if (typeof raw === 'object' && '3' in raw) {
    return String(raw['3']);
  }

  return '';
}

function normalizeRow(cells: unknown[]): string[] {
  const normalized = cells.map((cell) => {
    if (cell == null) {
      return '';
    }

    return typeof cell === 'string' ? cell.trim() : String(cell).trim();
  });

  let lastIndex = normalized.length - 1;
  while (lastIndex >= 0 && !normalized[lastIndex]) {
    lastIndex -= 1;
  }

  return normalized.slice(0, lastIndex + 1);
}

function isBootstrapDataLike(
  data: unknown
): data is {changes: {firstchunk: unknown}} {
  return (
    data != null &&
    typeof data === 'object' &&
    'changes' in data &&
    data.changes != null &&
    typeof data.changes === 'object' &&
    'firstchunk' in data.changes
  );
}

function extractRowsFromBootstrapData(bootstrapData: unknown) {
  const rows: Array<string[]> = [];

  if (!isBootstrapDataLike(bootstrapData)) {
    throw new Error('Invalid bootstrapData structure.');
  }

  const chunks = Array.isArray(bootstrapData?.changes?.firstchunk)
    ? bootstrapData.changes.firstchunk
    : [];

  chunks.forEach((chunkEntry) => {
    if (!Array.isArray(chunkEntry) || typeof chunkEntry[1] !== 'string') {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(chunkEntry[1]);
    } catch {
      return;
    }

    const rowBlocks = parsed?.[3];
    if (!Array.isArray(rowBlocks)) {
      return;
    }

    rowBlocks.forEach((rowBlock) => {
      if (!Array.isArray(rowBlock)) {
        return;
      }

      const cells = rowBlock.map((columnBlock) => {
        if (!Array.isArray(columnBlock)) {
          return '';
        }

        const cellPayload = columnBlock.find(
          (part): part is Record<PropertyKey, unknown> =>
            part && typeof part === 'object' && Object.keys(part).length > 0
        );

        const decoded = decodeCellValue(cellPayload);
        return decoded == null ? '' : String(decoded);
      });

      const normalized = normalizeRow(cells);
      if (!normalized.length) {
        return;
      }

      rows.push(normalized);
    });
  });

  return rows;
}

function formatAsMarkdownTable(rows: Array<string[]>): string {
  if (!rows.length) {
    return '';
  }

  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const padRow = (row: string[]) => {
    const copy = row.slice();
    while (copy.length < columnCount) {
      copy.push('');
    }
    return copy;
  };

  const [header, ...body] = rows;
  const tableLines = [];

  if (header) {
    tableLines.push(
      '| ' +
        padRow(header)
          .map((value) => value || '(empty)')
          .join(' | ') +
        ' |'
    );
    tableLines.push(
      '| ' + new Array(columnCount).fill('---').join(' | ') + ' |'
    );
  }

  body.forEach((row) => {
    tableLines.push(
      '| ' +
        padRow(row)
          .map((value) => value || '')
          .join(' | ') +
        ' |'
    );
  });

  if (!header) {
    return rows.map((row) => row.join(' | ')).join('\\n');
  }

  return tableLines.join('\\n');
}

function getGoogleSheetsContent() {
  const scriptEl = findBootstrapDataScript();
  const bootstrapData = parseBootstrapDataFromScript(scriptEl);
  const rows = extractRowsFromBootstrapData(bootstrapData);
  const limitedRows = rows.slice(0, MAX_ROWS);

  return {
    rows: limitedRows,
    totalRows: rows.length,
    truncated: rows.length > MAX_ROWS,
    markdown: formatAsMarkdownTable(limitedRows)
  };
}

export const getContentTool: ToolDefinition = {
  name: 'google_sheets_get_content',
  description: 'Return the current Google Sheets grid content (first 50 rows).',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  async execute() {
    try {
      const result = getGoogleSheetsContent();
      const lines = [];

      if (result.rows.length) {
        lines.push(
          'Here are the first ' +
            result.rows.length +
            ' rows from the active sheet:'
        );
      } else {
        lines.push('No Google Sheets data was found.');
      }

      if (result.markdown) {
        lines.push(result.markdown);
      }

      if (result.truncated) {
        lines.push('', 'Note: output truncated to ' + MAX_ROWS + ' rows.');
      }

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\\n')
          }
        ],
        structuredContent: {
          rows: result.rows,
          totalRows: result.totalRows,
          truncated: result.truncated
        }
      };
    } catch (error) {
      const message =
        error instanceof Error && typeof error.message === 'string'
          ? error.message
          : 'Failed to extract Google Sheets content.';
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

export const googleSheetsTools: ToolRegistryEntry = {
  domains: ['docs.google.com'],
  tools: [
    {
      tool: getContentTool,
      pathMatches: (path) => path.startsWith('/spreadsheets/')
    }
  ]
};
