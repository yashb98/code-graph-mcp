import type { CodeGraphConfig } from "./types.js";
import { existsSync } from "fs";
import { join } from "path";
import { logger } from "./logger.js";

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

export function validateConfig(config: CodeGraphConfig): string[] {
  const warnings: string[] = [];
  if (config.include.length === 0) warnings.push("include patterns empty — no files will be scanned");
  if (config.maxFileSize < 1000) warnings.push(`maxFileSize (${config.maxFileSize}) is very low`);
  if (config.maxFileSize > 500000) warnings.push(`maxFileSize (${config.maxFileSize}) is very high — may cause slow parsing`);
  if (config.hubDegreeMultiplier < 1) warnings.push("hubDegreeMultiplier < 1 will flag most nodes as hubs");
  if (config.temporal.lookbackDays < 1) warnings.push("temporal.lookbackDays < 1 — no git history will be analyzed");
  if (config.knowledge.siloThreshold < 0 || config.knowledge.siloThreshold > 1) {
    warnings.push(`knowledge.siloThreshold (${config.knowledge.siloThreshold}) should be between 0 and 1`);
  }
  return warnings;
}

export function loadConfig(repoRoot: string): CodeGraphConfig {
  const configPath = join(repoRoot, "codegraph.config.json");
  let config: CodeGraphConfig;

  if (existsSync(configPath)) {
    logger.info("Loading config", { path: configPath });
    const raw = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
    config = {
      ...DEFAULT_CONFIG,
      ...raw,
      temporal: { ...DEFAULT_CONFIG.temporal, ...raw.temporal },
      knowledge: { ...DEFAULT_CONFIG.knowledge, ...raw.knowledge },
      sampling: { ...DEFAULT_CONFIG.sampling, ...raw.sampling },
    };
  } else {
    logger.info("No codegraph.config.json found, using defaults", { repoRoot });
    config = { ...DEFAULT_CONFIG };
  }

  const warnings = validateConfig(config);
  for (const w of warnings) {
    logger.warn(`Config: ${w}`);
  }

  return config;
}
