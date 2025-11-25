import { IMSCCPacker } from '../src/packer';
import * as fs from 'fs';
import AdmZip from 'adm-zip';

// Mock dependencies
jest.mock('fs');
jest.mock('adm-zip');

describe('IMSCCPacker', () => {
  const mockInputDir = '/test/input';
  const mockOutputFile = '/test/output.imscc';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pack', () => {
    it('should throw error if input directory does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await expect(packer.pack()).rejects.toThrow('Input directory not found');
    });

    it('should create ZIP file with directory contents', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['file1.html', 'imsmanifest.xml']);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
        verbose: true,
      });

      await packer.pack();

      expect(mockZip.writeZip).toHaveBeenCalledWith(mockOutputFile);
    });

    it('should create output directory if it does not exist', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input dir exists
        .mockReturnValueOnce(true)  // manifest exists
        .mockReturnValueOnce(false); // output dir doesn't exist

      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      const mockZip = {
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: '/new/path/output.imscc',
      });

      await packer.pack();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/path', { recursive: true });
    });

    it('should create default manifest if not present', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input dir exists
        .mockReturnValueOnce(false) // manifest doesn't exist
        .mockReturnValueOnce(true); // output dir exists

      (fs.readdirSync as jest.Mock).mockReturnValue(['file1.html']);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
        verbose: true,
      });

      await packer.pack();

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockZip.writeZip).toHaveBeenCalled();
    });

    it('should skip metadata.json when adding files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['metadata.json', 'file1.html', 'imsmanifest.xml']);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await packer.pack();

      // metadata.json should be skipped
      expect(mockZip.addLocalFile).toHaveBeenCalledTimes(2); // only file1.html and imsmanifest.xml
    });

    it('should handle nested directories', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      
      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce(['subfolder', 'imsmanifest.xml']) // root level
        .mockReturnValueOnce(['nested.html']); // inside subfolder
      
      (fs.statSync as jest.Mock)
        .mockReturnValueOnce({ isDirectory: () => true })  // subfolder
        .mockReturnValueOnce({ isDirectory: () => false }) // imsmanifest.xml
        .mockReturnValueOnce({ isDirectory: () => false }); // nested.html

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
        verbose: true,
      });

      await packer.pack();

      expect(mockZip.addLocalFile).toHaveBeenCalledTimes(2);
    });

    it('should handle different file types when creating manifest', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input dir exists
        .mockReturnValueOnce(false) // manifest doesn't exist
        .mockReturnValueOnce(true); // output dir exists

      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce(['file.html', 'file.xml', 'file.txt']) // root scan
        .mockReturnValueOnce(['file.html', 'file.xml', 'file.txt', 'imsmanifest.xml']); // resource scan
      
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await packer.pack();

      // Should create manifest with different resource types
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[1]).toContain('webcontent');
      expect(writeCall[1]).toContain('imsqti_xmlv1p2/imscc_xmlv1p3/assessment');
    });

    it('should handle .htm files as webcontent', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input dir exists
        .mockReturnValueOnce(false) // manifest doesn't exist
        .mockReturnValueOnce(true); // output dir exists

      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce(['file.htm']) // root scan
        .mockReturnValueOnce(['file.htm']); // resource scan
      
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
      (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await packer.pack();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[1]).toContain('webcontent');
      expect(writeCall[1]).toContain('file.htm');
    });

    it('should work without verbose mode', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['imsmanifest.xml']);
      (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

      const mockZip = {
        addLocalFile: jest.fn(),
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
        verbose: false,
      });

      await packer.pack();

      expect(mockZip.writeZip).toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        throw 'string error';
      });

      const mockZip = {
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await expect(packer.pack()).rejects.toBe('string error');
    });
  });
});
