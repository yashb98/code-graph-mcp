import type { FileOwnership } from "./ownership.js";

export interface BusFactorResult {
  communityId: number;
  busFactor: number;
  files: string[];
  authorContributions: Array<{ author: string; filesOwned: number; percentage: number }>;
  risk: "low" | "medium" | "high";
}

/**
 * Compute bus factor per community.
 * Bus factor = minimum number of developers who need to leave
 * before 50% of the community's knowledge is lost.
 */
export function computeBusFactor(
  communityId: number,
  fileOwnerships: FileOwnership[],
  minBusFactor: number = 2,
): BusFactorResult {
  if (fileOwnerships.length === 0) {
    return {
      communityId,
      busFactor: 0,
      files: [],
      authorContributions: [],
      risk: "high",
    };
  }

  // Count files per author
  const authorFileCount = new Map<string, number>();
  for (const ownership of fileOwnerships) {
    const count = authorFileCount.get(ownership.primaryAuthor) ?? 0;
    authorFileCount.set(ownership.primaryAuthor, count + 1);
  }

  // Sort authors by contribution (most files first)
  const totalFiles = fileOwnerships.length;
  const sortedAuthors = [...authorFileCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([author, filesOwned]) => ({
      author,
      filesOwned,
      percentage: Math.round((filesOwned / totalFiles) * 100),
    }));

  // Bus factor = how many top authors cover >= 50% of files
  let busFactor = 0;
  let coveredFiles = 0;
  for (const author of sortedAuthors) {
    busFactor++;
    coveredFiles += author.filesOwned;
    if (coveredFiles / totalFiles >= 0.5) break;
  }

  const risk = busFactor < minBusFactor ? "high" : busFactor < minBusFactor * 2 ? "medium" : "low";

  return {
    communityId,
    busFactor,
    files: fileOwnerships.map((f) => f.filePath),
    authorContributions: sortedAuthors,
    risk,
  };
}
