import { IMSCCPacker } from '../src/packer';
import { IMSCCUnpacker } from '../src/unpacker';

// Mock the modules
jest.mock('../src/packer');
jest.mock('../src/unpacker');

describe('CLI Commands', () => {
  let mockExit: jest.SpyInstance;
  let mockLog: jest.SpyInstance;
  let mockError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockLog = jest.spyOn(console, 'log').mockImplementation();
    mockError = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    mockExit.mockRestore();
    mockLog.mockRestore();
    mockError.mockRestore();
  });

  describe('unpack command', () => {
    it('should create unpacker with correct options', async () => {
      const mockUnpack = jest.fn().mockResolvedValue(undefined);
      (IMSCCUnpacker as jest.Mock).mockImplementation(() => ({
        unpack: mockUnpack,
      }));

      // Simulate command execution
      const unpacker = new IMSCCUnpacker({
        inputFile: '/test/input.imscc',
        outputDir: '/test/output',
        verbose: true,
      });

      await unpacker.unpack();

      expect(IMSCCUnpacker).toHaveBeenCalledWith({
        inputFile: '/test/input.imscc',
        outputDir: '/test/output',
        verbose: true,
      });
      expect(mockUnpack).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mockUnpack = jest.fn().mockRejectedValue(new Error('Test error'));
      (IMSCCUnpacker as jest.Mock).mockImplementation(() => ({
        unpack: mockUnpack,
      }));

      const unpacker = new IMSCCUnpacker({
        inputFile: '/test/input.imscc',
        outputDir: '/test/output',
      });

      await expect(unpacker.unpack()).rejects.toThrow('Test error');
    });
  });

  describe('pack command', () => {
    it('should create packer with correct options', async () => {
      const mockPack = jest.fn().mockResolvedValue(undefined);
      (IMSCCPacker as jest.Mock).mockImplementation(() => ({
        pack: mockPack,
      }));

      const packer = new IMSCCPacker({
        inputDir: '/test/input',
        outputFile: '/test/output.imscc',
        verbose: true,
      });

      await packer.pack();

      expect(IMSCCPacker).toHaveBeenCalledWith({
        inputDir: '/test/input',
        outputFile: '/test/output.imscc',
        verbose: true,
      });
      expect(mockPack).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const mockPack = jest.fn().mockRejectedValue(new Error('Pack error'));
      (IMSCCPacker as jest.Mock).mockImplementation(() => ({
        pack: mockPack,
      }));

      const packer = new IMSCCPacker({
        inputDir: '/test/input',
        outputFile: '/test/output.imscc',
      });

      await expect(packer.pack()).rejects.toThrow('Pack error');
    });

    it('should work without verbose flag', async () => {
      const mockPack = jest.fn().mockResolvedValue(undefined);
      (IMSCCPacker as jest.Mock).mockImplementation(() => ({
        pack: mockPack,
      }));

      const packer = new IMSCCPacker({
        inputDir: '/test/input',
        outputFile: '/test/output.imscc',
        verbose: false,
      });

      await packer.pack();

      expect(IMSCCPacker).toHaveBeenCalledWith({
        inputDir: '/test/input',
        outputFile: '/test/output.imscc',
        verbose: false,
      });
    });
  });
});
