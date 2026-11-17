// Lint do monorepo. Roda no CI (npm run lint) e bloqueia o PR se falhar.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "docs/istqb-ai-ready/**", "test-results/**", "playwright-report/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Variável começando com _ é ignorada de propósito.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" }],
      // Nada de console.log esquecido; avisos e erros podem.
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["server/**/*.ts", "e2e/**/*.ts", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    // Scripts de linha de comando e o servidor de teste podem escrever no console.
    files: ["server/scripts/**", "server/test/**", "e2e/**"],
    rules: { "no-console": "off" },
  },
);
