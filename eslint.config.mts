import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // JavaScript + TypeScript base rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,tsx}"], // include TS + TSX
    languageOptions: {
      parser: tseslint.parser, // enables TypeScript parsing
      parserOptions: {
        project: "./tsconfig.json", // ensures type-aware linting
        sourceType: "module",
        ecmaFeatures: {
          jsx: true, // enable JSX parsing for TSX files
        },
      },
      globals: {
        ...globals.browser, // for frontend
        ...globals.node, // for backend/MCP server
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // add or tweak your rules here
      "@typescript-eslint/no-unused-vars": ["warn"],
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
]);
