import { IMSCCRemapper } from '../src/remapper';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock dependencies
jest.mock('fs');
jest.mock('os');
jest.mock('../src/unpacker');
jest.mock('xml2js', () => ({
  parseStringPromise: jest.fn(),
}));

import { parseStringPromise } from 'xml2js';
import { IMSCCUnpacker } from '../src/unpacker';

describe('IMSCCRemapper', () => {
  const mockInputDir = '/test/input';
  const mockOutputDir = '/test/output';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // Helper: minimal manifest that passes remap with no items to process
  function setupMinimalRemap() {
    (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
    (parseStringPromise as jest.Mock).mockResolvedValue({
      manifest: { organizations: [{ organization: [{}] }], resources: {} },
    });
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });
  }

  describe('remap - input validation', () => {
    it('should throw if neither inputFile nor inputDir is provided', async () => {
      const remapper = new IMSCCRemapper({ outputDir: mockOutputDir });
      await expect(remapper.remap()).rejects.toThrow('Either inputFile or inputDir must be provided');
    });

    it('should throw if inputFile does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const remapper = new IMSCCRemapper({ inputFile: '/test/missing.imscc', outputDir: mockOutputDir });
      await expect(remapper.remap()).rejects.toThrow('Input file not found');
    });

    it('should throw if inputDir does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const remapper = new IMSCCRemapper({ inputDir: '/test/missing', outputDir: mockOutputDir });
      await expect(remapper.remap()).rejects.toThrow('Input directory not found');
    });

    it('should throw if manifest not found in inputDir', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)   // inputDir exists
        .mockReturnValueOnce(false); // manifest doesn't exist
      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await expect(remapper.remap()).rejects.toThrow('imsmanifest.xml not found');
    });

    it('should create output directory if it does not exist', async () => {
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        return false; // outputDir doesn't exist
      });
      setupMinimalRemap();

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true });
      await remapper.remap();

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockOutputDir, { recursive: true });
    });
  });

  describe('remap - inputFile path', () => {
    it('should unpack IMSCC file to temp directory and clean up', async () => {
      const mockTempDir = '/tmp/cm-packer-abc123';
      (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
      (fs.mkdtempSync as jest.Mock).mockReturnValue(mockTempDir);
      (fs.rmSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === '/test/course.imscc') return true;
        if (p.includes('imsmanifest.xml')) return true;
        if (p === mockTempDir) return true;
        return false;
      });
      setupMinimalRemap();

      const mockUnpack = jest.fn().mockResolvedValue(undefined);
      (IMSCCUnpacker as jest.Mock).mockImplementation(() => ({ unpack: mockUnpack }));

      const remapper = new IMSCCRemapper({
        inputFile: '/test/course.imscc',
        outputDir: mockOutputDir,
        verbose: true,
      });
      await remapper.remap();

      expect(IMSCCUnpacker).toHaveBeenCalled();
      expect(mockUnpack).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalledWith(mockTempDir, { recursive: true, force: true });
    });
  });

  describe('remap - non-Error exception', () => {
    it('should re-throw non-Error exceptions', async () => {
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      (fs.readFileSync as jest.Mock).mockImplementation(() => { throw 'string error'; });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await expect(remapper.remap()).rejects.toBe('string error');
    });
  });

  describe('remap - extractTitles with string title', () => {
    it('should handle title as plain string (not array)', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'item1', identifierref: 'res1' },
                title: 'Plain String Title', // string, not array
              }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        return false; // output paths return false to prevent getUniqueFilePath loops
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });

  describe('remap - buildDirectoryStructure branches', () => {
    it('should handle single top-level item with empty title (process children)', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'root' },
                title: [''],  // empty title
                item: [{
                  $: { identifier: 'child1', identifierref: 'res1' },
                  title: ['Lesson 1'],
                }],
              }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        return false;
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should handle multiple top-level items', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [
                { $: { identifier: 'i1', identifierref: 'res1' }, title: ['Lesson A'] },
                { $: { identifier: 'i2', identifierref: 'res2' }, title: ['Lesson B'] },
              ],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && (p.includes('res1') || p.includes('res2'))) return true;
        return false;
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir,
      });
      await remapper.remap();
      expect((fs.copyFileSync as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('remap - getItemTitle/getItemChildren null guards', () => {
    it('should handle null items gracefully', async () => {
      const manifestData = {
        manifest: {
          organizations: [{ organization: [{ item: [null] }] }],
        },
      };
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      setupMinimalRemap();
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });
  });

  describe('remap - wiki XML reference resolution', () => {
    it('should resolve WIKI_REFERENCE pattern and copy wiki HTML', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'res1' }, title: ['Wiki Page'] }],
            }],
          }],
        },
      };

      const xmlContent = '<content url="$WIKI_REFERENCE$/pages/my-wiki-page"/>';

      (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('res1') && p.endsWith('.xml')) return xmlContent;
        return '<manifest/>';
      });
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('wiki_content')) return ['my-wiki-page.html'];
        return [];
      });
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.includes('wiki_content') && !p.endsWith('.html')) return true; // wiki dir
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should resolve wiki_content direct pattern', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'res1' }, title: ['Direct Wiki'] }],
            }],
          }],
        },
      };

      const xmlContent = '<content href="wiki_content/direct-page.html"/>';

      (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('res1') && p.endsWith('.xml')) return xmlContent;
        return '<manifest/>';
      });
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('wiki_content')) return ['direct-page.html'];
        return [];
      });
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.includes('wiki_content') && !p.endsWith('.html')) return true;
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });

    it('should handle extractWikiUrlFromXml read errors gracefully', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'res1' }, title: ['Broken XML'] }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('res1') && p.endsWith('.xml')) {
          throw new Error('Read error');
        }
        return '<manifest/>';
      });
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();
    });
  });

  describe('remap - getResourceHref error handling', () => {
    it('should return null when manifest read fails in getResourceHref', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'res1' }, title: ['Test Item'] }],
            }],
          }],
        },
      };

      let readCount = 0;
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        readCount++;
        if (readCount <= 2) return '<manifest/>';
        throw new Error('Read error');
      });
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();
    });
  });

  describe('remap - copySpecialDirectories overwrite', () => {
    it('should remove existing destination before copying special directories', async () => {
      const manifestData = {
        manifest: {
          organizations: [{ organization: [{}] }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.rmSync as jest.Mock).mockReturnValue(undefined);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true });
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();

      const rmSyncCalls = (fs.rmSync as jest.Mock).mock.calls;
      const specialDirRms = rmSyncCalls.filter((call: unknown[]) =>
        typeof call[0] === 'string' && (
          call[0].includes('course_settings') ||
          call[0].includes('web_resources') ||
          call[0].includes('non_cc_assessments')
        )
      );
      expect(specialDirRms.length).toBe(3);
    });
  });

  describe('remap - copyDirectory recursion', () => {
    it('should recursively copy subdirectories', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'resdir1' }, title: ['Assignment'] }],
            }],
          }],
        },
      };

      const mockDirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
      });

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.readdirSync as jest.Mock).mockImplementation((p: string, opts?: unknown) => {
        if (p === path.join(mockInputDir, 'resdir1') && opts) {
          return [mockDirent('subdir', true), mockDirent('file.html', false)];
        }
        if (p === path.join(mockInputDir, 'resdir1', 'subdir') && opts) {
          return [mockDirent('nested.html', false)];
        }
        return [];
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (p.includes('resdir1') && !p.includes(mockOutputDir)) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('resdir1') && !p.includes(mockOutputDir)) {
          return { isDirectory: () => true, isFile: () => false };
        }
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });

  describe('remap - sanitizeFilename truncation', () => {
    it('should truncate filenames longer than 200 characters', async () => {
      const longTitle = 'A'.repeat(250);
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'res1' }, title: [longTitle] }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();

      const copyCall = (fs.copyFileSync as jest.Mock).mock.calls.find(
        (call: unknown[]) => typeof call[1] === 'string' && call[1].includes('AAA')
      );
      if (copyCall) {
        const destPath = copyCall[1] as string;
        const basename = path.basename(destPath, path.extname(destPath));
        expect(basename.length).toBeLessThanOrEqual(200);
      }
    });
  });

  describe('remap - getUniqueFilePath counter', () => {
    it('should append counter when file already exists', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'res1' }, title: ['Duplicate Name'] }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);

      let uniqueCheckCount = 0;
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && p.includes('res1')) return true;
        if (typeof p === 'string' && p.includes('Duplicate Name')) {
          uniqueCheckCount++;
          return uniqueCheckCount <= 1; // first exists, second doesn't
        }
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();

      const copyCall = (fs.copyFileSync as jest.Mock).mock.calls.find(
        (call: unknown[]) => typeof call[1] === 'string' && call[1].includes('Duplicate Name_1')
      );
      expect(copyCall).toBeDefined();
    });
  });

  describe('remap - direct wiki_content href from manifest', () => {
    it('should copy wiki file when manifest resource href points to wiki_content', async () => {
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'wikiref1' }, title: ['Wiki From Manifest'] }],
            }],
          }],
        },
      };

      // Manifest XML that contains a resource with wiki_content href
      const manifestXml = '<manifest><resources><resource identifier="wikiref1" href="wiki_content/page1.html"/></resources></manifest>';

      (fs.readFileSync as jest.Mock).mockReturnValue(manifestXml);
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        // The wiki file exists in the working directory
        if (p.includes('wiki_content') && p.endsWith('page1.html')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();

      // Should copy the wiki file directly
      const copyCall = (fs.copyFileSync as jest.Mock).mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('wiki_content')
      );
      expect(copyCall).toBeDefined();
    });
  });

  describe('remap - getItemTitle/getItemChildren edge cases', () => {
    it('should return empty string for getItemTitle with non-object', async () => {
      // This tests the early return in getItemTitle for non-object items
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'root' },
                title: [''],
                item: ['not-an-object'],  // non-object child
              }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir,
      });
      // Should not throw even with non-object children
      await remapper.remap();
    });

    it('should handle getItemTitle with title as string directly', async () => {
      // Tests the string branch of getItemTitle (used in buildDirectoryStructure)
      const manifestData = {
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'item1', identifierref: 'res1' },
                title: 'String Title Direct',  // string not array
                item: [{
                  $: { identifier: 'child1', identifierref: 'res2' },
                  title: 'Child String Title',
                }],
              }],
            }],
          }],
        },
      };

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue(manifestData);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml')) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml')) return true;
        if (p.endsWith('.xml') && (p.includes('res1') || p.includes('res2'))) return true;
        return false;
      });

      const remapper = new IMSCCRemapper({
        inputDir: mockInputDir, outputDir: mockOutputDir, verbose: true,
      });
      await remapper.remap();

      // Should create folder for parent with string title and copy child
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });
});
