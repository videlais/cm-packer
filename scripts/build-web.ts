import esbuild from 'esbuild';

async function build(): Promise<void> {
  try {
    console.log('Building web version...');

    await esbuild.build({
      entryPoints: ['src/web/cm-packer.web.ts'],
      bundle: true,
      outfile: 'docs/cm-packer.js',
      format: 'iife',
      target: 'es2020',
      minify: true,
      sourcemap: true,
      globalName: 'CMPacker',
      banner: {
        js: '/* CM-Packer Web - Built from TypeScript */',
      },
    });

    console.log('✓ Built docs/cm-packer.js');
    console.log('✓ Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

void build();
