import { copyFile, mkdir, readdir, stat } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, "..", "src");
const outDir = path.resolve(__dirname, "..", "dist");

async function copyStaticAssets() {
  await mkdir(outDir, { recursive: true });
  await copyRecursive(srcDir, outDir);
}

async function copyRecursive(currentSrc, currentDest) {
  const entries = await readdir(currentSrc, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(currentSrc, entry.name);
    const destPath = path.join(currentDest, entry.name);

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
      continue;
    }

    if (entry.isFile()) {
      const extension = path.extname(entry.name);
      if (extension === ".ts" || extension === ".tsx") {
        continue;
      }

      await mkdir(path.dirname(destPath), { recursive: true });
      await copyFile(srcPath, destPath);
    }
  }
}

copyStaticAssets()
  .then(() => {
    console.log(`Copied static assets from ${srcDir} to ${outDir}`);
  })
  .catch(async (error) => {
    console.error("Failed to copy static assets", error);

    try {
      const outDirExists = await stat(outDir).then(
        () => true,
        () => false,
      );
      if (!outDirExists) {
        await mkdir(outDir, { recursive: true });
      }
    } catch (statError) {
      console.error("Failed to ensure output directory exists", statError);
    }

    process.exitCode = 1;
  });
