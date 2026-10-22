import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".sites-build", "centerify");
if (existsSync(output)) throw new Error("Build output already exists; use a fresh checkout.");
mkdirSync(output, { recursive: true });
cpSync(path.join(root, "deploy/sites"), output, { recursive: true });
for (const name of ["app", "components", "lib", "types", "auth.ts"]) {
  cpSync(path.join(root, "dashboard", name), path.join(output, name), { recursive: true });
}
if (existsSync(path.join(root, "dashboard/public"))) {
  cpSync(path.join(root, "dashboard/public"), path.join(output, "public"), { recursive: true });
}

const copied = new Set();
function copyShared(relative) {
  const source = path.join(root, relative);
  if (copied.has(source)) return;
  if (!source.startsWith(path.join(root, "src") + path.sep))
    throw new Error("Unexpected shared import");
  copied.add(source);
  const text = readFileSync(source, "utf8");
  const target = path.join(output, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
  for (const match of text.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
    if (!match[1].startsWith(".")) continue;
    let dependency = path.resolve(path.dirname(source), match[1]).replace(/\.js$/, ".ts");
    if (!path.extname(dependency)) dependency += ".ts";
    copyShared(path.relative(root, dependency));
  }
}

function adapt(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) adapt(file);
    else if (/\.tsx?$/.test(file)) {
      const text = readFileSync(file, "utf8").replace(/(\.\.\/)\.\.\/src\//g, "$1src/");
      writeFileSync(file, text);
      for (const match of text.matchAll(/from\s*["']([^"']+)["']/g)) {
        if (!match[1].startsWith(".")) continue;
        let dependency = path.resolve(path.dirname(file), match[1]).replace(/\.js$/, ".ts");
        if (!path.extname(dependency)) dependency += ".ts";
        if (dependency.startsWith(path.join(output, "src") + path.sep)) {
          copyShared(path.relative(output, dependency));
        }
      }
    }
  }
}
for (const name of ["app", "components", "lib"]) adapt(path.join(output, name));
cpSync(
  path.join(root, "scripts/test-dashboard.mjs"),
  path.join(output, "scripts/test-centerify-demo.mjs"),
);
const packageFile = path.join(output, "package.json");
const manifest = JSON.parse(readFileSync(packageFile, "utf8"));
const dashboard = JSON.parse(readFileSync(path.join(root, "dashboard/package.json"), "utf8"));
Object.assign(manifest.dependencies, dashboard.dependencies);
writeFileSync(packageFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared current dashboard in ${output}`);
