// The app's build: Vite builds web/ into web/dist, which the server serves as plain files. In development, vite's own
// server proxies /api to the dev process on 8791.
// The pages are split (web/src/pages.tsx): each page is a file of its own. The libraries (React, the router, the
// server-data cache) go in one "vendor" file, which changes only when a version does, so a deploy leaves its cached copy
// good. What two or more pages share (the parts in web/src/ui/, the Markdown reader), the bundler puts in shared files
// by itself: one file for all of web/src/ui/ was tried, and made a cold load of Home 10 KB bigger for no gain.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// The code and the styles, also written squeezed (brotli and gzip) beside each file: the server sends the squeezed copy
// to a browser that takes it (serveStatic's precompressed), so the phone downloads about a third of the bytes. Done
// once here, at build time, instead of on every request.
function precompress(): Plugin {
  return {
    name: "kestrel-precompress",
    apply: "build",
    writeBundle(options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (!/\.(js|css)$/.test(name)) continue;
        const file = join(options.dir ?? "", name);
        const body = readFileSync(file);
        writeFileSync(`${file}.br`, brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
        writeFileSync(`${file}.gz`, gzipSync(body, { level: 9 }));
      }
    },
  };
}

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss(), precompress()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "vendor", test: /[\\/]node_modules[\\/]/ }],
        },
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:8791" } },
});
