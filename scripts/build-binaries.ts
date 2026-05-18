import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

// require() paths are not rewritten by tsc; use the runtime path from scripts/dist/
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('../../package.json') as { version: string; pkg: { outputPath: string } };

interface BinaryTarget {
  pkgTarget: string;
  fileName: (versionLabel: string) => string;
}

const binaryTargets: Record<string, BinaryTarget> = {
  'linux-x64': {
    pkgTarget: 'node22-linux-x64',
    fileName: (versionLabel) => `cm-packer-${versionLabel}-linux-x64`,
  },
  'macos-x64': {
    pkgTarget: 'node22-macos-x64',
    fileName: (versionLabel) => `cm-packer-${versionLabel}-macos-x64`,
  },
  'windows-x64': {
    pkgTarget: 'node22-win-x64',
    fileName: (versionLabel) => `cm-packer-${versionLabel}-windows-x64.exe`,
  },
};

interface BuildOptions {
  outputDir: string;
  targets: string[];
}

function parseArgs(argv: string[]): BuildOptions {
  const options: BuildOptions = {
    outputDir: packageJson.pkg.outputPath,
    targets: Object.keys(binaryTargets),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--target' && argv[index + 1]) {
      options.targets = [argv[index + 1]];
      index += 1;
      continue;
    }

    if (arg === '--targets' && argv[index + 1]) {
      options.targets = argv[index + 1].split(',').map((target) => target.trim()).filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === '--output-dir' && argv[index + 1]) {
      options.outputDir = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function getVersionLabel(): string {
  const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME;
  if (tag) {
    return tag.replace(/[^0-9A-Za-z._-]/g, '-');
  }
  return `v${packageJson.version}`;
}

function ensureBuildOutputExists(): string {
  // __dirname at runtime is scripts/dist/, so ../../dist resolves to the project dist/
  const distCliPath = path.resolve(__dirname, '../../dist/cli.js');
  if (!fs.existsSync(distCliPath)) {
    throw new Error('dist/cli.js not found. Run "npm run build" before building binaries.');
  }
  return distCliPath;
}

function resolvePkgBin(): string {
  const pkgBinary = process.platform === 'win32' ? 'pkg.exe' : 'pkg';
  return path.resolve(__dirname, `../../node_modules/.bin/${pkgBinary}`);
}

function buildBinary(
  distCliPath: string,
  outputDir: string,
  versionLabel: string,
  targetName: string,
): string {
  const target = binaryTargets[targetName];
  if (!target) {
    throw new Error(`Unsupported binary target: ${targetName}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, target.fileName(versionLabel));
  const pkgResult = spawnSync(
    resolvePkgBin(),
    [distCliPath, '--targets', target.pkgTarget, '--output', outputPath],
    {
      stdio: 'inherit',
      env: process.env,
    },
  );

  if (pkgResult.status !== 0) {
    throw new Error(`pkg failed for target ${targetName}`);
  }

  return outputPath;
}

function main(): void {
  const { outputDir, targets } = parseArgs(process.argv.slice(2));
  const versionLabel = getVersionLabel();
  const distCliPath = ensureBuildOutputExists();

  const builtPaths = targets.map((targetName) =>
    buildBinary(distCliPath, outputDir, versionLabel, targetName),
  );
  console.log(`Built binaries:\n${builtPaths.join('\n')}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
