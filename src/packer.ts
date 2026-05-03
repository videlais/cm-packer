import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { Builder } from 'xml2js';
import { PackOptions, IMSCCManifest } from './types';

export class IMSCCPacker {
  private options: PackOptions;

  constructor(options: PackOptions) {
    this.options = options;
  }

  async pack(): Promise<void> {
    try {
      this.log(`Packing directory: ${this.options.inputDir}`);

      // Verify input directory exists
      if (!fs.existsSync(this.options.inputDir)) {
        throw new Error(`Input directory not found: ${this.options.inputDir}`);
      }

      // Create ZIP file
      const zip = new AdmZip();

      // Check if manifest exists, otherwise create one
      const manifestPath = path.join(this.options.inputDir, 'imsmanifest.xml');
      if (!fs.existsSync(manifestPath)) {
        this.log('Creating default imsmanifest.xml');
        await this.createDefaultManifest();
      }

      // Add all files from input directory
      this.addDirectoryToZip(zip, this.options.inputDir, '');

      // Write ZIP file
      this.log(`Creating IMSCC file: ${this.options.outputFile}`);
      
      // Ensure output directory exists
      const outputDir = path.dirname(this.options.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      zip.writeZip(this.options.outputFile);

      this.log('Packing completed successfully!');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to pack IMSCC file: ${error.message}`, { cause: error });
      }
      throw error;
    }
  }

  private addDirectoryToZip(zip: AdmZip, dirPath: string, zipPath: string): void {
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const zipEntryPath = zipPath ? path.join(zipPath, entry) : entry;
      const linkStat = fs.lstatSync(fullPath);

      if (linkStat.isSymbolicLink()) {
        throw new Error(`Refusing to pack symbolic link: ${fullPath}`);
      }

      const stat = fs.statSync(fullPath);

      // Skip metadata.json if it exists (generated file)
      if (entry === 'metadata.json' && zipPath === '') {
        continue;
      }

      if (stat.isDirectory()) {
        this.log(`Adding directory: ${zipEntryPath}`);
        this.addDirectoryToZip(zip, fullPath, zipEntryPath);
      } else {
        this.log(`Adding file: ${zipEntryPath}`);
        zip.addLocalFile(fullPath, zipPath);
      }
    }
  }

  private async createDefaultManifest(): Promise<void> {
    const manifest: { manifest: IMSCCManifest } = {
      manifest: {
        $: {
          identifier: 'cm-packer-' + Date.now(),
          xmlns: 'http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1',
          'xmlns:lom': 'http://ltsc.ieee.org/xsd/imsccv1p3/LOM/resource',
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
          'xsi:schemaLocation': 'http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p3/ccv1p3_imscp_v1p2_v1p0.xsd',
        },
        metadata: {
          schema: 'IMS Common Cartridge',
          schemaversion: '1.4.0',
        },
        organizations: {
          organization: [
            {
              $: {
                identifier: 'org-1',
                structure: 'rooted-hierarchy',
              },
              item: [],
            },
          ],
        },
        resources: {
          resource: this.scanResourcesInDirectory(this.options.inputDir),
        },
      },
    };

    const builder = new Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
    });
    const xml = builder.buildObject(manifest);

    const manifestPath = path.join(this.options.inputDir, 'imsmanifest.xml');
    fs.writeFileSync(manifestPath, xml);
  }

  private scanResourcesInDirectory(dirPath: string): Array<{
    $: { identifier: string; type: string; href?: string };
    file?: Array<{ $: { href: string } }>;
  }> {
    const resources: Array<{
      $: { identifier: string; type: string; href?: string };
      file?: Array<{ $: { href: string } }>;
    }> = [];
    let resourceId = 1;

    const scanDir = (currentPath: string, basePath: string) => {
      const entries = fs.readdirSync(currentPath);

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry);
        const relativePath = path.relative(basePath, fullPath);
        const linkStat = fs.lstatSync(fullPath);

        if (linkStat.isSymbolicLink()) {
          throw new Error(`Refusing to pack symbolic link: ${fullPath}`);
        }

        const stat = fs.statSync(fullPath);

        // Skip manifest and metadata files
        if (entry === 'imsmanifest.xml' || entry === 'metadata.json') {
          continue;
        }

        if (stat.isDirectory()) {
          scanDir(fullPath, basePath);
        } else {
          const ext = path.extname(entry).toLowerCase();
          let type = 'webcontent';

          // Determine resource type based on file extension
          if (ext === '.html' || ext === '.htm') {
            type = 'webcontent';
          } else if (ext === '.xml') {
            type = 'imsqti_xmlv1p2/imscc_xmlv1p3/assessment';
          }

          resources.push({
            $: {
              identifier: `resource-${resourceId++}`,
              type,
              href: relativePath.replace(/\\/g, '/'),
            },
            file: [
              {
                $: {
                  href: relativePath.replace(/\\/g, '/'),
                },
              },
            ],
          });
        }
      }
    };

    scanDir(dirPath, dirPath);
    return resources;
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}
