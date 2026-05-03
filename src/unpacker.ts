import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';
import { UnpackOptions } from './types';

const MAX_ARCHIVE_ENTRIES = 10000;
const MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MANIFEST_XML_REJECTION_PATTERN = /<!DOCTYPE|<!ENTITY/i;

export function normalizeArchiveEntryPath(entryName: string): string {
  const normalizedEntryName = entryName.replace(/\\/g, '/');
  const normalizedPath = path.posix.normalize(normalizedEntryName);
  const segments = normalizedPath.split('/').filter((segment) => segment.length > 0 && segment !== '.');

  if (
    normalizedEntryName.startsWith('/') ||
    /^[A-Za-z]:/.test(normalizedEntryName) ||
    normalizedPath === '..' ||
    segments.includes('..')
  ) {
    throw new Error(`Archive entry escapes the output directory: ${entryName}`);
  }

  if (segments.length === 0) {
    throw new Error(`Archive entry has an invalid path: ${entryName}`);
  }

  return segments.join(path.sep);
}

export class IMSCCUnpacker {
  private options: UnpackOptions;

  constructor(options: UnpackOptions) {
    this.options = options;
  }

  async unpack(): Promise<void> {
    try {
      this.log(`Unpacking IMSCC file: ${this.options.inputFile}`);

      // Verify input file exists
      if (!fs.existsSync(this.options.inputFile)) {
        throw new Error(`Input file not found: ${this.options.inputFile}`);
      }

      // Create output directory if it doesn't exist
      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }

      // Extract ZIP contents
      const zip = new AdmZip(this.options.inputFile);
      this.log(`Extracting files to: ${this.options.outputDir}`);
      this.extractEntries(zip);

      // Parse manifest
      await this.parseManifest();

      this.log('Unpacking completed successfully!');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to unpack IMSCC file: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  private async parseManifest(): Promise<void> {
    const manifestPath = path.join(this.options.outputDir, 'imsmanifest.xml');

    if (!fs.existsSync(manifestPath)) {
      this.log('Warning: imsmanifest.xml not found in the package');
      return;
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      this.assertSafeManifest(manifestContent);
      const parsed = await parseStringPromise(manifestContent);

      this.log('Manifest parsed successfully');

      // Create metadata summary
      const metadataPath = path.join(this.options.outputDir, 'metadata.json');
      
      // xml2js parses values as arrays
      const getTextValue = (val: unknown): string => {
        if (Array.isArray(val) && val.length > 0) {
          return String(val[0]);
        }
        return val ? String(val) : 'Unknown';
      };
      
      const manifest = parsed.manifest || {};
      const metadataObj = Array.isArray(manifest.metadata) ? manifest.metadata[0] : manifest.metadata;
      const resourcesObj = Array.isArray(manifest.resources) ? manifest.resources[0] : manifest.resources;
      const orgsObj = Array.isArray(manifest.organizations) ? manifest.organizations[0] : manifest.organizations;
      
      const metadata = {
        schema: metadataObj ? getTextValue(metadataObj.schema) : 'Unknown',
        schemaVersion: metadataObj ? getTextValue(metadataObj.schemaversion) : 'Unknown',
        resourceCount: resourcesObj?.resource?.length || 0,
        organizationCount: orgsObj?.organization?.length || 0,
        extractedAt: new Date().toISOString(),
      };

      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      this.log(`Metadata summary saved to: ${metadataPath}`);
    } catch (error) {
      if (error instanceof Error) {
        this.log(`Warning: Failed to parse manifest: ${error.message}`);
      }
    }
  }

  private extractEntries(zip: AdmZip): void {
    const entries = zip.getEntries();

    if (entries.length > MAX_ARCHIVE_ENTRIES) {
      throw new Error(`Archive contains too many entries (${entries.length})`);
    }

    const totalUncompressedBytes = entries.reduce((sum, entry) => sum + entry.header.size, 0);
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Archive expands to ${totalUncompressedBytes} bytes, exceeding the ${MAX_UNCOMPRESSED_BYTES} byte limit`,
      );
    }

    for (const entry of entries) {
      const safeRelativePath = this.getSafeEntryPath(entry.entryName);
      const targetPath = path.join(this.options.outputDir, safeRelativePath);

      if (this.isSymbolicLinkEntry(entry)) {
        throw new Error(`Archive entry is a symbolic link: ${entry.entryName}`);
      }

      if (entry.isDirectory) {
        fs.mkdirSync(targetPath, { recursive: true });
        continue;
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, entry.getData());
    }
  }

  private getSafeEntryPath(entryName: string): string {
    return normalizeArchiveEntryPath(entryName);
  }

  private isSymbolicLinkEntry(entry: AdmZip.IZipEntry): boolean {
    const mode = entry.attr >>> 16;
    return (mode & fs.constants.S_IFMT) === fs.constants.S_IFLNK;
  }

  private assertSafeManifest(manifestContent: string): void {
    if (MANIFEST_XML_REJECTION_PATTERN.test(manifestContent)) {
      throw new Error('Manifest contains unsupported DTD or entity declarations');
    }
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}
