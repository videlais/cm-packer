const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function assertExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(message || `Expected file to exist: ${filePath}`);
  }
}

function runBinary(binaryPath, args) {
  execFileSync(binaryPath, args, {
    stdio: 'inherit',
    env: process.env,
  });
}

function main() {
  const binaryPath = process.argv[2];
  const fixturePath = process.argv[3] || path.resolve(__dirname, '../examples/sample-course.imscc');

  if (!binaryPath) {
    throw new Error('Usage: node scripts/smoke-test-binary.js <binary-path> [fixture-path]');
  }

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