import * as http from 'node:http';
import type {LoadedCatalog} from './tool-loader.js';

export interface ServerOptions {
  getCatalog: () => LoadedCatalog;
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200): void {
  setCorsHeaders(res);
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(data));
}

function sendText(
  res: http.ServerResponse,
  data: string,
  contentType: string,
  status = 200
): void {
  setCorsHeaders(res);
  res.writeHead(status, {'Content-Type': contentType});
  res.end(data);
}

function sendNotFound(res: http.ServerResponse, message: string): void {
  sendJson(res, {error: message}, 404);
}

export function createServer(options: ServerOptions): http.Server {
  const {getCatalog} = options;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, {error: 'Method not allowed'}, 405);
      return;
    }

    const catalog = getCatalog();

    if (pathname === '/api/groups') {
      const groups = Array.from(catalog.groups.values());
      sendJson(res, groups);
      return;
    }

    const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (groupMatch) {
      const id = groupMatch[1];
      const group = catalog.groups.get(id);
      if (!group) {
        sendNotFound(res, 'Group not found');
        return;
      }
      sendJson(res, group);
      return;
    }

    if (pathname === '/api/tools') {
      const tools = Array.from(catalog.tools.values());
      sendJson(res, tools);
      return;
    }

    const toolSourceMatch = pathname.match(/^\/api\/tools\/([^/]+)\/source$/);
    if (toolSourceMatch) {
      const id = toolSourceMatch[1];
      const tool = catalog.tools.get(id);
      if (!tool) {
        sendNotFound(res, 'Tool not found');
        return;
      }
      const source = catalog.sources.get(id);
      if (!source) {
        sendNotFound(res, 'Source code not found for this tool');
        return;
      }
      sendText(res, source, 'application/javascript');
      return;
    }

    const toolMatch = pathname.match(/^\/api\/tools\/([^/]+)$/);
    if (toolMatch) {
      const id = toolMatch[1];
      const tool = catalog.tools.get(id);
      if (!tool) {
        sendNotFound(res, 'Tool not found');
        return;
      }
      sendJson(res, tool);
      return;
    }

    sendNotFound(res, 'Not found');
  });

  return server;
}
