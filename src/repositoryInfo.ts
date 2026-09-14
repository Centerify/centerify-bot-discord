import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type PackageJson = {
  name?: string;
  version?: string;
  description?: string;
  repository?: string | { url?: string };
  homepage?: string;
};

export type RepositoryInfo = {
  name: string;
  version: string;
  description: string;
  repositoryUrl: string | null;
  branch: string | null;
  commit: string | null;
  commitSubject: string | null;
  commitDate: Date | null;
  commitCount: number | null;
};

export async function getRepositoryInfo(): Promise<RepositoryInfo> {
  const [packageJson, branch, commit, commitSubject, commitDate, commitCount] =
    await Promise.all([
      readPackageJson(),
      git(["branch", "--show-current"]),
      git(["rev-parse", "--short=12", "HEAD"]),
      git(["log", "-1", "--pretty=%s"]),
      git(["log", "-1", "--pretty=%cI"]),
      git(["rev-list", "--count", "HEAD"]),
    ]);

  const repositoryUrl =
    normalizeRepositoryUrl(getPackageRepositoryUrl(packageJson)) ??
    normalizeRepositoryUrl(await git(["remote", "get-url", "origin"]));

  return {
    name: packageJson.name ?? "Unknown project",
    version: packageJson.version ?? "0.0.0",
    description: packageJson.description ?? "No description available.",
    repositoryUrl,
    branch: branch || null,
    commit: commit || null,
    commitSubject: commitSubject || null,
    commitDate: commitDate ? new Date(commitDate) : null,
    commitCount: commitCount ? Number.parseInt(commitCount, 10) : null,
  };
}

async function readPackageJson(): Promise<PackageJson> {
  const packageJsonPath = join(process.cwd(), "package.json");
  const rawPackageJson = await readFile(packageJsonPath, "utf8");

  return JSON.parse(rawPackageJson) as PackageJson;
}

async function git(args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: process.cwd(),
      timeout: 2_000,
    });

    return stdout.trim();
  } catch {
    return null;
  }
}

function getPackageRepositoryUrl(packageJson: PackageJson) {
  if (typeof packageJson.repository === "string") {
    return packageJson.repository;
  }

  return packageJson.repository?.url ?? packageJson.homepage ?? null;
}

function normalizeRepositoryUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  return url
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/#readme$/, "");
}
