import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, realpath, rename, rm, lstat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { PluginError } from "../domain/manifest.js";

export function within(root: string, path: string) {
  const value = resolve(root, path);
  const part = relative(resolve(root), value);
  if (isAbsolute(part) || part === ".." || part.startsWith(`..${sep}`))
    throw new PluginError("Plugin path escapes its allowed directory.");
  return value;
}
export async function readJson(path: string, fallback: unknown): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return fallback;
    throw error;
  }
}
export async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  const file = await open(temp, "wx", 0o600);
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + "\n");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}
export async function fileLock<T>(path: string, action: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true });
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid }));
        await handle.close();
      } catch (error) {
        await handle.close().catch(() => {});
        await rm(path, { force: true });
        throw error;
      }
      break;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST")
        throw error;
      const stat = await lstat(path).catch(() => null);
      if (!stat) continue;
      const owner = (await readJson(path, null).catch(() => null)) as { pid?: number } | null;
      if (owner?.pid && Date.now() - stat.mtimeMs > 2000) {
        let dead = false;
        try {
          process.kill(owner.pid, 0);
        } catch (probe) {
          dead = !!probe && typeof probe === "object" && "code" in probe && probe.code === "ESRCH";
        }
        if (dead) {
          await rm(path, { force: true });
          continue;
        }
      }
      if (Date.now() >= deadline) throw new PluginError("Plugin storage is busy. Retry shortly.");
      await new Promise((done) => setTimeout(done, 50));
    }
  }
  try {
    return await action();
  } finally {
    await rm(path, { force: true });
  }
}

export async function packageFiles(root: string, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new PluginError("Plugin packages cannot contain symbolic links or special files.");
    if (entry.isDirectory()) result.push(...(await packageFiles(root, name)));
    else result.push(name);
  }
  return result.sort();
}
export async function packageHash(root: string) {
  const files = await packageFiles(root);
  if (!files.length || files.length > 200)
    throw new PluginError("Plugin package must contain 1–200 files.");
  const hash = createHash("sha256");
  let bytes = 0;
  for (const name of files) {
    const data = await readFile(join(root, name));
    bytes += data.length;
    if (bytes > 20 * 1024 * 1024) throw new PluginError("Plugin package exceeds 20 MiB.");
    hash.update(name).update("\0").update(String(data.length)).update("\0").update(data);
  }
  return hash.digest("hex");
}
export async function checkedDirectory(root: string, path: string) {
  const absoluteRoot = await realpath(root);
  const absolute = await realpath(within(root, path));
  within(absoluteRoot, absolute);
  return absolute;
}
