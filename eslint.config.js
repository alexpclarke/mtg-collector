import js from "@eslint/js";
import globals from "globals";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  {
    rules: {
      "array-element-newline": ["error", "consistent"],
      "array-bracket-newline": ["error", "consistent"],
    },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      globals: {
        ...globals.browser,
        Vue: "readonly",
        Papa: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        Vue: "readonly",
        Papa: "readonly",
      },
    },
  },
  {
    files: ["scripts/**/*.js", "tests/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
];
