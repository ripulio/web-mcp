import { rm } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "..", "dist");

async function clean() {
  await rm(outDir, { recursive: true, force: true });
  console.log(`Removed ${outDir}`);
}

clean().catch((error) => {
  console.error("Clean failed", error);
  process.exitCode = 1;
});
