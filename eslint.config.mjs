import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dashboard/node_modules/**",
      "dashboard/.next/**",
      "dashboard/next-env.d.ts",
      "deploy/sites/scripts/**",
      "deploy/sites/vendor/**",
      ".sites-build/**",
      "sites/**",
      "dist/**",
      ".cache/**",
      ".centerify/**",
      "artifacts/**",
      "plugins/*/package/**",
      "plugins/installed/**",
      ".agents/**",
      ".claude/**",
      ".cursor/**",
      ".devin/**",
      ".codex/**",
      "migrations/**",
      "src/prisma/**",
    ],
  },
  { files: ["**/*.{ts,tsx,mjs}"], ...js.configs.recommended },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  { files: ["tests/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
];
