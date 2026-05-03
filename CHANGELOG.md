# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-03

### Added

- Cross-platform standalone CLI binaries (Windows x64, macOS x64, Linux x64) built via `@yao-pkg/pkg` and published automatically on tagged releases via a new `release-binaries` GitHub Actions workflow.
- `docs/downloads.html` — GitHub Pages downloads page that fetches the latest release from the GitHub API and renders platform-specific download cards.
- `scripts/build-binaries.js` and `scripts/smoke-test-binary.js` for local binary builds and validation.
- `build:binaries` and `test:binary` npm scripts.
- CI and CodeQL status badges in `README.md`.
- "Using Native Binaries" section and local binary build instructions in `README.md`.

### Changed

- Web bundle (`docs/cm-packer.js`) is now fully self-contained: jszip is bundled by esbuild and FileSaver is replaced by a native `URL.createObjectURL` helper, removing both CDN `<script>` dependencies from `docs/index.html`.
- `docs/index.html` gains navigation links to the downloads page and GitHub source.

### Security

- Resolved CodeQL finding: external CDN script includes in `docs/index.html` replaced with locally bundled code (no untrusted external resources loaded at runtime).
- `playwright-report/` added to `.gitignore` to prevent accidental commit of test artifacts.

### Dependencies

- `jszip` added as a `devDependency` (bundled into the web build).
- `eslint` bumped to `10.3.0`.
- `typescript` bumped to `6.0.3`.
- `esbuild` bumped to `0.28.0`.
- `@types/node` bumped to `25.6.0`.
- `@typescript-eslint/eslint-plugin` bumped to `8.59.1`.

## [1.0.4] — 2026-02-01

### Added

- `remap` command: reorganises an unpacked IMSCC directory (or a raw `.imscc` file via `--file`) into a human-readable folder structure based on the manifest organisation, renaming files from resource IDs to module/item titles and integrating wiki page HTML into the appropriate modules.
- `--file` (`-f`) option on `remap` to unpack and remap in a single step without a separate `unpack` pass.

### Security

- Hardened zip-slip protection: archive entry paths are normalised and validated to stay within the chosen output directory.
- Symbolic links rejected during both packing and unpacking.
- Archives that expand beyond 1 GiB are rejected.
- Manifest XML files containing DTD or entity declarations are rejected.

### Changed

- README updated with `remap` command documentation and example workflow.
- CLI package metadata updated.

### Dependencies

- `ts-jest` bumped to `29.4.6`.
- `eslint` bumped to `9.39.2`.
- `@typescript-eslint/eslint-plugin` bumped to `8.51.0`.
- `@typescript-eslint/parser` bumped to `8.51.0`.
- `@types/node` bumped to `25.0.3`.

## [1.0.0] — 2025-11-25

### Added

- Initial release of cm-packer.
- `unpack` command: extracts `.imscc` ZIP archives to a directory and writes a `metadata.json` summary.
- `pack` command: packages a directory back into a valid `.imscc` ZIP file.
- Browser-based web interface (`docs/index.html`) — no installation required, supports drag-and-drop up to 100 MB.
- esbuild pipeline (`scripts/build-web.js`) producing `docs/cm-packer.js` for the web interface.
- GitHub Actions CI workflow.
- CodeQL Advanced analysis workflow.
- Dependabot configuration for automated dependency updates.
