import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';
import { UnpackOptions } from './types';

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

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}
