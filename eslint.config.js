import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ["tests/**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      "tests/**/*.spec.js",
      "tests/sheets-dom.test.js",
      "tests/fixtures/appRuntime.js",
      "tests/fixtures/fakeMaps.js",
      "tests/fixtures/localSupabase.js",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "eslint.config.js", "prettier.config.js", "playwright.config.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "vite.config.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    plugins: {
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-redundant-type-constituents": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-unsafe-return": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-unsafe-call": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-unsafe-member-access": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-unsafe-assignment": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-base-to-string": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/no-unsafe-argument": "off",
      // 既有 type-aware 型別債，本批不改變既有程式語意。
      "@typescript-eslint/unbound-method": "off",
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  }
);
