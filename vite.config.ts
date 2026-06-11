import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Keep the full Vue build (runtime + template compiler) while main.ts
      // still uses the inline `template:` string option. Remove this alias
      // once the root component is migrated to an SFC.
      vue: "vue/dist/vue.esm-bundler.js",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
