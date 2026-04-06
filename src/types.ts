// ============================================================
// Node types
// ============================================================

export type NodeKind =
  | "file"
  | "function"
  | "class"
  | "interface"
  | "type_alias"
  | "variable"
  | "enum"
  | "component"
  | "test"
  | "entry_point";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  name: string;
  filePath: string;
  line: number;
  column: number;
  exported: boolean;
  deprecated: boolean;
  hasAnyType: boolean;
  loc: number;
  contentHash: string;
  churnCount?: number;
  lastModified?: string;
  codeAge?: number;
  primaryAuthor?: string;
  authorCount?: number;
  knowledgeScore?: number;
}

// ============================================================
// Edge types
// ============================================================

export type EdgeKind =
  | "runtime_import"
  | "type_import"
  | "dynamic_import"
  | "asset_import"
  | "re_export"
  | "calls"
  | "jsx_renders"
  | "extends"
  | "implements"
  | "tests"
  | "unresolved"
  | "co_changes";

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  weight: number;
  typeResolved: boolean;
}

// ============================================================
// Config
// ============================================================

export interface CodeGraphConfig {
  include: string[];
  exclude: string[];
  maxFileSize: number;
  tsconfigPath: string;
  entryPoints: string[];
  embeddingModel: string;
  lazyTsc: boolean;
  tscIdleTimeoutMs: number;
  tscMemoryLimitMb: number;
  watchDebounceMs: number;
  barrelCollapseThreshold: number;
  hubDegreeMultiplier: number;
  godFileExportThreshold: number;
  maxCallChainDepth: number;
  cloneSimilarityThreshold: number;
  transport: "stdio" | "streamable-http";
  temporal: {
    enabled: boolean;
    lookbackDays: number;
    snapshotInterval: "daily" | "weekly" | "per-commit";
    excludeAuthors: string[];
    bugFixPatterns: string[];
  };
  knowledge: {
    enabled: boolean;
    decayHalfLifeDays: number;
    siloThreshold: number;
    minBusFactor: number;
  };
  architectureRules: ArchitectureRule[];
  sampling: {
    enabled: boolean;
    costPriority: number;
    speedPriority: number;
    intelligencePriority: number;
    maxTokens: number;
  };
}

export interface ArchitectureRule {
  id: string;
  name: string;
  description: string;
  type: "dependency" | "layer" | "boundary" | "naming" | "custom";
  rule: {
    source?: string;
    target?: string;
    allow?: boolean;
    layers?: string[][];
    community?: string;
    maxExternalDeps?: number;
    cypher?: string;
  };
  severity: "error" | "warning" | "info";
  baseline?: number;
}

// ============================================================
// Verbosity
// ============================================================

export type Verbosity = "minimal" | "normal" | "detailed";

// ============================================================
// Analysis results
// ============================================================

export interface HealthReport {
  score: number;
  grade: string;
  baselineComparison?: {
    baselineScore: number;
    baselineDate: string;
    delta: string;
    newIssues: number;
    resolvedIssues: number;
  };
  breakdown: Record<string, CategoryScore>;
  top_issues: Issue[];
  predictions: Prediction[];
}

export interface CategoryScore {
  score: number;
  weight: number;
  trend: "improving" | "stable" | "declining";
  [key: string]: unknown;
}

export interface Issue {
  severity: "high" | "medium" | "low";
  message: string;
  tool: string;
  new: boolean;
}

export interface Prediction {
  type: "maintenance_forecast" | "change_prediction" | "defect_risk";
  message: string;
  confidence: number;
}

export interface GraphSnapshot {
  timestamp: string;
  commitHash: string;
  totalNodes: number;
  totalEdges: number;
  healthScore: number;
  categoryScores: Record<string, number>;
  hotspots: string[];
  orphanCount: number;
  cycleCount: number;
}

// ============================================================
// Type Analyzer interface (pluggable for Corsa)
// ============================================================

export interface TypeAnalyzer {
  init(tsconfigPath: string): Promise<void>;
  dispose(): Promise<void>;
  isInitialized(): boolean;
  getCallGraph(symbol: string, direction: "callers" | "callees" | "both", depth: number): Promise<CallGraphResult>;
  resolveSymbol(name: string, fileContext?: string): Promise<SymbolResolution>;
  getTypeInfo(nodeId: string): Promise<TypeInfo>;
  isAnyType(nodeId: string): Promise<boolean>;
  getHierarchy(symbol: string): Promise<HierarchyResult>;
  getBreakingChanges(oldRef: string, newRef: string): Promise<BreakingChange[]>;
}

export interface CallGraphResult {
  root: string;
  edges: Array<{ caller: string; callee: string; line: number }>;
}

export interface SymbolResolution {
  name: string;
  filePath: string;
  line: number;
  column: number;
  typeSignature: string;
  references: Array<{ filePath: string; line: number }>;
}

export interface TypeInfo {
  typeString: string;
  isAny: boolean;
  isGeneric: boolean;
  parameters: Array<{ name: string; type: string }>;
  returnType?: string;
}

export interface HierarchyResult {
  symbol: string;
  extends: string[];
  implements: string[];
  extendedBy: string[];
  implementedBy: string[];
}

export interface BreakingChange {
  symbol: string;
  filePath: string;
  changeType: "removed" | "signature_changed" | "type_changed";
  affectedCallers: number;
  details: string;
}
