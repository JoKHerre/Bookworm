import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", ".pgdata", ".direnv"]),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    // Frontend
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Backend and Node config files
    files: ["server/**/*.ts", "*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Must come last: turns off rules that conflict with Prettier.
  prettier,
]);
