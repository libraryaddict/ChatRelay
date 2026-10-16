const js = require("@eslint/js");
const tseslint = require("@typescript-eslint/eslint-plugin");
const prettier = require("eslint-config-prettier");
const unusedImports = require("eslint-plugin-unused-imports");

module.exports = [
  js.configs.recommended,
  ...tseslint.configs["flat/recommended"],
  prettier,
  {
    plugins: { "unused-imports": unusedImports },
    rules: {
      "linebreak-style": ["off", "unix"],
      quotes: ["off", "double"],
      "no-empty": ["warn"],
      "@typescript-eslint/no-inferrable-types": ["off"],
      "no-constant-condition": ["off"],
      "prefer-const": ["warn"],
      curly: ["warn"],
      "@typescript-eslint/no-empty-function": ["off"],
      "no-case-declarations": ["off"],
      "@typescript-eslint/no-unused-vars": ["off"],
      "unused-imports/no-unused-imports": ["error"],
      "lines-between-class-members": [
        "warn",
        "always",
        { exceptAfterSingleLine: true }
      ],
      "padding-line-between-statements": [
        "warn",
        {
          blankLine: "always",
          prev: "*",
          next: ["return", "multiline-block-like"]
        },
        {
          blankLine: "always",
          prev: "multiline-block-like",
          next: ["*"]
        }
      ],
      "@typescript-eslint/no-explicit-any": ["off"]
    }
  }
];
