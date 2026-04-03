module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['\\.web\\.test\\.ts$'],  // Ignore Playwright web tests
  testTimeout: 30000, // Integration tests may take longer
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
    '!src/types.ts',
    '!src/index.ts',
    '!src/web/**/*.ts'  // Exclude web files from Jest coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
