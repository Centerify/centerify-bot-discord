import { readdir, stat, unlink, rmdir } from "node:fs/promises";

// TypeScript leaves moved or deleted source files in dist. Prune stale runtime files.
const output = new URL("../dist/src/", import.meta.url);
async function prune(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const path = `${relative}${entry.name}`;
    if (entry.isDirectory()) {
      const child = new URL(`${entry.name}/`, directory);
      await prune(child, `${path}/`);
      if ((await readdir(child)).length === 0) await rmdir(child);
    }
    else if (entry.isFile() && entry.name.endsWith(".js")) {
      const source = new URL(`../src/${path.replace(/\.js$/, ".ts")}`, import.meta.url);
      const exists = await stat(source).then(() => true).catch((error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      if (!exists) await unlink(new URL(entry.name, directory));
    }
  }
}
await prune(output);
