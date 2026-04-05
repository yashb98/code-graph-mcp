import { describe, test, expect } from "bun:test";
import { GitAnalyzer } from "../../src/temporal/git-analyzer.js";
import { join } from "path";

// These tests run against the code-graph-mcp repo itself (which is a git repo)
const REPO_ROOT = join(import.meta.dir, "../..");

describe("GitAnalyzer", () => {
  const analyzer = new GitAnalyzer(REPO_ROOT);

  test("detects git repo", async () => {
    expect(await analyzer.isGitRepo()).toBe(true);
  });

  test("detects non-git directory", async () => {
    const nonGit = new GitAnalyzer("/tmp");
    expect(await nonGit.isGitRepo()).toBe(false);
  });

  test("gets file churn", async () => {
    const churn = await analyzer.getFileChurn(365);
    expect(churn.length).toBeGreaterThan(0);
    expect(churn[0].filePath).toBeDefined();
    expect(churn[0].commits).toBeGreaterThan(0);
  });

  test("gets file authors via blame", async () => {
    const result = await analyzer.getFileAuthors("src/types.ts");
    expect(result).not.toBeNull();
    expect(result!.primaryAuthor).toBeDefined();
    expect(result!.authorCount).toBeGreaterThanOrEqual(1);
    expect(result!.authors[0].lines).toBeGreaterThan(0);
  });

  test("returns null for nonexistent file blame", async () => {
    const result = await analyzer.getFileAuthors("nonexistent-file.ts");
    expect(result).toBeNull();
  });

  test("gets bug fix commits", async () => {
    // We may not have bug fixes, but the function should work
    const bugFixes = await analyzer.getBugFixCommits(365, ["fix", "bug"]);
    expect(Array.isArray(bugFixes)).toBe(true);
  });

  test("gets co-changes", async () => {
    // With minCoChanges=1 we should find some pairs
    const coChanges = await analyzer.getCoChanges(365, 1);
    expect(Array.isArray(coChanges)).toBe(true);
    if (coChanges.length > 0) {
      expect(coChanges[0].fileA).toBeDefined();
      expect(coChanges[0].fileB).toBeDefined();
      expect(coChanges[0].strength).toBeGreaterThan(0);
    }
  });

  test("churn excludes specified authors", async () => {
    const churnAll = await analyzer.getFileChurn(365);
    const churnExcluded = await analyzer.getFileChurn(365, ["this-author-does-not-exist-xyz"]);
    // Excluding a nonexistent author shouldn't change results
    expect(churnExcluded.length).toBe(churnAll.length);
  });
});
