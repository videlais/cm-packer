/**
 * CM-Packer Web - Browser-based IMSCC Unpacker and Remapper
 * Adapts the Node.js cm-packer functionality for browser use
 */

import type JSZipType from 'jszip';

// JSZip and FileSaver are loaded via CDN in the HTML
declare const JSZip: typeof import('jszip');
declare const saveAs: (blob: Blob, filename: string) => void;

interface ProcessResult {
    success: boolean;
    files: Map<string, Blob>;
    stats: {
        fileCount: number;
        folderCount: number;
        totalSize: number;
    };
}

export class IMSCCProcessor {
    private idToTitle: Map<string, string> = new Map();
    private wikiMapping: Map<string, string> = new Map();
    private files: Map<string, Blob> = new Map();
    private progressCallback: ((percent: number, message: string) => void) | null = null;

    setProgressCallback(callback: (percent: number, message: string) => void): void {
        this.progressCallback = callback;
    }

    updateProgress(percent: number, message: string): void {
        if (this.progressCallback) {
            this.progressCallback(percent, message);
        }
    }

    /**
     * Main processing function - unpacks and remaps IMSCC file
     */
    async process(file: File): Promise<ProcessResult> {
        this.files.clear();
        this.idToTitle.clear();
        this.wikiMapping.clear();

        try {
            // Step 1: Unpack the IMSCC file (it's a ZIP)
            this.updateProgress(10, 'Reading IMSCC file...');
            const zip = await JSZip.loadAsync(file);

            // Step 2: Extract manifest
            this.updateProgress(20, 'Parsing manifest...');
            const manifestFile = zip.file('imsmanifest.xml');
            if (!manifestFile) {
                throw new Error('imsmanifest.xml not found in IMSCC file');
            }
            const manifestContent = await manifestFile.async('string');

            // Step 3: Parse manifest XML
            this.updateProgress(30, 'Extracting course structure...');
            const parser = new DOMParser();
            const manifestXml = parser.parseFromString(manifestContent, 'text/xml');
            
            // Check for parsing errors
            const parserError = manifestXml.querySelector('parsererror');
            if (parserError) {
                throw new Error('Failed to parse manifest XML');
            }

            // Step 4: Build title mappings
            this.buildTitleMappings(manifestXml);

            // Step 5: Build wiki mapping
            this.updateProgress(40, 'Processing wiki content...');
            await this.buildWikiMapping(zip);

            // Step 6: Store all files from ZIP for reference
            this.updateProgress(50, 'Extracting files...');
            const allFiles = new Map<string, JSZipType.JSZipObject>();
            for (const [path, zipEntry] of Object.entries(zip.files) as [string, JSZipType.JSZipObject][]) {
                if (!zipEntry.dir) {
                    allFiles.set(path, zipEntry);
                }
            }

            // Step 7: Build remapped directory structure
            this.updateProgress(60, 'Remapping course structure...');
            await this.buildDirectoryStructure(manifestXml, allFiles, zip);

            // Step 8: Copy special directories
            this.updateProgress(80, 'Copying special directories...');
            await this.copySpecialDirectories(zip);

            // Step 9: Copy metadata files
            this.updateProgress(90, 'Copying metadata files...');
            await this.copyMetadataFiles(zip, manifestContent);

            this.updateProgress(100, 'Processing complete!');

            return {
                success: true,
                files: this.files,
                stats: this.getStats()
            };
        } catch (error) {
            console.error('Processing error:', error);
            throw error;
        }
    }

    /**
     * Build mappings from IDs to human-readable titles
     */
    private buildTitleMappings(manifestXml: Document): void {
        const organizations = manifestXml.querySelectorAll('organization');
        
        organizations.forEach(org => {
            const items = org.querySelectorAll('item');
            items.forEach(item => {
                this.extractTitles(item);
            });
        });

        console.log(`Extracted ${this.idToTitle.size} title mappings`);
    }

