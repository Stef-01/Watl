import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "post", test: /node_modules[\\/](postprocessing|@react-three[\\/]postprocessing)[\\/]/ },
            { name: "motion", test: /node_modules[\\/](gsap|@gsap|lenis)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|zustand|@react-three[\\/]fiber)[\\/]/ },
            { name: "tuning", test: /node_modules[\\/](leva|@radix-ui|@use-gesture|@stitches|colord|v8n|merge-value|dequal|react-dropzone|react-colorful|mdast|@babel)[\\/]/ },
          ],
        },
      },
    },
  },
});
