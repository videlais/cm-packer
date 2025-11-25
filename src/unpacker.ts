import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';
import { UnpackOptions, IMSCCManifest } from './types';

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
      zip.extractAllTo(this.options.outputDir, true);

      // Parse manifest
      await this.parseManifest();

      this.log('Unpacking completed successfully!');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to unpack IMSCC file: ${error.message}`);
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
      const manifest = await parseStringPromise(manifestContent) as { manifest?: IMSCCManifest };

      this.log('Manifest parsed successfully');

      // Create metadata summary
      const metadataPath = path.join(this.options.outputDir, 'metadata.json');
      const metadata = {
        schema: manifest.manifest?.metadata?.schema || 'Unknown',
        schemaVersion: manifest.manifest?.metadata?.schemaversion || 'Unknown',
        resourceCount: manifest.manifest?.resources?.resource?.length || 0,
        organizationCount: manifest.manifest?.organizations?.organization?.length || 0,
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

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}
