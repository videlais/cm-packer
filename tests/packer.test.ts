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
    (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => false });
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

    it('should reject symbolic links while packing', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['shortcut']);
      (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => true });

      const mockZip = {
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await expect(packer.pack()).rejects.toThrow('symbolic link');
      expect(mockZip.writeZip).not.toHaveBeenCalled();
    });

    it('should reject symbolic links while scanning resources for a default manifest', async () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      (fs.readdirSync as jest.Mock).mockReturnValue(['shortcut']);
      (fs.lstatSync as jest.Mock).mockReturnValue({ isSymbolicLink: () => true });

      const mockZip = {
        writeZip: jest.fn(),
      };
      (AdmZip as jest.Mock).mockReturnValue(mockZip);

      const packer = new IMSCCPacker({
        inputDir: mockInputDir,
        outputFile: mockOutputFile,
      });

      await expect(packer.pack()).rejects.toThrow('symbolic link');
      expect(mockZip.writeZip).not.toHaveBeenCalled();
    });

    it('should not skip metadata.json in subdirectories', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce(['subfolder', 'imsmanifest.xml']) // root level
        .mockReturnValueOnce(['metadata.json', 'lesson.html']); // inside subfolder

      (fs.statSync as jest.Mock)
        .mockReturnValueOnce({ isDirectory: () => true })   // subfolder
        .mockReturnValueOnce({ isDirectory: () => false })   // imsmanifest.xml
        .mockReturnValueOnce({ isDirectory: () => false })   // metadata.json in sub
        .mockReturnValueOnce({ isDirectory: () => false });  // lesson.html

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

      // metadata.json in subdirectory should NOT be skipped (3 files total)
      expect(mockZip.addLocalFile).toHaveBeenCalledTimes(3);
    });

    it('should scan nested directories when creating default manifest', async () => {
      (fs.existsSync as jest.Mock).mockReset();
      (fs.readdirSync as jest.Mock).mockReset();
      (fs.statSync as jest.Mock).mockReset();

      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input dir exists
        .mockReturnValueOnce(false) // manifest doesn't exist
        .mockReturnValueOnce(true); // output dir exists

      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce(['subdir', 'file.html'])  // scanResources root
        .mockReturnValueOnce(['nested.xml'])            // scanResources subdir
        .mockReturnValueOnce(['subdir', 'file.html', 'imsmanifest.xml']) // addDirectoryToZip root
        .mockReturnValueOnce(['nested.xml']);            // addDirectoryToZip subdir

      (fs.statSync as jest.Mock)
        .mockReturnValueOnce({ isDirectory: () => true })   // subdir in scanResources
        .mockReturnValueOnce({ isDirectory: () => false })  // nested.xml in scanResources
        .mockReturnValueOnce({ isDirectory: () => false })  // file.html in scanResources
        .mockReturnValueOnce({ isDirectory: () => true })   // subdir in addDir
        .mockReturnValueOnce({ isDirectory: () => false })  // file.html in addDir
        .mockReturnValueOnce({ isDirectory: () => false })  // imsmanifest.xml in addDir
        .mockReturnValueOnce({ isDirectory: () => false }); // nested.xml in addDir subdir

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

      // Manifest should contain the nested XML resource
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[1]).toContain('nested.xml');
      expect(writeCall[1]).toContain('imsqti_xmlv1p2/imscc_xmlv1p3/assessment');
    });

    it('should skip metadata.json when scanning resources for manifest', async () => {
      (fs.existsSync as jest.Mock).mockReset();
      (fs.readdirSync as jest.Mock).mockReset();
      (fs.statSync as jest.Mock).mockReset();

      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(true)  // input dir exists
        .mockReturnValueOnce(false) // manifest doesn't exist
        .mockReturnValueOnce(true); // output dir exists

      (fs.readdirSync as jest.Mock)
        .mockReturnValueOnce(['metadata.json', 'file.html'])  // scanResources root
        .mockReturnValueOnce(['metadata.json', 'file.html', 'imsmanifest.xml']); // addDirectoryToZip root

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

      // Only file.html should be in manifest resources (metadata.json skipped)
      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[1]).toContain('file.html');
      expect(writeCall[1]).not.toContain('metadata.json');
    });
  });
});
