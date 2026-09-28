import { readdir, stat, unlink } from "node:fs/promises";

// TypeScript leaves deleted modules in dist; Sapphire would still register them.
const output = new URL("../dist/src/commands/", import.meta.url);
async function prune(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const path = `${relative}${entry.name}`;
    if (entry.isDirectory()) await prune(new URL(`${entry.name}/`, directory), `${path}/`);
    else if (entry.isFile() && entry.name.endsWith(".js")) {
      const source = new URL(`../src/commands/${path.replace(/\.js$/, ".ts")}`, import.meta.url);
      const exists = await stat(source).then(() => true).catch((error) => {
        if (error.code === "ENOENT") return false;
        throw error;
      });
      if (!exists) await unlink(new URL(entry.name, directory));
    }
  }
}
await prune(output);
