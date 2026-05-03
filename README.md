# cm-packer

[![CI](https://github.com/videlais/cm-packer/actions/workflows/ci.yml/badge.svg)](https://github.com/videlais/cm-packer/actions/workflows/ci.yml)
[![CodeQL](https://github.com/videlais/cm-packer/actions/workflows/codeql.yml/badge.svg)](https://github.com/videlais/cm-packer/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/cm-packer.svg)](https://www.npmjs.com/package/cm-packer)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

A command-line tool for packing and unpacking IMSCC (IMS Common Cartridge) files used by Canvas LMS and other learning management systems. This tool follows the Common Cartridge 1.4 standard.

## Features

- **Unpack IMSCC files**: Extract and parse IMSCC files (ZIP format) into organized folders and files.
- **Pack directories**: Convert folders and files back into valid IMSCC files.
- **Remap content**: Reorganize unpacked IMSCC content into human-readable folder structures based on course organization.
- **Metadata parsing**: Automatically parse and generate manifest metadata.
- **Web interface**: Browser-based version available in `/docs` folder - no installation required!

## Installation

### Web Version (No Installation Required)

Try the browser-based version:

1. Open `docs/index.html` in a web browser
2. Drag and drop an IMSCC file (up to 100 MB)
3. Download the remapped files

Or visit the hosted version at: [https://videlais.github.io/cm-packer/](https://videlais.github.io/cm-packer/)

The GitHub Pages site also exposes the latest native CLI download links at:

- [https://videlais.github.io/cm-packer/downloads.html](https://videlais.github.io/cm-packer/downloads.html)

### From source

```bash
git clone https://github.com/videlais/cm-packer.git
cd cm-packer
nvm use
npm install
npm run build
```

cm-packer requires Node.js 20 or newer and is exercised in CI on Node.js 22.

### Using from NPM

```bash
npm i -g cm-packer
```

### Using Native Binaries

Tagged releases publish standalone x64 CLI binaries for:

- Windows
- macOS
- Linux (Debian and Ubuntu style distributions)

Download them from GitHub Pages or directly from the latest GitHub Release:

- [Downloads](https://videlais.github.io/cm-packer/downloads.html)
- [Latest Releases](https://github.com/videlais/cm-packer/releases/latest)

## Validation

```bash
npm run audit
npm run lint
npm test
npm run build:web
```

To build and smoke-test a local standalone binary:

```bash
npm run build
npm run build:binaries -- --target macos-x64
node scripts/smoke-test-binary.js release-assets/cm-packer-v1.0.4-macos-x64
```

The security-sensitive paths reject hostile archives and manifests before extraction or remapping:

- IMSCC archive entries cannot escape the chosen output directory.
- Symbolic links are rejected during packing and unpacking.
- Archives that expand beyond 1 GiB are rejected.
- Manifest XML files containing DTD or entity declarations are rejected.

## Usage

### Unpack an IMSCC file

Extract an IMSCC file to a directory:

```bash
cm-packer unpack -i course.imscc -o ./output-folder
```

The input file must use the `.imscc` extension.

With verbose logging:

```bash
cm-packer unpack -i course.imscc -o ./output-folder -v
```

### Pack a directory into an IMSCC file

Create an IMSCC file from a directory:

```bash
cm-packer pack -i ./input-folder -o course.imscc
```

The output file must use the `.imscc` extension.

With verbose logging:

```bash
cm-packer pack -i ./input-folder -o course.imscc -v
```

### Remap IMSCC content to human-readable structure

Reorganize an unpacked IMSCC directory or directly from an IMSCC file into a folder structure with meaningful names based on the course organization in the manifest:

From an unpacked directory:

```bash
cm-packer remap -i ./unpacked-course -o ./remapped-course
```

Directly from an IMSCC file (automatically unpacks to a temporary directory):

```bash
cm-packer remap -f course.imscc -o ./remapped-course
```

When `--file` is used, the input file must use the `.imscc` extension.

With verbose logging:

```bash
cm-packer remap -f course.imscc -o ./remapped-course -v
```

The remap command will:

- Parse the manifest organization structure.
- Create folders matching module/week names from the course.
- Rename files from IDs to human-readable titles.
- Integrate wiki pages directly into the module structure.
- Copy special directories (course_settings, web_resources, etc.).
- Preserve the manifest and metadata files.

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

### `remap`

Remap unpacked IMSCC directory to human-readable structure based on manifest organization.

**Options:**

- `-i, --input <directory>` - Input directory path (unpacked IMSCC) (either this or `--file` required)
- `-f, --file <file>` - Input IMSCC file path (will be unpacked automatically) (either this or `--input` required)
- `-o, --output <directory>` - Output directory path for remapped structure (required)
- `-v, --verbose` - Enable verbose logging (optional)

**Note:** You must specify either `--input` (for an already unpacked directory) OR `--file` (to unpack and remap in one step), but not both.

## IMSCC File Structure

An IMSCC file is a ZIP archive that contains:

- `imsmanifest.xml` - Main manifest file describing the cartridge contents.
- Various content files (HTML, images, resources, etc.).
- Organized in folders based on content type.

When unpacking, cm-packer will:

1. Extract all files to the specified directory.
2. Parse the manifest XML.
3. Create a `metadata.json` file with summary information.

When packing, cm-packer will:

1. Scan the directory for files.
2. Create or use existing `imsmanifest.xml`.
3. Package everything into a valid IMSCC ZIP file.

When remapping, cm-packer will:

1. Parse the manifest to extract course organization and titles.
2. Create a folder structure matching the course hierarchy (modules, weeks, etc.).
3. Rename files from resource IDs to human-readable titles.
4. Integrate wiki content HTML files into the appropriate modules.
5. Copy special directories and preserve metadata.

## Example Workflow

A typical workflow for working with IMSCC files:

```bash
# 1. Remap an IMSCC file to human-readable structure
cm-packer remap -f my-course.imscc -o ./course-content -v

# 2. Make edits to the human-readable files in ./course-content

# 3. Pack the modified directory back into an IMSCC file
cm-packer pack -i ./course-content -o my-course-updated.imscc -v
```

## License

MIT

## Common Cartridge Standard

This tool implements the IMS Common Cartridge 1.4 standard. For more information, visit:

- [IMS Global Learning Consortium](https://www.imsglobal.org/)
- [Common Cartridge Specification](https://www.imsglobal.org/cc/index.html)
