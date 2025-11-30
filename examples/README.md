# Examples

This directory contains example files for testing the cm-packer tool.

## Sample Course Content

The `sample-course/` directory contains a simple example of course content that can be packed into an IMSCC file.

### Testing the tool

1. **Pack the sample course:**

```bash
node dist/cli.js pack -i examples/sample-course -o examples/output.imscc -v
```

1. **Unpack the IMSCC file:**

```bash
node dist/cli.js unpack -i examples/output.imscc -o examples/unpacked -v
```

1. **Compare the original and unpacked content:**

```bash
diff -r examples/sample-course examples/unpacked
```
