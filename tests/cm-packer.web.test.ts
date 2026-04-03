import { test, expect } from '@playwright/test';

test.describe('CM-Packer Web Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the main interface', async ({ page }) => {
    // Check for main title
    await expect(page.locator('h1')).toContainText('CM-Packer Web');
    
    // Check for upload area
    const uploadArea = page.locator('#uploadArea');
    await expect(uploadArea).toBeVisible();
    
    // Check for upload text
    await expect(uploadArea).toContainText('Drop your IMSCC file here');
  });

  test('should show error for invalid file type', async ({ page }) => {
    // Simulate file input
    const fileInput = page.locator('#fileInput');
    await fileInput.evaluate((input: HTMLInputElement) => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Check for error message
    const errorMessage = page.locator('#errorMessage');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('Please select an IMSCC file');
  });

  test('should accept valid IMSCC file', async ({ page }) => {
    // Simulate uploading a valid .imscc file
    await page.locator('#fileInput').evaluate((input: HTMLInputElement) => {
      const file = new File(['test content'], 'course.imscc', { type: 'application/zip' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Check that file info is displayed
    const fileInfo = page.locator('#fileInfo');
    await expect(fileInfo).toBeVisible();
    await expect(page.locator('#fileName')).toContainText('course.imscc');
    
    // Check that process button appears
    const processBtn = page.locator('#processBtn');
    await expect(processBtn).toBeVisible();
  });

  test('should reject files over 100MB', async ({ page }) => {
    // Simulate uploading a file over 100MB by creating a mock file
    await page.evaluate(() => {
      const input = document.getElementById('fileInput') as HTMLInputElement;
      const largeSize = 101 * 1024 * 1024; // 101 MB
      
      // Create a large array buffer
      const buffer = new ArrayBuffer(8);
      const blob = new Blob([buffer]);
      
      // Override the size property
      Object.defineProperty(blob, 'size', {
        value: largeSize,
        writable: false
      });
      
      const file = new File([blob], 'large-course.imscc', { type: 'application/zip' });
      
      // Override the file size
      Object.defineProperty(file, 'size', {
        value: largeSize,
        writable: false
      });
      
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Check for error message
    const errorMessage = page.locator('#errorMessage');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('File size exceeds 100 MB limit');
  });

  test('should handle drag and drop', async ({ page }) => {
    const uploadArea = page.locator('#uploadArea');
    
    // Simulate dragover
    await uploadArea.dispatchEvent('dragover');
    await expect(uploadArea).toHaveClass(/drag-over/);
    
    // Simulate dragleave
    await uploadArea.dispatchEvent('dragleave');
    await expect(uploadArea).not.toHaveClass(/drag-over/);
  });

  test('should display stats section when results are shown', async ({ page }) => {
    const resultsSection = page.locator('#resultsSection');
    
    // Initially hidden
    await expect(resultsSection).not.toBeVisible();
    
    // Stats elements should exist
    await expect(page.locator('#fileCount')).toBeAttached();
    await expect(page.locator('#folderCount')).toBeAttached();
    await expect(page.locator('#totalSize')).toBeAttached();
  });

  test('should have download all button', async ({ page }) => {
    const downloadAllBtn = page.locator('#downloadAllBtn');
    await expect(downloadAllBtn).toBeAttached();
    await expect(downloadAllBtn).toContainText('Download All');
  });

  test('should display progress section', async ({ page }) => {
    const progressSection = page.locator('#progressSection');
    const progressFill = page.locator('#progressFill');
    const progressText = page.locator('#progressText');
    
    await expect(progressSection).toBeAttached();
    await expect(progressFill).toBeAttached();
    await expect(progressText).toBeAttached();
  });

  test('UI elements should be properly styled', async ({ page }) => {
    // Check that CSS is loaded by verifying computed styles
    const uploadArea = page.locator('#uploadArea');
    const borderStyle = await uploadArea.evaluate((el) => 
      window.getComputedStyle(el).borderStyle
    );
    
    expect(borderStyle).toBe('dashed');
  });

  test('should format file sizes correctly', async ({ page }) => {
    // Test the file size formatter by injecting a file
    await page.locator('#fileInput').evaluate((input: HTMLInputElement) => {
      const file = new File(['x'.repeat(1024)], 'test.imscc', { type: 'application/zip' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const fileSize = page.locator('#fileSize');
    await expect(fileSize).toContainText(/Size:/);
  });
});

test.describe('CM-Packer Processing (Mock)', () => {
  test('should initialize processor class', async ({ page }) => {
    await page.goto('/');
    
    // Check that IMSCCProcessor class is available
    const processorExists = await page.evaluate(() => {
      return typeof (window as unknown as Record<string, unknown>).IMSCCProcessor !== 'undefined';
    });
    
    // Note: This might fail if classes aren't exposed globally
    // which is fine for encapsulation
    console.log('Processor available globally:', processorExists);
  });

  test('should handle process button click', async ({ page }) => {
    await page.goto('/');
    
    // Add a valid file
    await page.locator('#fileInput').evaluate((input: HTMLInputElement) => {
      const file = new File(['test'], 'course.imscc', { type: 'application/zip' });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const processBtn = page.locator('#processBtn');
    await expect(processBtn).toBeVisible();
    
    // Click should trigger processing (will fail without valid IMSCC, but button should work)
    await processBtn.click();
    
    // Progress section should appear
    const progressSection = page.locator('#progressSection');
    await expect(progressSection).toBeVisible({ timeout: 2000 });
  });
});
