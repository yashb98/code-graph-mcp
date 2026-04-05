import { describe, test, expect } from "bun:test";
import { GraphBuilder } from "../../src/graph/builder.js";
import { join } from "path";

const FIXTURE_ROOT = join(import.meta.dir, "../fixtures/full-project");

describe("GraphBuilder", () => {
  test("builds graph from fixture project", async () => {
    const builder = new GraphBuilder(FIXTURE_ROOT, {
      include: ["src/**/*.ts"],
      exclude: [],
      maxFileSize: 50000,
    });

    const result = await builder.build();

    expect(result.filesParsed).toBeGreaterThanOrEqual(5);
    expect(result.errors.length).toBe(0);
    expect(result.store.nodeCount).toBeGreaterThan(5);
    expect(result.timeMs).toBeGreaterThan(0);
  });

  test("creates import edges between files", async () => {
    const builder = new GraphBuilder(FIXTURE_ROOT, {
      include: ["src/**/*.ts"],
      exclude: [],
      maxFileSize: 50000,
    });

    const result = await builder.build();
    const store = result.store;

    // index.ts imports user-service and logger
    const indexDeps = store.getDependencies("src/index.ts");
    expect(indexDeps).toContain("src/services/user-service.ts");
    expect(indexDeps).toContain("src/utils/logger.ts");

    // user-service imports logger and types
    const serviceDeps = store.getDependencies("src/services/user-service.ts");
    expect(serviceDeps).toContain("src/utils/logger.ts");
    expect(serviceDeps).toContain("src/types.ts");
  });

  test("detects orphan files", async () => {
    const builder = new GraphBuilder(FIXTURE_ROOT, {
      include: ["src/**/*.ts"],
      exclude: [],
      maxFileSize: 50000,
    });

    const result = await builder.build();
    const orphans = result.store.getOrphanFiles(new Set(["src/index.ts"]));

    expect(orphans).toContain("src/unused.ts");
    expect(orphans).not.toContain("src/utils/logger.ts");
  });

  test("respects exclude patterns", async () => {
    const builder = new GraphBuilder(FIXTURE_ROOT, {
      include: ["src/**/*.ts"],
      exclude: ["unused"],
      maxFileSize: 50000,
    });

    const result = await builder.build();
    expect(result.store.getNode("src/unused.ts")).toBeUndefined();
    expect(result.filesParsed).toBe(4);
  });

  test("tracks file and symbol counts separately", async () => {
    const builder = new GraphBuilder(FIXTURE_ROOT, {
      include: ["src/**/*.ts"],
      exclude: [],
      maxFileSize: 50000,
    });

    const result = await builder.build();
    const stats = result.store.getStats();

    expect(stats.fileCount).toBe(5);
    expect(stats.symbolCount).toBeGreaterThan(0);
    expect(stats.nodeCount).toBe(stats.fileCount + stats.symbolCount);
  });

  test("handles nonexistent directory gracefully", async () => {
    const builder = new GraphBuilder("/nonexistent/path", {
      include: ["src/**/*.ts"],
      exclude: [],
      maxFileSize: 50000,
    });

    const result = await builder.build();
    expect(result.filesParsed).toBe(0);
  });
});
