import { describe, test, expect, beforeAll } from "bun:test";
import { loadConfig } from "../../src/config.js";
import {
  createToolContext,
  buildGraph,
  resolveTypeHandler,
  getCallGraphHandler,
  getHierarchyHandler,
} from "../../src/mcp/tools.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/typed-project");

describe("Type Resolution Integration", () => {
  const config = loadConfig(FIXTURE_ROOT);
  config.include = ["src/**/*.ts"];
  config.exclude = [];
  config.entryPoints = ["src/index.ts"];
  config.tsconfigPath = "./tsconfig.json";
  const ctx = createToolContext(config, FIXTURE_ROOT);

  beforeAll(async () => {
    await buildGraph(ctx);
  });

  test("resolve_type returns type info for a symbol", async () => {
    const result = await resolveTypeHandler(ctx, "src/base.ts::createId");
    expect(result.symbol).toBe("src/base.ts::createId");
    expect(result.type).toBeDefined();
    expect(result.type.typeString).toContain("createId");
    expect(result.type.isAny).toBe(false);
  });

  test("resolve_type returns file-level symbols", async () => {
    const result = await resolveTypeHandler(ctx, "src/base.ts");
    expect(result.file).toBe("src/base.ts");
    expect(result.symbols.length).toBeGreaterThan(0);
    expect(typeof result.anyCount).toBe("number");
  });

  test("get_call_graph returns edges", async () => {
    const result = await getCallGraphHandler(ctx, "src/base.ts::createId", "callers");
    expect(result.root).toBe("src/base.ts::createId");
    expect(result.direction).toBe("callers");
    expect(typeof result.totalEdges).toBe("number");
  });

  test("get_hierarchy returns extends/implements", async () => {
    const result = await getHierarchyHandler(ctx, "src/user.ts::User");
    expect(result.symbol).toBe("src/user.ts::User");
    expect(result.extends).toContain("BaseModel");
  });

  test("resolve_type with verbosity minimal truncates references", async () => {
    const result = await resolveTypeHandler(ctx, "src/base.ts::createId", "minimal");
    expect(result.references.length).toBeLessThanOrEqual(5);
  });
});
