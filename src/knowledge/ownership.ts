import type { FileAuthor } from "../temporal/git-analyzer.js";

export interface FileOwnership {
  filePath: string;
  primaryAuthor: string;
  authorCount: number;
  knowledgeScore: number; // 0-1, based on Shannon entropy
  isSilo: boolean;        // true if one author owns > siloThreshold
}

/**
 * Compute ownership metrics from blame data.
 * knowledgeScore uses Shannon entropy — higher = more distributed knowledge.
 * A score of 0 means single author (silo risk), 1 means perfectly distributed.
 */
export function computeOwnership(
  authorData: FileAuthor,
  siloThreshold: number = 0.8,
): FileOwnership {
  const totalLines = authorData.authors.reduce((sum, a) => sum + a.lines, 0);
  if (totalLines === 0) {
    return {
      filePath: authorData.filePath,
      primaryAuthor: "unknown",
      authorCount: 0,
      knowledgeScore: 0,
      isSilo: true,
    };
  }

  // Shannon entropy
  let entropy = 0;
  for (const author of authorData.authors) {
    const p = author.lines / totalLines;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize to 0-1 range (max entropy = log2(authorCount))
  const maxEntropy = authorData.authorCount > 1 ? Math.log2(authorData.authorCount) : 1;
  const knowledgeScore = Math.round((entropy / maxEntropy) * 100) / 100;

  const topAuthorPercentage = authorData.authors[0].percentage / 100;
  const isSilo = topAuthorPercentage >= siloThreshold;

  return {
    filePath: authorData.filePath,
    primaryAuthor: authorData.primaryAuthor,
    authorCount: authorData.authorCount,
    knowledgeScore,
    isSilo,
  };
}
