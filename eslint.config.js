import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "services/scheduler/.local/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["services/scheduler/web/*.js"],
    languageOptions: { sourceType: "script", globals: globals.browser },
  },
  {
    files: ["services/scheduler/web/app.js"],
    languageOptions: { globals: {
      SNCSTimetable: "readonly", renderWorkspace: "readonly",
      setWorkspaceHeading: "readonly", initWorkspace: "readonly",
    } },
  },
  {
    files: ["services/scheduler/web/workspace.js"],
    languageOptions: { globals: Object.fromEntries([
      "$", "data", "table", "loadOptions", "esc", "busy", "discardLoadForm",
      "markDirty", "renderTable", "notice", "operation", "saveInputs",
      "switchTable", "showView", "request",
    ].map(name => [name, "readonly"])) },
  },
  {
    files: ["services/scheduler/web/timetable.js"],
    languageOptions: { globals: { module: "readonly" } },
  },
  {
    files: ["services/scheduler/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: globals.node } },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.{ts,vue}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      "vue/html-self-closing": "off",
      "vue/max-attributes-per-line": "off",
      "vue/multi-word-component-names": "off",
      "vue/singleline-html-element-content-newline": "off",
    },
  },
);
