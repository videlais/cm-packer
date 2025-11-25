#!/usr/bin/env node

import { Command } from 'commander';
import { IMSCCUnpacker } from './unpacker';
import { IMSCCPacker } from './packer';
import * as path from 'path';

const program = new Command();

program
  .name('cm-packer')
  .description('CLI tool for packing and unpacking IMSCC files (Common Cartridge 1.4)')
  .version('1.0.0');

program
  .command('unpack')
  .description('Unpack an IMSCC file into a directory')
  .requiredOption('-i, --input <file>', 'Input IMSCC file path')
  .requiredOption('-o, --output <directory>', 'Output directory path')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    try {
      const unpacker = new IMSCCUnpacker({
        inputFile: path.resolve(options.input),
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
      const packer = new IMSCCPacker({
        inputDir: path.resolve(options.input),
        outputFile: path.resolve(options.output),
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

program.parse();
