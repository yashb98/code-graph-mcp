import type { CodeGraphConfig } from "./types.js";
import { existsSync } from "fs";
import { join } from "path";

const DEFAULT_CONFIG: CodeGraphConfig = {
  include: ["**/*.ts", "**/*.tsx"],
  exclude: ["node_modules", "dist", "**/*.d.ts", "**/*.generated.ts"],
  maxFileSize: 50000,
  tsconfigPath: "./tsconfig.json",
  entryPoints: [],
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  lazyTsc: true,
  tscIdleTimeoutMs: 300000,
  tscMemoryLimitMb: 2048,
  watchDebounceMs: 300,
  barrelCollapseThreshold: 0.8,
  hubDegreeMultiplier: 2,
  godFileExportThreshold: 50,
  maxCallChainDepth: 10,
  cloneSimilarityThreshold: 1.0,
  transport: "stdio",
  temporal: {
    enabled: true,
    lookbackDays: 90,
    snapshotInterval: "weekly",
    excludeAuthors: ["dependabot[bot]", "renovate[bot]"],
    bugFixPatterns: ["fix", "bug", "patch", "error", "crash", "hotfix", "resolve", "closes #"],
  },
  knowledge: {
    enabled: true,
    decayHalfLifeDays: 90,
    siloThreshold: 0.8,
    minBusFactor: 2,
  },
  architectureRules: [],
  sampling: {
    enabled: true,
    costPriority: 0.3,
    speedPriority: 0.5,
    intelligencePriority: 0.8,
    maxTokens: 2000,
  },
};

export function loadConfig(repoRoot: string): CodeGraphConfig {
  const configPath = join(repoRoot, "codegraph.config.json");
  if (existsSync(configPath)) {
    const raw = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      temporal: { ...DEFAULT_CONFIG.temporal, ...raw.temporal },
      knowledge: { ...DEFAULT_CONFIG.knowledge, ...raw.knowledge },
      sampling: { ...DEFAULT_CONFIG.sampling, ...raw.sampling },
    };
  }
  return { ...DEFAULT_CONFIG };
}
