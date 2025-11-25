import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

const CLI_PATH = path.join(__dirname, '../dist/cli.js');
const TEST_DIR = path.join(__dirname, '../test-output');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('CLI Integration Tests', () => {
  beforeAll(() => {
    // Ensure CLI is built
    if (!fs.existsSync(CLI_PATH)) {
      execSync('npm run build', { cwd: path.join(__dirname, '..') });
    }

    // Create test directories
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up test output
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean test directory before each test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  describe('pack command', () => {
    it('should pack a directory into an IMSCC file', () => {
      // Create test content
      const inputDir = path.join(TEST_DIR, 'input');
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(
        path.join(inputDir, 'test.html'),
        '<html><body>Test Content</body></html>'
      );
      fs.writeFileSync(
        path.join(inputDir, 'test.txt'),
        'Sample text file'
      );

      const outputFile = path.join(TEST_DIR, 'output.imscc');

      // Execute CLI
      const result = execSync(
        `node "${CLI_PATH}" pack -i "${inputDir}" -o "${outputFile}"`,
        { encoding: 'utf-8' }
      );

      // Verify output
      expect(result).toContain('Successfully packed');
      expect(fs.existsSync(outputFile)).toBe(true);

      // Verify ZIP contents
      const zip = new AdmZip(outputFile);
      const entries = zip.getEntries();
      const entryNames = entries.map(e => e.entryName);

      expect(entryNames).toContain('imsmanifest.xml');
      expect(entryNames).toContain('test.html');
      expect(entryNames).toContain('test.txt');
    });

    it('should pack with verbose output', () => {
      const inputDir = path.join(TEST_DIR, 'input');
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, 'file.html'), 'test');

      const outputFile = path.join(TEST_DIR, 'output.imscc');

      const result = execSync(
        `node "${CLI_PATH}" pack -i "${inputDir}" -o "${outputFile}" -v`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('Packing directory');
      expect(result).toContain('Creating IMSCC file');
    });

    it('should handle nested directories', () => {
      const inputDir = path.join(TEST_DIR, 'input');
      const subDir = path.join(inputDir, 'subfolder');
      fs.mkdirSync(subDir, { recursive: true });
      
      fs.writeFileSync(path.join(inputDir, 'root.html'), 'root content');
      fs.writeFileSync(path.join(subDir, 'nested.html'), 'nested content');

      const outputFile = path.join(TEST_DIR, 'output.imscc');

      execSync(
        `node "${CLI_PATH}" pack -i "${inputDir}" -o "${outputFile}"`,
        { encoding: 'utf-8' }
      );

      const zip = new AdmZip(outputFile);
      const entries = zip.getEntries();
      const entryNames = entries.map(e => e.entryName);

      expect(entryNames).toContain('root.html');
      expect(entryNames.some(name => name.includes('subfolder') && name.includes('nested.html'))).toBe(true);
    });

    it('should fail with error when input directory does not exist', () => {
      const inputDir = path.join(TEST_DIR, 'nonexistent');
      const outputFile = path.join(TEST_DIR, 'output.imscc');

      expect(() => {
        execSync(
          `node "${CLI_PATH}" pack -i "${inputDir}" -o "${outputFile}"`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }).toThrow();
    });

    it('should create output directory if it does not exist', () => {
      const inputDir = path.join(TEST_DIR, 'input');
      fs.mkdirSync(inputDir, { recursive: true });
      fs.writeFileSync(path.join(inputDir, 'test.html'), 'test');

      const outputFile = path.join(TEST_DIR, 'new', 'path', 'output.imscc');

      execSync(
        `node "${CLI_PATH}" pack -i "${inputDir}" -o "${outputFile}"`,
        { encoding: 'utf-8' }
      );

      expect(fs.existsSync(outputFile)).toBe(true);
    });

    it('should use existing manifest if present', () => {
      const inputDir = path.join(TEST_DIR, 'input');
      fs.mkdirSync(inputDir, { recursive: true });
      
      const customManifest = `<?xml version="1.0"?>
        <manifest identifier="custom-id">
          <metadata>
            <schema>IMS Common Cartridge</schema>
            <schemaversion>1.4.0</schemaversion>
          </metadata>
        </manifest>`;
      
      fs.writeFileSync(path.join(inputDir, 'imsmanifest.xml'), customManifest);
      fs.writeFileSync(path.join(inputDir, 'test.html'), 'test');

      const outputFile = path.join(TEST_DIR, 'output.imscc');

      execSync(
        `node "${CLI_PATH}" pack -i "${inputDir}" -o "${outputFile}"`,
        { encoding: 'utf-8' }
      );

      const zip = new AdmZip(outputFile);
      const manifest = zip.readAsText('imsmanifest.xml');
      expect(manifest).toContain('custom-id');
    });
  });

  describe('unpack command', () => {
    it('should unpack an IMSCC file into a directory', () => {
      // Create a test IMSCC file
      const zip = new AdmZip();
      const manifest = `<?xml version="1.0"?>
        <manifest>
          <metadata>
            <schema>IMS Common Cartridge</schema>
            <schemaversion>1.4.0</schemaversion>
          </metadata>
          <resources>
            <resource identifier="r1" type="webcontent" href="test.html">
              <file href="test.html"/>
            </resource>
          </resources>
        </manifest>`;
      
      zip.addFile('imsmanifest.xml', Buffer.from(manifest));
      zip.addFile('test.html', Buffer.from('<html><body>Test</body></html>'));
      zip.addFile('data.txt', Buffer.from('Sample data'));

      const inputFile = path.join(TEST_DIR, 'input.imscc');
      zip.writeZip(inputFile);

      const outputDir = path.join(TEST_DIR, 'output');

      // Execute CLI
      const result = execSync(
        `node "${CLI_PATH}" unpack -i "${inputFile}" -o "${outputDir}"`,
        { encoding: 'utf-8' }
      );

      // Verify output
      expect(result).toContain('Successfully unpacked');
      expect(fs.existsSync(outputDir)).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'imsmanifest.xml'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'test.html'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'data.txt'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'metadata.json'))).toBe(true);
    });

    it('should unpack with verbose output', () => {
      const zip = new AdmZip();
      zip.addFile('imsmanifest.xml', Buffer.from('<manifest></manifest>'));
      
      const inputFile = path.join(TEST_DIR, 'input.imscc');
      zip.writeZip(inputFile);

      const outputDir = path.join(TEST_DIR, 'output');

      const result = execSync(
        `node "${CLI_PATH}" unpack -i "${inputFile}" -o "${outputDir}" -v`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('Unpacking IMSCC file');
      expect(result).toContain('Extracting files');
    });

    it('should create metadata.json with correct information', () => {
      const zip = new AdmZip();
      const manifest = `<?xml version="1.0"?>
        <manifest>
          <metadata>
            <schema>IMS Common Cartridge</schema>
            <schemaversion>1.4.0</schemaversion>
          </metadata>
          <resources>
            <resource identifier="r1" type="webcontent"/>
            <resource identifier="r2" type="assessment"/>
          </resources>
          <organizations>
            <organization identifier="org1"/>
          </organizations>
        </manifest>`;
      
      zip.addFile('imsmanifest.xml', Buffer.from(manifest));

      const inputFile = path.join(TEST_DIR, 'input.imscc');
      zip.writeZip(inputFile);

      const outputDir = path.join(TEST_DIR, 'output');

      execSync(
        `node "${CLI_PATH}" unpack -i "${inputFile}" -o "${outputDir}"`,
        { encoding: 'utf-8' }
      );

      const metadataPath = path.join(outputDir, 'metadata.json');
      expect(fs.existsSync(metadataPath)).toBe(true);
      
      const metadata = JSON.parse(
        fs.readFileSync(metadataPath, 'utf-8')
      );

      expect(metadata.schema).toBe('IMS Common Cartridge');
      expect(metadata.schemaVersion).toBe('1.4.0');
      expect(metadata.resourceCount).toBe(2);
      expect(metadata.organizationCount).toBe(1);
      expect(metadata.extractedAt).toBeDefined();
    });

    it('should fail with error when input file does not exist', () => {
      const inputFile = path.join(TEST_DIR, 'nonexistent.imscc');
      const outputDir = path.join(TEST_DIR, 'output');

      expect(() => {
        execSync(
          `node "${CLI_PATH}" unpack -i "${inputFile}" -o "${outputDir}"`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }).toThrow();
    });

    it('should handle IMSCC without manifest gracefully', () => {
      const zip = new AdmZip();
      zip.addFile('test.html', Buffer.from('test content'));

      const inputFile = path.join(TEST_DIR, 'input.imscc');
      zip.writeZip(inputFile);

      const outputDir = path.join(TEST_DIR, 'output');

      const result = execSync(
        `node "${CLI_PATH}" unpack -i "${inputFile}" -o "${outputDir}" -v`,
        { encoding: 'utf-8' }
      );

      expect(result).toContain('Successfully unpacked');
      expect(fs.existsSync(path.join(outputDir, 'test.html'))).toBe(true);
    });
  });

  describe('pack and unpack round-trip', () => {
    it('should maintain content through pack/unpack cycle', () => {
      // Create original content
      const originalDir = path.join(TEST_DIR, 'original');
      fs.mkdirSync(originalDir, { recursive: true });
      
      const htmlContent = '<html><body><h1>Test Course</h1></body></html>';
      const textContent = 'Sample text file content';
      
      fs.writeFileSync(path.join(originalDir, 'course.html'), htmlContent);
      fs.writeFileSync(path.join(originalDir, 'notes.txt'), textContent);

      // Pack
      const imsccFile = path.join(TEST_DIR, 'course.imscc');
      execSync(
        `node "${CLI_PATH}" pack -i "${originalDir}" -o "${imsccFile}"`,
        { encoding: 'utf-8' }
      );

      // Unpack
      const unpackedDir = path.join(TEST_DIR, 'unpacked');
      execSync(
        `node "${CLI_PATH}" unpack -i "${imsccFile}" -o "${unpackedDir}"`,
        { encoding: 'utf-8' }
      );

      // Verify content is preserved
      const unpackedHtml = fs.readFileSync(
        path.join(unpackedDir, 'course.html'),
        'utf-8'
      );
      const unpackedText = fs.readFileSync(
        path.join(unpackedDir, 'notes.txt'),
        'utf-8'
      );

      expect(unpackedHtml).toBe(htmlContent);
      expect(unpackedText).toBe(textContent);
    });

    it('should preserve directory structure through round-trip', () => {
      const originalDir = path.join(TEST_DIR, 'original');
      const subDir1 = path.join(originalDir, 'module1');
      const subDir2 = path.join(originalDir, 'module2');
      
      fs.mkdirSync(subDir1, { recursive: true });
      fs.mkdirSync(subDir2, { recursive: true });
      
      fs.writeFileSync(path.join(originalDir, 'index.html'), 'index');
      fs.writeFileSync(path.join(subDir1, 'lesson1.html'), 'lesson 1');
      fs.writeFileSync(path.join(subDir2, 'lesson2.html'), 'lesson 2');

      // Pack
      const imsccFile = path.join(TEST_DIR, 'course.imscc');
      execSync(
        `node "${CLI_PATH}" pack -i "${originalDir}" -o "${imsccFile}"`
      );

      // Unpack
      const unpackedDir = path.join(TEST_DIR, 'unpacked');
      execSync(
        `node "${CLI_PATH}" unpack -i "${imsccFile}" -o "${unpackedDir}"`
      );

      // Verify structure
      expect(fs.existsSync(path.join(unpackedDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(unpackedDir, 'module1', 'lesson1.html'))).toBe(true);
      expect(fs.existsSync(path.join(unpackedDir, 'module2', 'lesson2.html'))).toBe(true);
    });
  });

  describe('CLI error handling', () => {
    it('should show help when no command is provided', () => {
      const result = execSync(`node "${CLI_PATH}" --help`, { encoding: 'utf-8' });
      
      expect(result).toContain('cm-packer');
      expect(result).toContain('pack');
      expect(result).toContain('unpack');
    });

    it('should show version', () => {
      const result = execSync(`node "${CLI_PATH}" --version`, { encoding: 'utf-8' });
      
      expect(result).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should show command help for pack', () => {
      const result = execSync(`node "${CLI_PATH}" pack --help`, { encoding: 'utf-8' });
      
      expect(result).toContain('Pack a directory');
      expect(result).toContain('--input');
      expect(result).toContain('--output');
    });

    it('should show command help for unpack', () => {
      const result = execSync(`node "${CLI_PATH}" unpack --help`, { encoding: 'utf-8' });
      
      expect(result).toContain('Unpack an IMSCC file');
      expect(result).toContain('--input');
      expect(result).toContain('--output');
    });

    it('should require input option for pack', () => {
      expect(() => {
        execSync(
          `node "${CLI_PATH}" pack -o output.imscc`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }).toThrow();
    });

    it('should require output option for pack', () => {
      expect(() => {
        execSync(
          `node "${CLI_PATH}" pack -i input`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }).toThrow();
    });
  });
});
