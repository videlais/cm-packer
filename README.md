# cm-packer

A command-line tool for packing and unpacking IMSCC (IMS Common Cartridge) files used by Canvas LMS and other learning management systems. This tool follows the Common Cartridge 1.4 standard.

## Features

- **Unpack IMSCC files**: Extract and parse IMSCC files (ZIP format) into organized folders and files.
- **Pack directories**: Convert folders and files back into valid IMSCC files.
- **Metadata parsing**: Automatically parse and generate manifest metadata.

## Installation

### From source

```bash
git clone https://github.com/videlais/cm-packer.git
cd cm-packer
npm install
npm run build
```

### Using npm link (for development)

```bash
npm link
```

This will make the `cm-packer` command available globally on your system.

## Usage

### Unpack an IMSCC file

Extract an IMSCC file to a directory:

```bash
cm-packer unpack -i course.imscc -o ./output-folder
```

With verbose logging:

```bash
cm-packer unpack -i course.imscc -o ./output-folder -v
```

### Pack a directory into an IMSCC file

Create an IMSCC file from a directory:

```bash
cm-packer pack -i ./input-folder -o course.imscc
```

With verbose logging:

```bash
cm-packer pack -i ./input-folder -o course.imscc -v
```

## Command Reference

### `unpack`

Unpack an IMSCC file into a directory.

**Options:**

- `-i, --input <file>` - Input IMSCC file path (required)
- `-o, --output <directory>` - Output directory path (required)
- `-v, --verbose` - Enable verbose logging (optional)

### `pack`

Pack a directory into an IMSCC file.

**Options:**

- `-i, --input <directory>` - Input directory path (required)
- `-o, --output <file>` - Output IMSCC file path (required)
- `-v, --verbose` - Enable verbose logging (optional)

## IMSCC File Structure

An IMSCC file is a ZIP archive that contains:

- `imsmanifest.xml` - Main manifest file describing the cartridge contents
- Various content files (HTML, images, resources, etc.)
- Organized in folders based on content type

When unpacking, cm-packer will:

1. Extract all files to the specified directory
2. Parse the manifest XML
3. Create a `metadata.json` file with summary information

When packing, cm-packer will:

1. Scan the directory for files
2. Create or use existing `imsmanifest.xml`
3. Package everything into a valid IMSCC ZIP file

## Development

### Build

```bash
npm run build
```

### Run tests

Run all tests (unit + integration) with coverage:
```bash
npm test
```

Run only unit tests:
```bash
npm run test:unit
```

Run only integration tests:
```bash
npm run test:integration
```

Run tests in watch mode:
```bash
npm run test:watch
```

### Lint

```bash
npm run lint
```

### Run all checks

Lint, test, and build in one command:
```bash
npm run all
```

### Testing

The project includes comprehensive test coverage:

- **Unit Tests** (`src/tests/*.test.ts`): Test individual modules (packer, unpacker) with mocked dependencies
- **Integration Tests** (`src/__tests__/cli.integration.test.ts`): Test the full CLI by executing actual commands
  - Pack/unpack operations with real files
  - Round-trip testing (pack → unpack → verify)
  - Error handling and edge cases
  - CLI argument validation

**Coverage Collection**: 
- Unit tests use Jest's built-in coverage
- Integration tests use `c8` to track coverage of executed CLI commands
- Combined coverage reflects real-world usage of both the library and CLI

**Current Coverage**: 81%+ statements, 81%+ branches, 85%+ functions

## Project Structure

```
cm-packer/
├── src/
│   ├── __tests__/        # Integration tests
│   ├── tests/            # Unit tests
│   ├── fixtures/         # Test fixtures
│   ├── cli.ts           # CLI interface
│   ├── index.ts         # Main exports
│   ├── packer.ts        # IMSCC packer module
│   ├── unpacker.ts      # IMSCC unpacker module
│   └── types.ts         # TypeScript type definitions
├── dist/                # Compiled JavaScript (generated)
├── examples/            # Example IMSCC files
├── package.json
├── tsconfig.json        # TypeScript configuration
├── jest.config.js       # Jest configuration
├── eslint.config.js     # ESLint configuration
└── README.md
```

## Dependencies

- **adm-zip**: For ZIP file handling
- **commander**: For CLI interface
- **xml2js**: For XML parsing and building
- **TypeScript**: For type-safe development
- **Jest**: For testing
- **ESLint**: For code quality

## License

MIT

## Common Cartridge Standard

This tool implements the IMS Common Cartridge 1.4 standard. For more information, visit:

- [IMS Global Learning Consortium](https://www.imsglobal.org/)
- [Common Cartridge Specification](https://www.imsglobal.org/cc/index.html)
