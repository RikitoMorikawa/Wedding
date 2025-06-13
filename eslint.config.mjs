import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Lambda関数のディレクトリではrequire()を許可
  {
    files: ["amplify/backend/function/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-console": "off", // Lambda関数ではconsole.logが必要
    },
    env: {
      node: true,
      es6: true,
    },
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "script", // CommonJSを使用
    },
  },
];

export default eslintConfig;
