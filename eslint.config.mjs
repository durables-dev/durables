import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import checkFile from "eslint-plugin-check-file";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import { readdirSync } from "node:fs";
import tseslint from "typescript-eslint";

// Shared lint rules for every surface (docs/adr/0010). A surface adds its framework's
// rules in its own block below; it never turns the shared ones off.

// web: a feature may import from src/components, src/lib and src/app, never from
// another feature (web/CONVENTIONS.md).
const features = readdirSync(new URL("./web/src/features", import.meta.url));
const featureZones = features.map((feature) => ({
  target: `./web/src/features/${feature}`,
  from: "./web/src/features",
  except: [`./${feature}`],
}));

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "api/.wrangler/",
    "api/dist-types/",
    "api/worker-configuration.d.ts",
    "web/test/public/",
    "infrastructure/.gen/",
    "infrastructure/cdktf.out/",
    "e2e/test-results/",
    "e2e/playwright-report/",
  ]),
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["web/**/*.{ts,tsx}"],
    extends: [
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    plugins: { "check-file": checkFile, "import-x": importX },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      // Resolves the @/ alias so the feature-boundary rule sees every import.
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ project: "web/tsconfig.json" }),
      ],
    },
    rules: {
      "check-file/filename-naming-convention": [
        "error",
        { "**/*.{ts,tsx,css}": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true },
      ],
      "check-file/folder-naming-convention": [
        "error",
        { "web/src/**/": "KEBAB_CASE" },
      ],
      "import-x/no-restricted-paths": ["error", { zones: featureZones }],
      // The React Compiler memoizes (web/CONVENTIONS.md); these are never written by hand.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useMemo", "useCallback", "memo"],
              message: "The React Compiler memoizes. Do not memoize by hand.",
            },
          ],
        },
      ],
    },
  },
);
