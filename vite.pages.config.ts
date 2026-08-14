import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  define: {
    __VOXEL_RALLY_BUILD_ID__: JSON.stringify(process.env.VOXEL_RALLY_BUILD_ID ?? process.env.GITHUB_SHA?.slice(0, 12) ?? "local"),
  },
  plugins: [react()],
  build: {
    outDir: "out",
    emptyOutDir: true,
    rollupOptions: {
      input: "index.html",
    },
  },
});
