import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../src/", import.meta.url));
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sources(path) : Promise.resolve(entry.name.endsWith(".ts") ? [path] : []);
  }))).flat();
}

test("dependency boundaries, public APIs and import graph remain valid", async () => {
  const graph = new Map<string, string[]>();
  const violations: string[] = [];
  for (const file of await sources(root)) {
    const name = relative(root, file);
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    const imports: string[] = [];
    const visit = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    graph.set(file, []);
    for (const specifier of imports) {
      const target = specifier.startsWith(".") ? resolve(dirname(file), specifier.replace(/\.js$/, ".ts")) : undefined;
      const path = target ? relative(root, target) : specifier;
      if (target) graph.get(file)!.push(target);
      const fail = (reason: string) => violations.push(`${name} -> ${path}: ${reason}`);
      if (name.startsWith("core/") && (!target || !path.startsWith("core/"))) fail("Core must be independent");
      const owner = name.match(/^modules\/([^/]+)\//)?.[1];
      const other = path.match(/^modules\/([^/]+)\/(.+)$/);
      if (owner && other && owner !== other[1] && !["index.ts", "discord/index.ts"].includes(other[2]!)) fail("private cross-module import");
      if (/^modules\/[^/]+\/(application|domain)\//.test(name) && /(^adapters\/|\/discord\/|\/infrastructure\/|^discord\.js$|^@sapphire\/|^@prisma\/|^pino$)/.test(path)) fail("business code depends on infrastructure");
      if ((name.includes("/discord/") || name.startsWith("commands/") || name.startsWith("listeners/")) && /prisma|\/infrastructure\//i.test(path)) fail("presentation depends on persistence");
      if (/^modules\/[^/]+\/index\.ts$/.test(name) && /\/discord\/|\/infrastructure\/|^adapters\//.test(path)) fail("public business API loads infrastructure");
    }
  }
  const visited = new Set<string>();
  const visiting: string[] = [];
  const visit = (file: string) => {
    if (visiting.includes(file)) { violations.push(`Circular import: ${[...visiting.slice(visiting.indexOf(file)), file].map((path) => relative(root, path)).join(" -> ")}`); return; }
    if (visited.has(file)) return;
    visiting.push(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    visiting.pop();
    visited.add(file);
  };
  for (const file of graph.keys()) visit(file);
  expect(violations).toEqual([]);
});

test("feature entrypoints live exclusively inside modules", async () => {
  const directories = await readdir(root);
  for (const legacy of ["commands", "listeners", "preconditions", "services", "lib"]) {
    expect(directories).not.toContain(legacy);
  }
});