    /**
     * Recursively extract titles from manifest items
     */
    private extractTitles(item: Element): void {
        const identifier = item.getAttribute('identifier');
        const identifierref = item.getAttribute('identifierref');
        const titleElement = item.querySelector(':scope > title');
        
        if (titleElement) {
            const title = titleElement.textContent?.trim();
            if (title) {
                if (identifierref) {
                    this.idToTitle.set(identifierref, title);
                }
                if (identifier) {
                    this.idToTitle.set(identifier, title);
                }
            }
        }

        // Process children
        const children = item.querySelectorAll(':scope > item');
        children.forEach(child => this.extractTitles(child));
    }

    /**
     * Build mapping of wiki page IDs to their content
     */
    private async buildWikiMapping(zip: JSZipType): Promise<void> {
        const wikiFolder = 'wiki_content/';
        
        for (const [path, zipEntry] of Object.entries(zip.files) as [string, JSZipType.JSZipObject][]) {
            if (path.startsWith(wikiFolder) && path.endsWith('.html') && !zipEntry.dir) {
                const fileName = path.split('/').pop();
                if (fileName) {
                    const pageId = fileName.replace('.html', '');
                    this.wikiMapping.set(pageId, path);
                }
            }
        }

        if (this.wikiMapping.size > 0) {
            console.log(`Found ${this.wikiMapping.size} wiki pages`);
        }
    }

    /**
     * Build the remapped directory structure based on manifest organization
     */
    private async buildDirectoryStructure(manifestXml: Document, allFiles: Map<string, JSZipType.JSZipObject>, zip: JSZipType): Promise<void> {
        const organizations = manifestXml.querySelectorAll('organization');
        
        for (const org of Array.from(organizations)) {
            const topItems = Array.from(org.querySelectorAll(':scope > item'));
            
            // If single top-level item with no meaningful title, process its children
            if (topItems.length === 1) {
                const firstItem = topItems[0];
                const firstTitle = this.getItemTitle(firstItem);
                
                if (!firstTitle || firstTitle.trim() === '') {
                    const children = Array.from(firstItem.querySelectorAll(':scope > item'));
                    for (const child of children) {
                        await this.processItem(child, '', manifestXml, allFiles, zip);
                    }
                } else {
                    await this.processItem(firstItem, '', manifestXml, allFiles, zip);
                }
            } else {
                for (const item of topItems) {
                    await this.processItem(item, '', manifestXml, allFiles, zip);
                }
            }
        }
    }

    /**
     * Get title from an item element
     */
    private getItemTitle(item: Element): string {
        const titleElement = item.querySelector(':scope > title');
        return titleElement?.textContent?.trim() || '';
    }

