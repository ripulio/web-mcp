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
    console.log('Building WebMCP DevTools extension...');

    // Build devtools.ts
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'devtools.ts')],
      outfile: join(extensionDir, 'devtools.js')
    });
    console.log('✓ Built devtools.js');

    // Build panel.ts
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'panel.tsx')],
      outfile: join(extensionDir, 'panel.js')
    });
    console.log('✓ Built panel.js');

    // Build background.ts
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'background.ts')],
      outfile: join(extensionDir, 'background.js')
    });
    console.log('✓ Built background.js');

    // Build content.ts
    await esbuild.build({
      ...commonConfig,
      format: 'iife',
      entryPoints: [join(srcDir, 'content.ts')],
      outfile: join(extensionDir, 'content.js')
    });
    console.log('✓ Built content.js');

    // Build bridge.ts
    await esbuild.build({
      ...commonConfig,
      entryPoints: [join(srcDir, 'bridge.ts')],
      outfile: join(extensionDir, 'bridge.js')
    });
    console.log('✓ Built bridge.js');

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
