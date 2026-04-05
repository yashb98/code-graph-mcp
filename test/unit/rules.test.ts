import { describe, test, expect } from "bun:test";
import { GraphStore } from "../../src/graph/graph-store.js";
import { checkRules } from "../../src/graph/rules.js";
import type { ArchitectureRule } from "../../src/types.js";

describe("Architecture Rules", () => {
  test("dependency rule: detects forbidden dependency", () => {
    const store = new GraphStore();
    store.addFileNode("src/ui/button.ts", { loc: 10 });
    store.addFileNode("src/db/connection.ts", { loc: 10 });
    store.addEdge("src/ui/button.ts", "src/db/connection.ts", "runtime_import");

    const rules: ArchitectureRule[] = [{
      id: "no-ui-to-db",
      name: "UI must not access DB directly",
      description: "",
      type: "dependency",
      rule: { source: "src/ui/**", target: "src/db/**", allow: false },
      severity: "error",
    }];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(1);
    expect(violations[0].ruleId).toBe("no-ui-to-db");
    expect(violations[0].severity).toBe("error");
  });

  test("dependency rule: allows valid dependency", () => {
    const store = new GraphStore();
    store.addFileNode("src/ui/button.ts", { loc: 10 });
    store.addFileNode("src/services/api.ts", { loc: 10 });
    store.addEdge("src/ui/button.ts", "src/services/api.ts", "runtime_import");

    const rules: ArchitectureRule[] = [{
      id: "no-ui-to-db",
      name: "UI must not access DB directly",
      description: "",
      type: "dependency",
      rule: { source: "src/ui/**", target: "src/db/**", allow: false },
      severity: "error",
    }];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(0);
  });

  test("layer rule: detects upward dependency", () => {
    const store = new GraphStore();
    store.addFileNode("src/ui/page.ts", { loc: 10 });
    store.addFileNode("src/services/api.ts", { loc: 10 });
    store.addFileNode("src/db/query.ts", { loc: 10 });

    // Valid: UI -> services
    store.addEdge("src/ui/page.ts", "src/services/api.ts", "runtime_import");
    // Valid: services -> db
    store.addEdge("src/services/api.ts", "src/db/query.ts", "runtime_import");
    // INVALID: db -> ui (upward)
    store.addEdge("src/db/query.ts", "src/ui/page.ts", "runtime_import");

    const rules: ArchitectureRule[] = [{
      id: "layer-order",
      name: "Enforce UI > Services > DB layering",
      description: "",
      type: "layer",
      rule: {
        layers: [
          ["src/ui/**"],      // layer 0 (top)
          ["src/services/**"], // layer 1
          ["src/db/**"],       // layer 2 (bottom)
        ],
      },
      severity: "error",
    }];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(1);
    expect(violations[0].source).toBe("src/db/query.ts");
    expect(violations[0].target).toBe("src/ui/page.ts");
  });

  test("layer rule: no violations for valid layering", () => {
    const store = new GraphStore();
    store.addFileNode("src/ui/page.ts", { loc: 10 });
    store.addFileNode("src/services/api.ts", { loc: 10 });
    store.addEdge("src/ui/page.ts", "src/services/api.ts", "runtime_import");

    const rules: ArchitectureRule[] = [{
      id: "layer-order",
      name: "Enforce layering",
      description: "",
      type: "layer",
      rule: { layers: [["src/ui/**"], ["src/services/**"]] },
      severity: "warning",
    }];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(0);
  });

  test("boundary rule: detects excessive external deps", () => {
    const store = new GraphStore();
    store.addFileNode("src/auth/login.ts", { loc: 10 });
    store.addFileNode("src/auth/session.ts", { loc: 10 });
    store.addFileNode("src/external/api.ts", { loc: 10 });
    store.addFileNode("src/external/db.ts", { loc: 10 });
    store.addFileNode("src/external/cache.ts", { loc: 10 });
    store.addEdge("src/auth/login.ts", "src/external/api.ts", "runtime_import");
    store.addEdge("src/auth/login.ts", "src/external/db.ts", "runtime_import");
    store.addEdge("src/auth/session.ts", "src/external/cache.ts", "runtime_import");

    const rules: ArchitectureRule[] = [{
      id: "auth-boundary",
      name: "Auth module max 2 external deps",
      description: "",
      type: "boundary",
      rule: { community: "src/auth/**", maxExternalDeps: 2 },
      severity: "warning",
    }];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(1);
    expect(violations[0].message).toContain("3 external dependencies");
  });

  test("boundary rule: passes within limit", () => {
    const store = new GraphStore();
    store.addFileNode("src/auth/login.ts", { loc: 10 });
    store.addFileNode("src/external/api.ts", { loc: 10 });
    store.addEdge("src/auth/login.ts", "src/external/api.ts", "runtime_import");

    const rules: ArchitectureRule[] = [{
      id: "auth-boundary",
      name: "Auth module max 2 external deps",
      description: "",
      type: "boundary",
      rule: { community: "src/auth/**", maxExternalDeps: 2 },
      severity: "warning",
    }];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(0);
  });

  test("multiple rules checked together", () => {
    const store = new GraphStore();
    store.addFileNode("src/ui/page.ts", { loc: 10 });
    store.addFileNode("src/db/query.ts", { loc: 10 });
    store.addEdge("src/ui/page.ts", "src/db/query.ts", "runtime_import");

    const rules: ArchitectureRule[] = [
      {
        id: "no-ui-to-db",
        name: "No UI to DB",
        description: "",
        type: "dependency",
        rule: { source: "src/ui/**", target: "src/db/**", allow: false },
        severity: "error",
      },
      {
        id: "layer-order",
        name: "Layers",
        description: "",
        type: "layer",
        rule: { layers: [["src/ui/**"], ["src/services/**"], ["src/db/**"]] },
        severity: "warning",
      },
    ];

    const violations = checkRules(store, rules);
    expect(violations.length).toBe(1); // dependency rule catches it; layer rule valid (UI->DB is downward)
  });

  test("empty rules return no violations", () => {
    const store = new GraphStore();
    store.addFileNode("a.ts", { loc: 10 });
    expect(checkRules(store, [])).toEqual([]);
  });
});
