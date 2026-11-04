// Lint mínimo de propósito: só as regras dos hooks do React, que o tsc não pega (hook condicional, dependência
// esquecida no efeito). Estilo fica com o editor; tipos, com o tsc.
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: [".next/**", "node_modules/**", "site/**", "next-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
