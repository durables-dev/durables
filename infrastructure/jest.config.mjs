// Synth tests (infrastructure/CONVENTIONS.md). Jest, because CDK Terrain's matchers ship for it.
export default {
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { useESM: true }],
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
};
