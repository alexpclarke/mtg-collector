import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "src/**/*.ts"],
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
    files: ["scripts/**/*.js", "tests/**/*.mjs", "tests/**/*.ts"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
];
