const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  try {
    console.log('Building web version...');

    // Build the TypeScript to JavaScript
    await esbuild.build({
      entryPoints: ['src/web/cm-packer.web.ts'],
      bundle: true,
      outfile: 'docs/cm-packer.js',
      format: 'iife',
      target: 'es2020',
      minify: true,
      sourcemap: true,
      globalName: 'CMPacker',
      // Define JSZip and saveAs as external globals loaded via CDN
      banner: {
        js: '/* CM-Packer Web - Built from TypeScript */'
      }
    });

    console.log('✓ Built docs/cm-packer.js');
    console.log('✓ Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