    /**
     * Process a single item from the manifest (folder or file)
     */
    private async processItem(item: Element, currentPath: string, manifestXml: Document, allFiles: Map<string, JSZipType.JSZipObject>, zip: JSZipType): Promise<void> {
        const identifier = item.getAttribute('identifier');
        const identifierref = item.getAttribute('identifierref');
        const title = this.getItemTitle(item);
        
        if (!title) return;

        const sanitizedTitle = this.sanitizeFilename(title);
        const children = Array.from(item.querySelectorAll(':scope > item'));

        if (children.length > 0) {
            // This is a folder
            const folderPath = currentPath ? `${currentPath}/${sanitizedTitle}` : sanitizedTitle;
            
            for (const child of children) {
                await this.processItem(child, folderPath, manifestXml, allFiles, zip);
            }
        } else {
            // This is a leaf item (file or resource)
            const refId = identifierref || identifier;
            if (!refId) return;

            // Check for direct wiki content reference in manifest
            const resourceHref = this.getResourceHref(manifestXml, refId);
            if (resourceHref && resourceHref.includes('wiki_content/')) {
                const zipEntry = zip.file(resourceHref);
                if (zipEntry) {
                    const content = await zipEntry.async('blob');
                    const fileName = this.getUniqueFileName(currentPath, sanitizedTitle, '.html');
                    this.files.set(fileName, content);
                    return;
                }
            }

            let copied = false;

            // Check for files with this ID
            const possiblePaths = [
                `${refId}.xml`,
                refId,
                `${refId}/`,
            ];

            for (const possiblePath of possiblePaths) {
                const zipEntry = zip.file(possiblePath);
                
                if (zipEntry && !zipEntry.dir) {
                    const ext = this.getFileExtension(possiblePath) || '.xml';
                    
                    // Check if XML references wiki page
                    let wikiPageId: string | null = null;
                    if (ext === '.xml') {
                        const content = await zipEntry.async('string');
                        wikiPageId = this.extractWikiUrlFromXml(content);
                    }

                    // If wiki reference found, copy HTML instead
                    if (wikiPageId && this.wikiMapping.has(wikiPageId)) {
                        const wikiPath = this.wikiMapping.get(wikiPageId);
                        if (wikiPath) {
                            const wikiEntry = zip.file(wikiPath);
                            if (wikiEntry) {
                                const content = await wikiEntry.async('blob');
                                const fileName = this.getUniqueFileName(currentPath, sanitizedTitle, '.html');
                                this.files.set(fileName, content);
                                copied = true;
                            }
                        }
                    } else {
                        // Copy file as-is
                        const content = await zipEntry.async('blob');
                        const fileName = this.getUniqueFileName(currentPath, sanitizedTitle, ext);
                        this.files.set(fileName, content);
                        copied = true;
                    }
                    break;
                }
                
                // Check if it's a directory
                const dirEntries = Object.keys(zip.files).filter((path: string) => 
                    path.startsWith(possiblePath) && path !== possiblePath
                );
                
                if (dirEntries.length > 0) {
                    // Copy entire directory
                    for (const entryPath of dirEntries) {
                        const zipEntry = zip.files[entryPath];
                        if (!zipEntry.dir) {
                            const relativePath = entryPath.substring(possiblePath.length);
                            const content = await zipEntry.async('blob');
                            const fileName = currentPath 
                                ? `${currentPath}/${sanitizedTitle}/${relativePath}`
                                : `${sanitizedTitle}/${relativePath}`;
                            this.files.set(fileName, content);
                        }
                    }
                    copied = true;
                    break;
                }
            }

            if (!copied) {
                console.log(`[SKIP] Not found: ${refId} (title: ${title})`);
            }
        }
    }

    /**
     * Get resource href from manifest by resource ID
     */
    private getResourceHref(manifestXml: Document, resourceId: string): string | null {
        const resources = manifestXml.querySelectorAll('resource');
        for (const resource of Array.from(resources)) {
            if (resource.getAttribute('identifier') === resourceId) {
                return resource.getAttribute('href');
            }
        }
        return null;
    }

    /**
     * Extract wiki page ID from XML content
     */
    private extractWikiUrlFromXml(xmlContent: string): string | null {
        // Look for $WIKI_REFERENCE$/pages/page-name pattern
        let match = xmlContent.match(/\$WIKI_REFERENCE\$\/pages\/([a-zA-Z0-9-]+)/);
        if (match) {
            return match[1];
        }

        // Look for direct wiki_content references
        match = xmlContent.match(/wiki_content\/([a-zA-Z0-9-]+)\.html/);
        if (match) {
            return match[1];
        }

        return null;
    }

    /**
     * Copy special directories (course_settings, web_resources, etc.)
     */
    private async copySpecialDirectories(zip: JSZipType): Promise<void> {
        const specialDirs = ['course_settings/', 'web_resources/', 'non_cc_assessments/'];
        
        for (const dirName of specialDirs) {
            for (const [path, zipEntry] of Object.entries(zip.files) as [string, JSZipType.JSZipObject][]) {
                if (path.startsWith(dirName) && !zipEntry.dir) {
                    const content = await zipEntry.async('blob');
                    this.files.set(path, content);
                }
            }
        }
    }

