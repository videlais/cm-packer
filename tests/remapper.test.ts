import { getItemTitleFromNode, IMSCCRemapper } from '../src/remapper';
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

    it('should log and continue if temporary directory cleanup fails', async () => {
      const mockTempDir = '/tmp/cm-packer-abc123';
      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
      (fs.mkdtempSync as jest.Mock).mockReturnValue(mockTempDir);
      (fs.rmSync as jest.Mock).mockImplementation(() => {
        throw new Error('cleanup failed');
      });
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

      await expect(remapper.remap()).resolves.not.toThrow();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Failed to clean up temporary directory'));

      mockLog.mockRestore();
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

    it('should reject manifests with DTD or entity declarations', async () => {
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      (fs.readFileSync as jest.Mock).mockReturnValue(
        '<!DOCTYPE manifest [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><manifest></manifest>',
      );

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await expect(remapper.remap()).rejects.toThrow('unsupported DTD or entity declarations');
      expect(parseStringPromise).not.toHaveBeenCalled();
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

    it('should return an empty title for items without a title field', () => {
      expect(getItemTitleFromNode({})).toBe('');
    });

    it('should handle empty-title items with no children gracefully', async () => {
      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      expect((remapper as unknown as { getItemChildren: (item: unknown) => unknown[] }).getItemChildren({})).toEqual([]);
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

  // ─── Targeted branch coverage additions ───────────────────────────────────

  describe('getItemTitleFromNode - truthy non-string non-array title', () => {
    it('should return empty string when title is a truthy non-string non-array (e.g. empty array)', () => {
      // Empty array: Array.isArray=true but length=0 → falls to typeof check → not string → ''
      expect(getItemTitleFromNode({ title: [] })).toBe('');
    });
  });

  describe('remap - cleanup non-Error exception', () => {
    it('should stringify non-Error thrown during temp directory cleanup', async () => {
      const mockTempDir = '/tmp/cm-packer-abc123';
      const mockLog = jest.spyOn(console, 'log').mockImplementation();

      (os.tmpdir as jest.Mock).mockReturnValue('/tmp');
      (fs.mkdtempSync as jest.Mock).mockReturnValue(mockTempDir);
      (fs.rmSync as jest.Mock).mockImplementation(() => {
         
        throw 'non-error string value'; // non-Error exception
      });
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
      await expect(remapper.remap()).resolves.not.toThrow();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('non-error string value'));
      mockLog.mockRestore();
    });
  });

  describe('remap - manifest alternative structures', () => {
    function baseManifestSetup() {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
    }

    it('should handle parsed result with no manifest property (uses ?? fallback)', async () => {
      baseManifestSetup();
      // parsed.manifest is undefined → ?? {} fallback fires (lines 131, 205)
      (parseStringPromise as jest.Mock).mockResolvedValue({});

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });

    it('should handle manifest.organizations as a non-array object (else branch of ternary)', async () => {
      baseManifestSetup();
      // organizations is an object, not array → takes else/direct path (lines 132, 206)
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: { organizations: { organization: [{}] } },
      });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });

    it('should handle orgsObj with no organization property (optional chain false path)', async () => {
      baseManifestSetup();
      // orgsObj?.organization is undefined/falsy → if body skipped (lines 134, 208)
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: { organizations: [{}] },
      });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });

    it('should handle organization as a non-array object (wraps in array)', async () => {
      baseManifestSetup();
      // organization is a plain object → [orgsObj.organization] path taken (lines 135, 209)
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: { organizations: [{ organization: {} }] },
      });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });

    it('should handle org.item as a non-array object (wraps in array)', async () => {
      baseManifestSetup();
      // org.item is a plain object → [org.item] path taken (lines 139, 213)
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: { organizations: [{ organization: [{ item: {} }] }] },
      });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });
  });

  describe('remap - extractTitles and processItem no-$ fallbacks', () => {
    // A single item with a plain string title, no $ attribute, and a non-array item child
    // covers lines: 18, 153, 157, 160, 166, 169, 176, 243, 253, 254, 257
    it('should cover || identifier/identifierref fallbacks and non-array item child', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                // No $ at all → attrs is undefined → both || fallbacks fire (lines 153, 157, 253, 254)
                // title is a plain string → covers line 18 (getItemTitleFromNode) and line 160 (extractTitles)
                // no identifierref or identifier → covers lines 166, 169 (if-branches never true)
                // item is a non-array object → covers lines 176 (extractTitles) and 243 (getItemChildren)
                title: 'Plain String Title No Ids',
                item: {}, // non-array → wraps in [{}]; the child {} has no title → processItem early return (line 257)
              }],
            }],
          }],
        },
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });

    it('should not set title when title is truthy but not array or string', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'id1' },
                title: 42, // truthy, not array, not string → line 160 else-if false path
              }],
            }],
          }],
        },
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
    });
  });

  describe('remap - buildWikiMapping non-html files', () => {
    it('should skip non-.html files inside wiki_content directory', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: { organizations: [{ organization: [{}] }] },
      });
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (p.includes('wiki_content') && !p.endsWith('.css') && !p.endsWith('.js')) return true;
        return false;
      });
      (fs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('wiki_content')) {
          return ['styles.css', 'script.js']; // no .html files → if(file.endsWith('.html')) false path
        }
        return [];
      });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
      // wikiMapping stays empty; no copyFileSync for wiki files
    });
  });

  describe('remap - processItem folder already exists', () => {
    it('should skip mkdirSync when the folder path already exists', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'folder1' },
                title: ['Existing Folder'],
                item: [{ $: { identifier: 'c1', identifierref: 'res1' }, title: ['Child'] }],
              }],
            }],
          }],
        },
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (typeof p === 'string' && p.includes('Existing Folder')) return true; // folder already there
        return false;
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();

      // mkdirSync should NOT be called for the already-existing folder path
      const folderMkdir = (fs.mkdirSync as jest.Mock).mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('Existing Folder'),
      );
      expect(folderMkdir).toBeUndefined();
    });
  });

  describe('remap - processItem leaf: identifierref absent (uses identifier)', () => {
    it('should use identifier as refId when identifierref is absent', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                $: { identifier: 'res-only' }, // no identifierref in $ → line 254 and 272 false paths
                title: ['Identifier Only Item'],
              }],
            }],
          }],
        },
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (p.endsWith('.xml') && p.includes('res-only')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('.xml') && p.includes('res-only')) {
          return { isDirectory: () => false, isFile: () => true };
        }
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });

  describe('remap - processItem leaf: no identifiers at all', () => {
    it('should return early when neither identifierref nor identifier is present', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{
                // No $ → identifier and identifierref both undefined → refId undefined → early return (line 273)
                title: ['Title No Ids At All'],
              }],
            }],
          }],
        },
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        return false;
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
      // processItem early-returns before any resource copy; remap itself should complete without error
    });
  });

  describe('remap - processItem wiki href exists in manifest but file missing', () => {
    it('should not copy when wiki_content href is in manifest but the file is absent', async () => {
      const manifestXml =
        '<manifest><resources><resource identifier="wikiref1" href="wiki_content/missing.html"/></resources></manifest>';
      (fs.readFileSync as jest.Mock).mockReturnValue(manifestXml);
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'item1', identifierref: 'wikiref1' }, title: ['Missing Wiki'] }],
            }],
          }],
        },
      });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        // wiki file itself does NOT exist → if (fs.existsSync(wikiFile)) false path (line 279)
        return false;
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false, isFile: () => false });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
      // No wiki copy since file is missing
      const wikiCopy = (fs.copyFileSync as jest.Mock).mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('wiki_content'),
      );
      expect(wikiCopy).toBeUndefined();
    });
  });

  describe('remap - processItem file with no extension (ext || .xml fallback)', () => {
    it('should use .xml as extension fallback when file has no extension', async () => {
      // refId has no extension → second possibleFile has no ext → path.extname('') = '' → || '.xml' fires (line 305)
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'noext', identifierref: 'noext' }, title: ['No Ext File'] }],
            }],
          }],
        },
      });
      const noExtFile = path.join(mockInputDir, 'noext');
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (p === noExtFile) return true; // second possibleFile exists; first (.xml) does not
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (p === noExtFile) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });

  describe('remap - processItem file with non-xml extension skips wiki extraction', () => {
    it('should copy non-xml file without calling extractWikiUrlFromXml (line 309 false path)', async () => {
      // refId = 'resource.html' → second possibleFile = /input/resource.html → ext = '.html' → if(ext==='.xml') false
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          organizations: [{
            organization: [{
              item: [{ $: { identifier: 'res.html', identifierref: 'res.html' }, title: ['HTML Resource'] }],
            }],
          }],
        },
      });
      const htmlFile = path.join(mockInputDir, 'res.html');
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (p === htmlFile) return true; // /input/res.html exists; /input/res.html.xml does not
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (p === htmlFile) return { isDirectory: () => false, isFile: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();
      expect(fs.copyFileSync).toHaveBeenCalled();
    });
  });

  describe('remap - copySpecialDirectories destination does not exist', () => {
    it('should copy special dir without rmSync when destination does not already exist', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: { organizations: [{ organization: [{}] }] },
      });
      (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
      (fs.copyFileSync as jest.Mock).mockReturnValue(undefined);
      (fs.rmSync as jest.Mock).mockReturnValue(undefined);
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const srcSettings = path.join(mockInputDir, 'course_settings');
      const destSettings = path.join(mockOutputDir, 'course_settings');

      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (p === mockInputDir || p.includes('imsmanifest.xml') || p === mockOutputDir) return true;
        if (p === srcSettings) return true;  // source exists
        if (p === destSettings) return false; // destination does NOT exist → line 380 false path
        return false;
      });
      (fs.statSync as jest.Mock).mockImplementation((p: string) => {
        if (p === srcSettings) return { isDirectory: () => true };
        return { isDirectory: () => false, isFile: () => false };
      });

      const remapper = new IMSCCRemapper({ inputDir: mockInputDir, outputDir: mockOutputDir });
      await remapper.remap();

      // rmSync should NOT be called for course_settings since dest didn't exist
      const settingsRm = (fs.rmSync as jest.Mock).mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && call[0].includes('course_settings'),
      );
      expect(settingsRm).toBeUndefined();
    });
  });
});
