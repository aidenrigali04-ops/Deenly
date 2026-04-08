const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  ...expoConfig,
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        console: "readonly",
        require: "readonly",
        fetch: "readonly"
      }
    }
  },
  {
    ignores: ["dist/**", "dist-web/**", ".expo/**", "coverage/**", "node_modules/**"]
  }
]);