    /**
     * Copy metadata files (manifest, metadata.json)
     */
    private async copyMetadataFiles(zip: JSZipType, manifestContent: string): Promise<void> {
        // Copy manifest
        this.files.set('imsmanifest.xml', new Blob([manifestContent], { type: 'text/xml' }));

        // Create metadata.json
        const parser = new DOMParser();
        const manifestXml = parser.parseFromString(manifestContent, 'text/xml');
        
        const schema = manifestXml.querySelector('metadata > schema')?.textContent || 'Unknown';
        const schemaVersion = manifestXml.querySelector('metadata > schemaversion')?.textContent || 'Unknown';
        const resourceCount = manifestXml.querySelectorAll('resource').length;
        const organizationCount = manifestXml.querySelectorAll('organization').length;
        
        const metadata = {
            schema,
            schemaVersion,
            resourceCount,
            organizationCount,
            extractedAt: new Date().toISOString(),
        };

        this.files.set('metadata.json', new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }));
    }

    /**
     * Sanitize filename for safe file system use
     */
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

    /**
     * Get file extension from path
     */
    private getFileExtension(path: string): string {
        const match = path.match(/\.([^.]+)$/);
        return match ? match[0] : '';
    }

    /**
     * Get unique file name to avoid conflicts
     */
    private getUniqueFileName(dir: string, basename: string, ext: string): string {
        let fileName = dir ? `${dir}/${basename}${ext}` : `${basename}${ext}`;
        let counter = 1;
        
        while (this.files.has(fileName)) {
            fileName = dir ? `${dir}/${basename}_${counter}${ext}` : `${basename}_${counter}${ext}`;
            counter++;
        }
        
        return fileName;
    }

    /**
     * Get statistics about processed files
     */
    private getStats(): { fileCount: number; folderCount: number; totalSize: number } {
        let totalSize = 0;
        const folders = new Set<string>();

        for (const [path, blob] of this.files.entries()) {
            totalSize += blob.size;
            
            // Count unique folders
            const pathParts = path.split('/');
            if (pathParts.length > 1) {
                for (let i = 1; i < pathParts.length; i++) {
                    folders.add(pathParts.slice(0, i).join('/'));
                }
            }
        }

        return {
            fileCount: this.files.size,
            folderCount: folders.size,
            totalSize: totalSize
        };
    }
}

// UI Controller
export class UIController {
    private processor: IMSCCProcessor;
    private selectedFile: File | null = null;
    private processedFiles: Map<string, Blob> | null = null;

    private uploadArea!: HTMLElement;
    private fileInput!: HTMLInputElement;
    private fileInfo!: HTMLElement;
    private fileName!: HTMLElement;
    private fileSize!: HTMLElement;
    private processBtn!: HTMLButtonElement;
    private errorMessage!: HTMLElement;
    private progressSection!: HTMLElement;
    private progressFill!: HTMLElement;
    private progressText!: HTMLElement;
    private resultsSection!: HTMLElement;
    private fileCount!: HTMLElement;
    private folderCount!: HTMLElement;
    private totalSize!: HTMLElement;
    private fileList!: HTMLElement;
    private downloadAllBtn!: HTMLButtonElement;

    constructor() {
        this.processor = new IMSCCProcessor();
        this.initializeElements();
        this.attachEventListeners();
    }

    private initializeElements(): void {
        this.uploadArea = document.getElementById('uploadArea')!;
        this.fileInput = document.getElementById('fileInput') as HTMLInputElement;
        this.fileInfo = document.getElementById('fileInfo')!;
        this.fileName = document.getElementById('fileName')!;
        this.fileSize = document.getElementById('fileSize')!;
        this.processBtn = document.getElementById('processBtn') as HTMLButtonElement;
        this.errorMessage = document.getElementById('errorMessage')!;
        this.progressSection = document.getElementById('progressSection')!;
        this.progressFill = document.getElementById('progressFill')!;
        this.progressText = document.getElementById('progressText')!;
        this.resultsSection = document.getElementById('resultsSection')!;
        this.fileCount = document.getElementById('fileCount')!;
        this.folderCount = document.getElementById('folderCount')!;
        this.totalSize = document.getElementById('totalSize')!;
        this.fileList = document.getElementById('fileList')!;
        this.downloadAllBtn = document.getElementById('downloadAllBtn') as HTMLButtonElement;
    }

