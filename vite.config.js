import { defineConfig } from "vite";
import { resolve } from "node:path";

// Multi-page: every route is its own HTML entry, so the site still degrades
// to plain documents and each page ships only what it needs.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        index:    resolve(__dirname, "index.html"),
        approach: resolve(__dirname, "approach.html"),
        work:     resolve(__dirname, "work.html"),
        about:    resolve(__dirname, "about.html"),
        contact:  resolve(__dirname, "contact.html"),
        notfound: resolve(__dirname, "404.html"),
      },
    },
  },
});
