import { Glob } from "bun";
import type { ArchitectureRule } from "../types.js";
import type { GraphStore } from "./graph-store.js";

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: "error" | "warning" | "info";
  message: string;
  source: string;
  target?: string;
}

export function checkRules(store: GraphStore, rules: ArchitectureRule[]): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case "dependency":
        violations.push(...checkDependencyRule(store, rule));
        break;
      case "layer":
        violations.push(...checkLayerRule(store, rule));
        break;
      case "boundary":
        violations.push(...checkBoundaryRule(store, rule));
        break;
    }
  }

  return violations;
}

function matchesGlob(path: string, pattern: string): boolean {
  return new Glob(pattern).match(path);
}

function checkDependencyRule(store: GraphStore, rule: ArchitectureRule): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { source, target, allow } = rule.rule;

  if (!source || !target) return violations;

  store.forEachEdge((_, attrs, edgeSource, edgeTarget) => {
    const sourceMatches = matchesGlob(edgeSource, source);
    const targetMatches = matchesGlob(edgeTarget, target);

    if (sourceMatches && targetMatches) {
      if (allow === false) {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `${edgeSource} depends on ${edgeTarget} — violates "${rule.name}"`,
          source: edgeSource,
          target: edgeTarget,
        });
      }
    }
  });

  return violations;
}

function checkLayerRule(store: GraphStore, rule: ArchitectureRule): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const layers = rule.rule.layers;

  if (!layers || layers.length < 2) return violations;

  // layers[i] can only depend on layers[j] where j > i (lower layers)
  // E.g., [["src/ui/**"], ["src/services/**"], ["src/db/**"]]
  // UI can depend on services and db; services on db; db on nothing above

  store.forEachEdge((_, attrs, source, target) => {
    const sourceLayerIndex = findLayerIndex(source, layers);
    const targetLayerIndex = findLayerIndex(target, layers);

    if (sourceLayerIndex === -1 || targetLayerIndex === -1) return;

    // Violation: depending on a layer ABOVE you (lower index = higher layer)
    if (targetLayerIndex < sourceLayerIndex) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: `${source} (layer ${sourceLayerIndex}) depends on ${target} (layer ${targetLayerIndex}) — upward dependency violates layer rule`,
        source,
        target,
      });
    }
  });

  return violations;
}

function findLayerIndex(path: string, layers: string[][]): number {
  for (let i = 0; i < layers.length; i++) {
    for (const pattern of layers[i]) {
      if (matchesGlob(path, pattern)) return i;
    }
  }
  return -1;
}

function checkBoundaryRule(store: GraphStore, rule: ArchitectureRule): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const { community, maxExternalDeps } = rule.rule;

  if (!community || maxExternalDeps === undefined) return violations;

  // Count external dependencies for nodes in the specified community pattern
  const communityNodes: string[] = [];
  store.forEachNode((id, attrs) => {
    if (attrs.kind === "file" && matchesGlob(id, community)) {
      communityNodes.push(id);
    }
  });

  const communitySet = new Set(communityNodes);
  let externalDeps = 0;

  for (const node of communityNodes) {
    for (const dep of store.getDependencies(node)) {
      if (!communitySet.has(dep)) {
        externalDeps++;
      }
    }
  }

  if (externalDeps > maxExternalDeps) {
    violations.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `Community "${community}" has ${externalDeps} external dependencies (max: ${maxExternalDeps})`,
      source: community,
    });
  }

  return violations;
}
