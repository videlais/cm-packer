import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

function assertExists(filePath: string, message?: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(message ?? `Expected file to exist: ${filePath}`);
  }
}

function runBinary(binaryPath: string, args: string[]): void {
  execFileSync(binaryPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
}

function main(): void {
  if (!process.argv[2]) {
    throw new Error('Usage: node scripts/smoke-test-binary.js <binary-path> [fixture-path]');
  }

  // Resolve to absolute paths to prevent path traversal (CodeQL: js/path-injection)
  const binaryPath = path.resolve(process.argv[2]);
  const fixturePath = process.argv[3]
    ? path.resolve(process.argv[3])
    // __dirname at runtime is scripts/dist/, so ../../examples resolves to examples/ at project root
    : path.resolve(__dirname, '../../examples/sample-course.imscc');

  assertExists(binaryPath, `Binary not found: ${binaryPath}`);
  assertExists(fixturePath, `Fixture not found: ${fixturePath}`);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-packer-binary-'));
  const unpackDir = path.join(tempRoot, 'unpacked');
  const remapDir = path.join(tempRoot, 'remapped');
  const repackedFile = path.join(tempRoot, 'repacked.imscc');

  runBinary(binaryPath, ['unpack', '-i', fixturePath, '-o', unpackDir]);
  assertExists(path.join(unpackDir, 'imsmanifest.xml'), 'Binary unpack did not produce imsmanifest.xml');
  assertExists(path.join(unpackDir, 'metadata.json'), 'Binary unpack did not produce metadata.json');

  runBinary(binaryPath, ['pack', '-i', unpackDir, '-o', repackedFile]);
  assertExists(repackedFile, 'Binary pack did not produce an imscc file');

  runBinary(binaryPath, ['remap', '-i', unpackDir, '-o', remapDir]);
  assertExists(remapDir, 'Binary remap did not produce an output directory');

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(`Binary smoke test passed for ${path.basename(binaryPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