    private attachEventListeners(): void {
        // Upload area click
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });

        // File input change
        this.fileInput.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            if (target.files && target.files[0]) {
                this.handleFileSelect(target.files[0]);
            }
        });

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('drag-over');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('drag-over');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('drag-over');
            if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        // Process button
        this.processBtn.addEventListener('click', () => {
            this.processFile();
        });

        // Download all button
        this.downloadAllBtn.addEventListener('click', () => {
            this.downloadAllFiles();
        });
    }

    private handleFileSelect(file: File): void {
        if (!file) return;

        // Validate file type
        if (!file.name.endsWith('.imscc') && !file.name.endsWith('.zip')) {
            this.showError('Please select an IMSCC file (or ZIP file)');
            return;
        }

        // Validate file size (100 MB limit)
        const maxSize = 100 * 1024 * 1024; // 100 MB
        if (file.size > maxSize) {
            this.showError('File size exceeds 100 MB limit');
            return;
        }

        this.selectedFile = file;
        this.fileName.textContent = `📄 ${file.name}`;
        this.fileSize.textContent = `Size: ${this.formatFileSize(file.size)}`;
        this.fileInfo.classList.add('show');
        this.processBtn.classList.add('show');
        this.hideError();
        this.resultsSection.classList.remove('show');
    }

    private async processFile(): Promise<void> {
        if (!this.selectedFile) return;

        this.processBtn.disabled = true;
        this.progressSection.classList.add('show');
        this.resultsSection.classList.remove('show');
        this.hideError();

        this.processor.setProgressCallback((percent, message) => {
            this.updateProgress(percent, message);
        });

        try {
            const result = await this.processor.process(this.selectedFile);
            this.processedFiles = result.files;
            this.displayResults(result.stats);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.showError(`Error processing file: ${errorMsg}`);
            console.error(error);
        } finally {
            this.processBtn.disabled = false;
        }
    }

    private updateProgress(percent: number, message: string): void {
        this.progressFill.style.width = `${percent}%`;
        this.progressFill.textContent = `${percent}%`;
        this.progressText.textContent = message;
    }

    private displayResults(stats: { fileCount: number; folderCount: number; totalSize: number }): void {
        this.fileCount.textContent = stats.fileCount.toString();
        this.folderCount.textContent = stats.folderCount.toString();
        this.totalSize.textContent = this.formatFileSize(stats.totalSize);

        // Build file tree
        this.fileList.innerHTML = '';
        if (this.processedFiles) {
            const sortedFiles = Array.from(this.processedFiles.keys()).sort();

            for (const filePath of sortedFiles) {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';

                const pathSpan = document.createElement('span');
                pathSpan.className = 'file-path';
                pathSpan.textContent = filePath;

                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'download-file-btn';
                downloadBtn.textContent = 'Download';
                downloadBtn.onclick = () => this.downloadFile(filePath);

                fileItem.appendChild(pathSpan);
                fileItem.appendChild(downloadBtn);
                this.fileList.appendChild(fileItem);
            }
        }

        this.resultsSection.classList.add('show');
        this.progressSection.classList.remove('show');
    }

    private downloadFile(filePath: string): void {
        if (!this.processedFiles) return;
        const blob = this.processedFiles.get(filePath);
        if (!blob) return;
        const fileName = filePath.split('/').pop() || 'download';
        saveAs(blob, fileName);
    }

    private async downloadAllFiles(): Promise<void> {
        if (!this.processedFiles || !this.selectedFile) return;

        const zip = new JSZip();

        for (const [filePath, blob] of this.processedFiles.entries()) {
            zip.file(filePath, blob);
        }

        this.updateProgress(0, 'Creating ZIP file...');
        this.progressSection.classList.add('show');

        try {
            const content = await zip.generateAsync(
                { type: 'blob' },
                (metadata: { percent: number }) => {
                    const percent = Math.round(metadata.percent);
                    this.updateProgress(percent, `Creating ZIP file... ${percent}%`);
                }
            );

            const fileName = this.selectedFile.name.replace(/\.(imscc|zip)$/, '-remapped.zip');
            saveAs(content, fileName);
            
            this.progressSection.classList.remove('show');
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.showError(`Error creating ZIP file: ${errorMsg}`);
            this.progressSection.classList.remove('show');
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    private showError(message: string): void {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.add('show');
    }

    private hideError(): void {
        this.errorMessage.classList.remove('show');
    }
}

// Initialize the application
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        new UIController();
    });
}
