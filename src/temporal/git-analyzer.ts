import simpleGit, { type SimpleGit } from "simple-git";

export interface FileChurn {
  filePath: string;
  commits: number;
  additions: number;
  deletions: number;
}

export interface FileAuthor {
  filePath: string;
  authors: Array<{ name: string; email: string; lines: number; percentage: number }>;
  primaryAuthor: string;
  authorCount: number;
}

export interface CoChange {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  totalCommits: number;
  strength: number;
}

export class GitAnalyzer {
  private git: SimpleGit;
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.git = simpleGit(repoRoot);
  }

  async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(["--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  async getFileChurn(lookbackDays: number, excludeAuthors: string[] = []): Promise<FileChurn[]> {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().split("T")[0];

    // Use raw git log with numstat for reliable parsing
    const raw = await this.git.raw([
      "log", `--since=${since}`, "--numstat", "--format=COMMIT:%H:%an",
    ]);

    const churnMap = new Map<string, FileChurn>();
    let currentAuthor = "";

    for (const line of raw.split("\n")) {
      if (line.startsWith("COMMIT:")) {
        const parts = line.split(":");
        currentAuthor = parts.slice(2).join(":");
        continue;
      }

      if (excludeAuthors.some((a) => currentAuthor.includes(a))) continue;

      // numstat lines: "additions\tdeletions\tfilepath"
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) continue;

      const filePath = match[3];
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) continue;

      const additions = match[1] === "-" ? 0 : Number(match[1]);
      const deletions = match[2] === "-" ? 0 : Number(match[2]);

      const existing = churnMap.get(filePath) ?? { filePath, commits: 0, additions: 0, deletions: 0 };
      existing.commits++;
      existing.additions += additions;
      existing.deletions += deletions;
      churnMap.set(filePath, existing);
    }

    return [...churnMap.values()].sort((a, b) => b.commits - a.commits);
  }

  async getFileAuthors(filePath: string): Promise<FileAuthor | null> {
    try {
      const blame = await this.git.raw(["blame", "--line-porcelain", filePath]);
      const authorLines = new Map<string, { name: string; email: string; lines: number }>();

      let currentAuthor = "";
      let currentEmail = "";
      for (const line of blame.split("\n")) {
        if (line.startsWith("author ")) {
          currentAuthor = line.slice(7);
        } else if (line.startsWith("author-mail ")) {
          currentEmail = line.slice(12).replace(/[<>]/g, "");
        } else if (line.startsWith("\t")) {
          const key = `${currentAuthor} <${currentEmail}>`;
          const existing = authorLines.get(key) ?? { name: currentAuthor, email: currentEmail, lines: 0 };
          existing.lines++;
          authorLines.set(key, existing);
        }
      }

      if (authorLines.size === 0) return null;

      const totalLines = [...authorLines.values()].reduce((sum, a) => sum + a.lines, 0);
      const authors = [...authorLines.values()]
        .map((a) => ({ ...a, percentage: Math.round((a.lines / totalLines) * 100) }))
        .sort((a, b) => b.lines - a.lines);

      return {
        filePath,
        authors,
        primaryAuthor: authors[0].name,
        authorCount: authors.length,
      };
    } catch {
      return null;
    }
  }

  async getBugFixCommits(lookbackDays: number, patterns: string[]): Promise<string[]> {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().split("T")[0];

    const log = await this.git.log({ "--since": since });
    const bugFixes: string[] = [];

    for (const commit of log.all) {
      const msg = commit.message.toLowerCase();
      if (patterns.some((p) => msg.includes(p.toLowerCase()))) {
        bugFixes.push(commit.hash);
      }
    }

    return bugFixes;
  }

  async getCoChanges(lookbackDays: number, minCoChanges: number = 3): Promise<CoChange[]> {
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().split("T")[0];

    const raw = await this.git.raw([
      "log", `--since=${since}`, "--numstat", "--format=COMMIT:%H",
    ]);

    const fileCommits = new Map<string, Set<string>>();
    const commitFiles = new Map<string, string[]>();
    let currentHash = "";

    for (const line of raw.split("\n")) {
      if (line.startsWith("COMMIT:")) {
        currentHash = line.slice(7);
        continue;
      }

      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match || !currentHash) continue;

      const filePath = match[3];
      if (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) continue;

      const commitSet = fileCommits.get(filePath) ?? new Set();
      commitSet.add(currentHash);
      fileCommits.set(filePath, commitSet);

      const files = commitFiles.get(currentHash) ?? [];
      files.push(filePath);
      commitFiles.set(currentHash, files);
    }

    const coChangePairs = new Map<string, number>();
    for (const [, files] of commitFiles) {
      const unique = [...new Set(files)];
      for (let i = 0; i < unique.length; i++) {
        for (let j = i + 1; j < unique.length; j++) {
          const key = [unique[i], unique[j]].sort().join("||");
          coChangePairs.set(key, (coChangePairs.get(key) ?? 0) + 1);
        }
      }
    }

    const results: CoChange[] = [];
    for (const [key, count] of coChangePairs) {
      if (count < minCoChanges) continue;
      const [fileA, fileB] = key.split("||");
      const commitsA = fileCommits.get(fileA)?.size ?? 0;
      const commitsB = fileCommits.get(fileB)?.size ?? 0;
      const strength = count / Math.min(commitsA, commitsB);

      results.push({
        fileA,
        fileB,
        coChangeCount: count,
        totalCommits: Math.max(commitsA, commitsB),
        strength: Math.round(strength * 100) / 100,
      });
    }

    return results.sort((a, b) => b.strength - a.strength);
  }
}
