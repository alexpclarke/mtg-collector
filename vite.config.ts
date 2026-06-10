import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      // Use the full Vue build (runtime + template compiler) since main.ts
      // uses the inline `template:` option. Switch to the runtime-only build
      // once the app is migrated to SFCs.
      vue: "vue/dist/vue.esm-bundler.js",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
