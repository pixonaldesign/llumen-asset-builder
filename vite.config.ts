import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/llumen-asset-builder/",
  plugins: [react()],
  resolve: {
    alias: {
      "@/lib": fileURLToPath(new URL("./src/map3d", import.meta.url)),
    },
  },
  server: {
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
});
