import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import ts from "typescript";
import {
  pluginManifestSchema,
  catalogSchema,
} from "../dist/src/modules/plugins/domain/manifest.js";
import { packageHash, within } from "../dist/src/modules/plugins/infrastructure/files.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]{0,47}$/.test(id))
  throw new Error("Usage: node scripts/package-plugin.mjs PLUGIN-ID");
const source = within(root, `plugins/${id}`);
const target = within(source, "package");
const manifest = pluginManifestSchema.parse(
  JSON.parse(await readFile(join(source, "plugin.json"), "utf8")),
);
if (manifest.id !== id) throw new Error("Plugin ID does not match its folder");
// This fixed package subdirectory is verified inside the named plugin folder.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
async function compile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Plugin source cannot include symlinks");
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compile(path);
    else if (entry.name.endsWith(".ts")) {
      const result = ts.transpileModule(await readFile(path, "utf8"), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ES2022,
          newLine: ts.NewLineKind.LineFeed,
          verbatimModuleSyntax: true,
        },
        fileName: path,
      });
      const destination = within(
        target,
        relative(join(source, "src"), path).replace(/\.ts$/, ".js"),
      );
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, result.outputText);
    }
  }
}
await compile(join(source, "src"));
await writeFile(join(target, "plugin.json"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(join(target, "package.json"), '{"type":"module","private":true}\n');
const sha256 = await packageHash(target);
const catalogPath = join(root, "marketplace/catalog.json");
const catalog = catalogSchema.parse(JSON.parse(await readFile(catalogPath, "utf8")));
catalog.plugins = catalog.plugins.filter((entry) => entry.manifest.id !== id);
catalog.plugins.push({ manifest, packagePath: `plugins/${id}/package`, sha256 });
catalog.plugins.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(`Packaged and listed ${id} ${manifest.version}: ${sha256}. Not installed.`);
