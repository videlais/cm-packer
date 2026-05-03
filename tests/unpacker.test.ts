import { IMSCCUnpacker, normalizeArchiveEntryPath } from '../src/unpacker';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

// Mock dependencies
jest.mock('fs');
jest.mock('adm-zip');
jest.mock('xml2js', () => ({
  parseStringPromise: jest.fn(),
}));

import { parseStringPromise } from 'xml2js';

describe('IMSCCUnpacker', () => {
  const mockInputFile = '/test/input.imscc';
  const mockOutputDir = '/test/output';

  const createMockEntry = (
    entryName: string,
    options: {
      isDirectory?: boolean;
      size?: number;
      data?: Buffer;
      attr?: number;
    } = {},
  ) => ({
    entryName,
    isDirectory: options.isDirectory ?? false,
    attr: options.attr ?? 0,
    header: {
      size: options.size ?? options.data?.length ?? 0,
    },
    getData: jest.fn().mockReturnValue(options.data ?? Buffer.from('file-data')),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('unpack', () => {
    it('should throw error if input file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await expect(unpacker.unpack()).rejects.toThrow('Input file not found');
    });

    it('should create output directory if it does not exist', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input file exists
        .mockReturnValueOnce(false) // output dir doesn't exist
        .mockReturnValueOnce(false); // manifest doesn't exist

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await unpacker.unpack();

      expect(fs.mkdirSync).toHaveBeenCalledWith(mockOutputDir, { recursive: true });
    });

    it('should extract ZIP contents to output directory', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const fileData = Buffer.from('<html />');
      const mockZip = {
        getEntries: jest.fn().mockReturnValue([
          createMockEntry('course/page.html', { data: fileData }),
        ]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const mockManifest = `<?xml version="1.0"?>
        <manifest>
          <metadata>
            <schema>IMS Common Cartridge</schema>
            <schemaversion>1.4.0</schemaversion>
          </metadata>
        </manifest>`;

      (fs.readFileSync as jest.Mock).mockReturnValue(mockManifest);
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          metadata: {
            schema: 'IMS Common Cartridge',
            schemaversion: '1.4.0',
          },
          resources: {
            resource: [{ type: 'webcontent' }, { type: 'assessment' }],
          },
          organizations: {
            organization: [{ identifier: 'org-1' }],
          },
        },
      });

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: true,
      });

      await unpacker.unpack();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/output/course', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledWith('/test/output/course/page.html', fileData);
    });

    it('should handle missing manifest file', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input file exists
        .mockReturnValueOnce(true)  // output dir exists
        .mockReturnValueOnce(false); // manifest doesn't exist

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: true,
      });

      await unpacker.unpack();

      expect(mockZip.getEntries).toHaveBeenCalled();
      // Should not crash when manifest is missing
    });

    it('should handle manifest parsing errors', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      (fs.readFileSync as jest.Mock).mockReturnValue('invalid xml');
      (parseStringPromise as jest.Mock).mockRejectedValue(new Error('Parse error'));

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: true,
      });

      // Should not throw, just log warning
      await expect(unpacker.unpack()).resolves.not.toThrow();
    });

    it('should work without verbose mode', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: false,
      });

      await unpacker.unpack();

      expect(mockZip.getEntries).toHaveBeenCalled();
    });

    it('should create metadata.json with summary', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const mockManifest = `<?xml version="1.0"?><manifest></manifest>`;
      (fs.readFileSync as jest.Mock).mockReturnValue(mockManifest);
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          metadata: {
            schema: 'IMS Common Cartridge',
            schemaversion: '1.4.0',
          },
          resources: {
            resource: [{ type: 'webcontent' }, { type: 'assessment' }, { type: 'discussion' }],
          },
          organizations: {
            organization: [{ identifier: 'org-1' }, { identifier: 'org-2' }],
          },
        },
      });

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await unpacker.unpack();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const metadata = JSON.parse(writeCall[1]);
      expect(metadata.schema).toBe('IMS Common Cartridge');
      expect(metadata.schemaVersion).toBe('1.4.0');
      expect(metadata.resourceCount).toBe(3);
      expect(metadata.organizationCount).toBe(2);
      expect(metadata.extractedAt).toBeDefined();
    });

    it('should handle manifest with missing metadata', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest></manifest>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {},
      });

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await unpacker.unpack();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const metadata = JSON.parse(writeCall[1]);
      expect(metadata.schema).toBe('Unknown');
      expect(metadata.schemaVersion).toBe('Unknown');
      expect(metadata.resourceCount).toBe(0);
      expect(metadata.organizationCount).toBe(0);
    });

    it('should handle non-Error exceptions', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      const mockZip = {
        getEntries: jest.fn().mockImplementation(() => {
          throw 'string error';
        }),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await expect(unpacker.unpack()).rejects.toBe('string error');
    });

    it('should use existing output directory if it exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const mockManifest = `<?xml version="1.0"?><manifest></manifest>`;
      (fs.readFileSync as jest.Mock).mockReturnValue(mockManifest);
      (parseStringPromise as jest.Mock).mockResolvedValue({ manifest: {} });

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await unpacker.unpack();

      // Should not call mkdirSync when directory exists
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle manifest parsing with non-Error exception', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      (fs.readFileSync as jest.Mock).mockReturnValue('xml content');
      (parseStringPromise as jest.Mock).mockRejectedValue('non-error string');

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: true,
      });

      // Should not throw - non-Error exceptions are caught silently
      await expect(unpacker.unpack()).resolves.not.toThrow();
    });

    it('should handle manifest with array-wrapped metadata values', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      (fs.readFileSync as jest.Mock).mockReturnValue('<manifest/>');
      (parseStringPromise as jest.Mock).mockResolvedValue({
        manifest: {
          metadata: [
            {
              schema: ['IMS Common Cartridge'],
              schemaversion: ['1.4.0'],
            },
          ],
          resources: [
            {
              resource: [{ type: 'webcontent' }],
            },
          ],
          organizations: [
            {
              organization: [{ identifier: 'org-1' }],
            },
          ],
        },
      });

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: true,
      });

      await unpacker.unpack();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      const metadata = JSON.parse(writeCall[1]);
      expect(metadata.schema).toBe('IMS Common Cartridge');
      expect(metadata.schemaVersion).toBe('1.4.0');
      expect(metadata.resourceCount).toBe(1);
      expect(metadata.organizationCount).toBe(1);
    });

    it('should reject archive entries that escape the output directory', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([createMockEntry('../escape.txt')]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await expect(unpacker.unpack()).rejects.toThrow('escapes the output directory');
    });

    it('should reject oversize archives before extraction', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([
          createMockEntry('big.bin', { size: 1024 * 1024 * 1024 + 1 }),
        ]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await expect(unpacker.unpack()).rejects.toThrow('exceeding the');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should reject archives with too many entries', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      const mockEntries = Array.from({ length: 10001 }, (_, index) =>
        createMockEntry(`file-${index}.txt`),
      );
      const mockZip = {
        getEntries: jest.fn().mockReturnValue(mockEntries),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await expect(unpacker.unpack()).rejects.toThrow('too many entries');
    });

    it('should reject symbolic link entries', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([
          createMockEntry('link', { attr: 0o120000 << 16 }),
        ]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await expect(unpacker.unpack()).rejects.toThrow('symbolic link');
    });

    it('should create directories for directory entries', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([
          createMockEntry('course-folder/', { isDirectory: true }),
        ]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
      });

      await unpacker.unpack();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/output/course-folder', { recursive: true });
    });

    it('should reject manifests with DTD or entity declarations', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const mockZip = {
        getEntries: jest.fn().mockReturnValue([]),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      (fs.readFileSync as jest.Mock).mockReturnValue(
        '<!DOCTYPE manifest [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><manifest></manifest>',
      );

      const unpacker = new IMSCCUnpacker({
        inputFile: mockInputFile,
        outputDir: mockOutputDir,
        verbose: true,
      });

      await expect(unpacker.unpack()).resolves.not.toThrow();
      expect(parseStringPromise).not.toHaveBeenCalled();
    });
  });

  describe('normalizeArchiveEntryPath', () => {
    it('should reject empty or dot-only archive paths', () => {
      expect(() => normalizeArchiveEntryPath('')).toThrow('invalid path');
      expect(() => normalizeArchiveEntryPath('./')).toThrow('invalid path');
    });
  });
});
