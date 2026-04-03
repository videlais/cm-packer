import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseStringPromise } from 'xml2js';
import { IMSCCUnpacker } from './unpacker';

export interface RemapOptions {
  inputDir?: string;
  inputFile?: string;
  outputDir: string;
  verbose?: boolean;
}

export class IMSCCRemapper {
  private options: RemapOptions;
  private idToTitle: Map<string, string> = new Map();
  private wikiMapping: Map<string, string> = new Map();
  private tempDir?: string;
  private workingDir: string = '';

  constructor(options: RemapOptions) {
    this.options = options;
  }

  async remap(): Promise<void> {
    try {
      // Determine working directory - either provided directory or unpack IMSCC file
      if (this.options.inputFile) {
        // Input is an IMSCC file - need to unpack it first
        this.log(`Unpacking IMSCC file: ${this.options.inputFile}`);
        
        if (!fs.existsSync(this.options.inputFile)) {
          throw new Error(`Input file not found: ${this.options.inputFile}`);
        }

        // Create temp directory for unpacking
        this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-packer-'));
        this.workingDir = this.tempDir;
        
        // Unpack IMSCC file to temp directory
        const unpacker = new IMSCCUnpacker({
          inputFile: this.options.inputFile,
          outputDir: this.tempDir,
          verbose: this.options.verbose,
        });
        await unpacker.unpack();
        
        this.log(`Remapping unpacked content from: ${this.tempDir}`);
      } else if (this.options.inputDir) {
        // Input is already an unpacked directory
        this.log(`Remapping IMSCC directory: ${this.options.inputDir}`);
        
        if (!fs.existsSync(this.options.inputDir)) {
          throw new Error(`Input directory not found: ${this.options.inputDir}`);
        }
        
        this.workingDir = this.options.inputDir;
      } else {
        throw new Error('Either inputFile or inputDir must be provided');
      }

      // Verify manifest exists
      const manifestPath = path.join(this.workingDir, 'imsmanifest.xml');
      if (!fs.existsSync(manifestPath)) {
        throw new Error('imsmanifest.xml not found in input directory');
      }

      // Create output directory
      if (!fs.existsSync(this.options.outputDir)) {
        fs.mkdirSync(this.options.outputDir, { recursive: true });
      }

      // Parse manifest and build mappings
      await this.parseManifest(manifestPath);

      // Build wiki mapping
      this.buildWikiMapping();

      // Build directory structure
      await this.buildDirectoryStructure(manifestPath);

      // Copy special directories
      this.copySpecialDirectories();

      // Copy metadata files
      this.copyMetadataFiles();

      this.log('Remapping completed successfully!');
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to remap IMSCC directory: ${error.message}`, { cause: error });
      }
      throw error;
    } finally {
      // Clean up temp directory if we created one
      if (this.tempDir && fs.existsSync(this.tempDir)) {
        this.log(`Cleaning up temporary directory: ${this.tempDir}`);
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      }
    }
  }

  private async parseManifest(manifestPath: string): Promise<void> {
    this.log('Parsing manifest...');
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = await parseStringPromise(manifestContent);

    const manifest = parsed.manifest || {};
    const orgsObj = Array.isArray(manifest.organizations) ? manifest.organizations[0] : manifest.organizations;
    
    if (orgsObj?.organization) {
      const organizations = Array.isArray(orgsObj.organization) ? orgsObj.organization : [orgsObj.organization];
      
      for (const org of organizations) {
        if (org.item) {
          const items = Array.isArray(org.item) ? org.item : [org.item];
          items.forEach((item: unknown) => this.extractTitles(item));
        }
      }
    }

    this.log(`Extracted ${this.idToTitle.size} title mappings`);
  }

  private extractTitles(item: unknown): void {
    if (!item || typeof item !== 'object') return;

    const itemObj = item as Record<string, unknown>;
    const attrs = itemObj.$ as Record<string, string> | undefined;
    const identifier = attrs?.identifier || (itemObj.identifier as string);
    const identifierref = attrs?.identifierref || (itemObj.identifierref as string);
    
    let title = '';
    if (itemObj.title) {
      if (Array.isArray(itemObj.title) && itemObj.title.length > 0) {
        title = String(itemObj.title[0]).trim();
      } else if (typeof itemObj.title === 'string') {
        title = itemObj.title.trim();
      }
    }

    if (title) {
      if (identifierref) {
        this.idToTitle.set(identifierref, title);
      }
      if (identifier) {
        this.idToTitle.set(identifier, title);
      }
    }

    // Process children
    if (itemObj.item) {
      const children = Array.isArray(itemObj.item) ? itemObj.item : [itemObj.item];
      children.forEach((child: unknown) => this.extractTitles(child));
    }
  }

  private buildWikiMapping(): void {
    const wikiDir = path.join(this.workingDir, 'wiki_content');
    if (!fs.existsSync(wikiDir)) {
      return;
    }

    const files = fs.readdirSync(wikiDir);
    for (const file of files) {
      if (file.endsWith('.html')) {
        const pageId = path.basename(file, '.html');
        this.wikiMapping.set(pageId, path.join(wikiDir, file));
      }
    }

    if (this.wikiMapping.size > 0) {
      this.log(`Found ${this.wikiMapping.size} wiki pages`);
    }
  }

  private async buildDirectoryStructure(manifestPath: string): Promise<void> {
    this.log('Building course structure...');
    
    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const parsed = await parseStringPromise(manifestContent);

    const manifest = parsed.manifest || {};
    const orgsObj = Array.isArray(manifest.organizations) ? manifest.organizations[0] : manifest.organizations;

    if (orgsObj?.organization) {
      const organizations = Array.isArray(orgsObj.organization) ? orgsObj.organization : [orgsObj.organization];
      
      for (const org of organizations) {
        if (org.item) {
          const items = Array.isArray(org.item) ? org.item : [org.item];
          
          // If single top-level item with no meaningful title, process its children
          if (items.length === 1) {
            const firstItem = items[0] as Record<string, unknown>;
            const firstTitle = this.getItemTitle(firstItem);
            
            if (!firstTitle || firstTitle.trim() === '') {
              const children = this.getItemChildren(firstItem);
              children.forEach((child: unknown) => this.processItem(child, this.options.outputDir, manifestPath));
            } else {
              this.processItem(firstItem, this.options.outputDir, manifestPath);
            }
          } else {
            items.forEach((item: unknown) => this.processItem(item, this.options.outputDir, manifestPath));
          }
        }
      }
    }
  }

  private getItemTitle(item: unknown): string {
    if (!item || typeof item !== 'object') return '';
    
    const itemObj = item as Record<string, unknown>;
    if (itemObj.title) {
      if (Array.isArray(itemObj.title) && itemObj.title.length > 0) {
        return String(itemObj.title[0]).trim();
      } else if (typeof itemObj.title === 'string') {
        return itemObj.title.trim();
      }
    }
    return '';
  }

  private getItemChildren(item: unknown): unknown[] {
    if (!item || typeof item !== 'object') return [];
    
    const itemObj = item as Record<string, unknown>;
    if (itemObj.item) {
      return Array.isArray(itemObj.item) ? itemObj.item : [itemObj.item];
    }
    return [];
  }

  private processItem(item: unknown, currentPath: string, manifestPath: string): void {
    if (!item || typeof item !== 'object') return;

    const itemObj = item as Record<string, unknown>;
    const attrs = itemObj.$ as Record<string, string> | undefined;
    const identifier = attrs?.identifier || (itemObj.identifier as string);
    const identifierref = attrs?.identifierref || (itemObj.identifierref as string);
    
    const title = this.getItemTitle(item);
    if (!title) return;

    const sanitizedTitle = this.sanitizeFilename(title);
    const children = this.getItemChildren(item);

    if (children.length > 0) {
      // This is a folder
      const folderPath = path.join(currentPath, sanitizedTitle);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      
      children.forEach((child: unknown) => this.processItem(child, folderPath, manifestPath));
    } else {
      // This is a leaf item (file or resource)
      const refId = identifierref || identifier;
      if (!refId) return;

      // Check for direct wiki content reference in manifest
      const resourceHref = this.getResourceHref(manifestPath, refId);
      if (resourceHref && resourceHref.includes('wiki_content/')) {
        const wikiFile = path.join(this.workingDir, resourceHref);
        if (fs.existsSync(wikiFile)) {
          const destFile = this.getUniqueFilePath(currentPath, sanitizedTitle, '.html');
          fs.copyFileSync(wikiFile, destFile);
          this.log(`  Copied wiki: ${path.basename(wikiFile)} -> ${path.basename(destFile)}`);
          return;
        }
      }

      let copied = false;

      // Check for directory
      const srcDir = path.join(this.workingDir, refId);
      if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
        const destDir = this.getUniqueFilePath(currentPath, sanitizedTitle, '');
        this.copyDirectory(srcDir, destDir);
        this.log(`  Copied dir:  ${refId} -> ${path.basename(destDir)}`);
        copied = true;
      } else {
        // Check for files
        const possibleFiles = [
          path.join(this.workingDir, `${refId}.xml`),
          path.join(this.workingDir, refId),
        ];

        for (const srcFile of possibleFiles) {
          if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
            const ext = path.extname(srcFile) || '.xml';
            
            // Check if XML references wiki page
            let wikiPageId: string | null = null;
            if (ext === '.xml') {
              wikiPageId = this.extractWikiUrlFromXml(srcFile);
            }

            // If wiki reference found, copy HTML instead
            if (wikiPageId && this.wikiMapping.has(wikiPageId)) {
              const wikiHtml = this.wikiMapping.get(wikiPageId)!;
              const destFile = this.getUniqueFilePath(currentPath, sanitizedTitle, '.html');
              fs.copyFileSync(wikiHtml, destFile);
              this.log(`  Copied wiki: ${path.basename(wikiHtml)} -> ${path.basename(destFile)}`);
              copied = true;
            } else {
              // Copy XML file as-is
              const destFile = this.getUniqueFilePath(currentPath, sanitizedTitle, ext);
              fs.copyFileSync(srcFile, destFile);
              this.log(`  Copied file: ${path.basename(srcFile)} -> ${path.basename(destFile)}`);
              copied = true;
            }
            break;
          }
        }
      }

      if (!copied) {
        this.log(`  [SKIP] Not found: ${refId} (title: ${title})`);
      }
    }
  }

  private getResourceHref(manifestPath: string, resourceId: string): string | null {
    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      
      // Use regex to extract href from resource with matching identifier
      const match = manifestContent.match(new RegExp(`identifier="${resourceId}"[^>]*href="([^"]+)"`));
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private extractWikiUrlFromXml(xmlFile: string): string | null {
    try {
      const content = fs.readFileSync(xmlFile, 'utf-8');
      
      // Look for $WIKI_REFERENCE$/pages/page-name pattern
      let match = content.match(/\$WIKI_REFERENCE\$\/pages\/([a-zA-Z0-9-]+)/);
      if (match) {
        return match[1];
      }

      // Look for direct wiki_content references
      match = content.match(/wiki_content\/([a-zA-Z0-9-]+)\.html/);
      if (match) {
        return match[1];
      }
    } catch {
      // Ignore errors
    }
    
    return null;
  }

