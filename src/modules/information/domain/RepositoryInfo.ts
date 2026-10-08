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
