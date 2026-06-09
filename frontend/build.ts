import { rmSync } from "node:fs";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const outdir = "jwxt/web/static";
const isCheck = Bun.argv.includes("--check");
const targetDir = isCheck ? "/tmp/jwxt-frontend-check" : outdir;
const viteOutDir = isCheck ? targetDir : "../jwxt/web/static";

rmSync(targetDir, { recursive: true, force: true });

await build({
  root: "frontend",
  base: "./",
  configFile: false,
  publicDir: false,
  plugins: [tailwindcss(), react()],
  build: {
    outDir: viteOutDir,
    emptyOutDir: false,
    minify: !isCheck,
    sourcemap: isCheck,
    rollupOptions: {
      input: "index.html",
    },
  },
});

console.log(`Built frontend to ${targetDir}`);
