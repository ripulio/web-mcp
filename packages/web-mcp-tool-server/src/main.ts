import * as path from 'node:path';
import {loadCatalog, watchCatalog} from './tool-loader.js';
import {createServer} from './server.js';

export interface StartOptions {
  directory: string;
  port: number;
  host: string;
  watch: boolean;
}

function parseArgs(args: string[]): StartOptions {
  const options: StartOptions = {
    directory: process.cwd(),
    port: 3000,
    host: 'localhost',
    watch: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      options.port = parseInt(value, 10);
      if (isNaN(options.port)) {
        throw new Error(`Invalid port: ${value}`);
      }
    } else if (arg === '--host' || arg === '-h') {
      options.host = args[++i];
    } else if (arg === '--watch' || arg === '-w') {
      options.watch = true;
    } else if (arg === '--help') {
      console.log(`
Usage: web-mcp-tool-server [options] [directory]

Options:
  -p, --port <port>  Port to listen on (default: 3000)
  -h, --host <host>  Host to bind to (default: localhost)
  -w, --watch        Watch for changes and reload
  --help             Show this help message

Arguments:
  directory          Directory containing tool groups (default: current directory)
`);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      options.directory = path.resolve(arg);
    }
  }

  return options;
}

export async function start(args: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);

  let catalog = await loadCatalog(options.directory);
  console.log(
    `Loaded ${catalog.tools.size} tools and ${catalog.groups.size} groups from ${options.directory}`
  );

  const server = createServer({
    getCatalog: () => catalog
  });

  if (options.watch) {
    watchCatalog(options.directory, (newCatalog) => {
      catalog = newCatalog;
      console.log(
        `Reloaded ${catalog.tools.size} tools and ${catalog.groups.size} groups`
      );
    });
    console.log(`Watching ${options.directory} for changes`);
  }

  await new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(options.port, options.host, () => {
      console.log(
        `WebMCP Tool Server listening on http://${options.host}:${options.port}`
      );
      resolve();
    });
  });

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      server.close(() => resolve());
    });
    process.on('SIGTERM', () => {
      console.log('\nShutting down...');
      server.close(() => resolve());
    });
  });
}

export * from './types.js';
export * from './tool-loader.js';
export * from './server.js';
