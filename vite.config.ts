// The app's build: Vite builds web/ into web/dist, which the server serves as plain files. In development, vite's own
// server proxies /api to the dev process on 8791.
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:8791" } },
});
