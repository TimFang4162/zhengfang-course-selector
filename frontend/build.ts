import { rmSync } from "node:fs";

const outdir = "jwxt/web/static";
const isCheck = Bun.argv.includes("--check");
const targetDir = isCheck ? "/tmp/jwxt-frontend-check" : outdir;

rmSync(targetDir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["frontend/index.html"],
  outdir: targetDir,
  target: "browser",
  minify: !isCheck,
  sourcemap: isCheck ? "external" : "none",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built frontend to ${targetDir}`);
