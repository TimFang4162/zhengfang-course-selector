import { rmSync } from "node:fs";
import { build } from "vite";
import solid from "vite-plugin-solid";

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
  plugins: [solid()],
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
