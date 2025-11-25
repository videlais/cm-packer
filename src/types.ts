export interface IMSCCManifest {
  metadata?: {
    schema?: string;
    schemaversion?: string;
    [key: string]: unknown;
  };
  organizations?: {
    organization?: Array<{
      $?: {
        identifier?: string;
        structure?: string;
      };
      identifier?: string;
      structure?: string;
      item?: unknown[];
    }>;
  };
  resources?: {
    resource?: Array<{
      $?: {
        identifier?: string;
        type?: string;
        href?: string;
      };
      identifier?: string;
      type?: string;
      href?: string;
      file?: Array<{
        $?: {
          href?: string;
        };
        href?: string;
      }>;
      [key: string]: unknown;
    }>;
  };
  $?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface UnpackOptions {
  inputFile: string;
  outputDir: string;
  verbose?: boolean;
}

export interface PackOptions {
  inputDir: string;
  outputFile: string;
  verbose?: boolean;
}
