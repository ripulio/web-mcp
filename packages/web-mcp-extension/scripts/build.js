import * as esbuild from 'esbuild';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const srcDir = join(rootDir, 'src');
const extensionDir = join(rootDir, 'extension');
const cssDir = join(rootDir, 'css');

const commonConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: false,
  minify: false
};

async function build() {
  try {
    console.log('Building WebMCP extension...');

    // Build user-tools-injector.ts (injected into page to register user tools)
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'user-tools-injector.ts')],
      outfile: join(extensionDir, 'user-tools-injector.js')
    });
    console.log('✓ Built user-tools-injector.js');

    // Build panel (settings page)
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'panel.tsx')],
      outfile: join(extensionDir, 'panel.js')
    });
    console.log('✓ Built panel.js');

    // Build background service worker
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'background.ts')],
      outfile: join(extensionDir, 'background.js')
    });
    console.log('✓ Built background.js');

    // Build content script (injects user tools into pages)
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'content.ts')],
      outfile: join(extensionDir, 'content.js')
    });
    console.log('✓ Built content.js');

    // Build styles
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(cssDir, 'main.css')],
      outfile: join(extensionDir, 'main.css')
    });
    console.log('✓ Built main.css');

    console.log('\nBuild complete! Extension ready in ./extension/');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
