#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import { IMSCCUnpacker } from './unpacker';
import { IMSCCPacker } from './packer';
import { IMSCCRemapper } from './remapper';
import * as path from 'path';

const MAX_INPUT_FILE_BYTES = 1024 * 1024 * 1024;

const program = new Command();

function assertImsccInput(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.imscc') {
    throw new Error(`Input file must use the .imscc extension: ${filePath}`);
  }

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Input path must be a file: ${filePath}`);
    }
    if (stat.size > MAX_INPUT_FILE_BYTES) {
      throw new Error(`Input file exceeds the ${MAX_INPUT_FILE_BYTES} byte limit: ${filePath}`);
    }
  }
}

function assertImsccOutput(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.imscc') {
    throw new Error(`Output file must use the .imscc extension: ${filePath}`);
  }
}

program
  .name('cm-packer')
  .description('CLI tool for packing and unpacking IMSCC files (Common Cartridge 1.4)')
  .version('1.0.4');

program
  .command('unpack')
  .description('Unpack an IMSCC file into a directory')
  .requiredOption('-i, --input <file>', 'Input IMSCC file path')
  .requiredOption('-o, --output <directory>', 'Output directory path')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      const inputFile = path.resolve(options.input);
      assertImsccInput(inputFile);

      const unpacker = new IMSCCUnpacker({
        inputFile,
        outputDir: path.resolve(options.output),
        verbose: options.verbose,
      });
      await unpacker.unpack();
      console.log('✅ Successfully unpacked IMSCC file');
    } catch (error) {
      if (error instanceof Error) {
        console.error('❌ Error:', error.message);
      } else {
        console.error('❌ An unknown error occurred');
      }
      process.exit(1);
    }
  });

program
  .command('pack')
  .description('Pack a directory into an IMSCC file')
  .requiredOption('-i, --input <directory>', 'Input directory path')
  .requiredOption('-o, --output <file>', 'Output IMSCC file path')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      const outputFile = path.resolve(options.output);
      assertImsccOutput(outputFile);

      const packer = new IMSCCPacker({
        inputDir: path.resolve(options.input),
        outputFile,
        verbose: options.verbose,
      });
      await packer.pack();
      console.log('✅ Successfully packed directory to IMSCC file');
    } catch (error) {
      if (error instanceof Error) {
        console.error('❌ Error:', error.message);
      } else {
        console.error('❌ An unknown error occurred');
      }
      process.exit(1);
    }
  });

program
  .command('remap')
  .description('Remap unpacked IMSCC directory to human-readable structure')
  .option('-i, --input <directory>', 'Input directory path (unpacked IMSCC)')
  .option('-f, --file <file>', 'Input IMSCC file path (will be unpacked automatically)')
  .requiredOption('-o, --output <directory>', 'Output directory path for remapped structure')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      // Validate that either input or file is provided
      if (!options.input && !options.file) {
        console.error('❌ Error: Either --input or --file must be provided');
        process.exit(1);
      }
      
      if (options.input && options.file) {
        console.error('❌ Error: Cannot specify both --input and --file');
        process.exit(1);
      }

      const inputFile = options.file ? path.resolve(options.file) : undefined;
      if (inputFile) {
        assertImsccInput(inputFile);
      }

      const remapper = new IMSCCRemapper({
        inputDir: options.input ? path.resolve(options.input) : undefined,
        inputFile,
        outputDir: path.resolve(options.output),
        verbose: options.verbose,
      });
      await remapper.remap();
      console.log('✅ Successfully remapped IMSCC directory');
    } catch (error) {
      if (error instanceof Error) {
        console.error('❌ Error:', error.message);
      } else {
        console.error('❌ An unknown error occurred');
      }
      process.exit(1);
    }
  });

program.parse();
