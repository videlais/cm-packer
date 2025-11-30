# cm-packer

A command-line tool for packing and unpacking IMSCC (IMS Common Cartridge) files used by Canvas LMS and other learning management systems. This tool follows the Common Cartridge 1.4 standard.

## Features

- **Unpack IMSCC files**: Extract and parse IMSCC files (ZIP format) into organized folders and files.
- **Pack directories**: Convert folders and files back into valid IMSCC files.
- **Remap content**: Reorganize unpacked IMSCC content into human-readable folder structures based on course organization.
- **Metadata parsing**: Automatically parse and generate manifest metadata.

## Installation

### From source

```bash
git clone https://github.com/videlais/cm-packer.git
cd cm-packer
npm install
npm run build
```

### Using from NPM

```bash
npm i -g cm-packer
```

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