  private copySpecialDirectories(): void {
    this.log('Copying special directories...');
    const specialDirs = ['course_settings', 'web_resources', 'non_cc_assessments'];
    
    for (const dirName of specialDirs) {
      const srcDir = path.join(this.workingDir, dirName);
      if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
        const destDir = path.join(this.options.outputDir, dirName);
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true });
        }
        this.copyDirectory(srcDir, destDir);
        this.log(`  Copied special: ${dirName}`);
      }
    }
  }

  private copyMetadataFiles(): void {
    this.log('Copying metadata files...');
    const metadataFiles = ['imsmanifest.xml', 'metadata.json'];
    
    for (const filename of metadataFiles) {
      const srcFile = path.join(this.workingDir, filename);
      if (fs.existsSync(srcFile)) {
        const destFile = path.join(this.options.outputDir, filename);
        fs.copyFileSync(srcFile, destFile);
      }
    }
  }

  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private sanitizeFilename(name: string): string {
    // Replace invalid characters
    let sanitized = name.replace(/[<>:"/\\|?*]/g, '_');
    
    // Replace multiple spaces with single space
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    // Remove leading/trailing spaces and dots
    sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');
    
    // Limit length
    if (sanitized.length > 200) {
      sanitized = sanitized.substring(0, 200);
    }
    
    return sanitized;
  }

  private getUniqueFilePath(dir: string, basename: string, ext: string): string {
    let filePath = path.join(dir, `${basename}${ext}`);
    let counter = 1;
    
    while (fs.existsSync(filePath)) {
      filePath = path.join(dir, `${basename}_${counter}${ext}`);
      counter++;
    }
    
    return filePath;
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}
