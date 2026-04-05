import { describe, test, expect } from "bun:test";
import { loadConfig } from "../../src/config.js";
import { join } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";

describe("loadConfig", () => {
  const tmpDir = join(import.meta.dir, "../.tmp-config-test");

  test("returns default config when no config file exists", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.include).toEqual(["**/*.ts", "**/*.tsx"]);
    expect(config.exclude).toContain("node_modules");
    expect(config.maxFileSize).toBe(50000);
    expect(config.transport).toBe("stdio");
    expect(config.temporal.enabled).toBe(true);
    expect(config.knowledge.enabled).toBe(true);
    expect(config.sampling.enabled).toBe(true);
  });

  test("merges custom config with defaults", () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, "codegraph.config.json"),
      JSON.stringify({
        maxFileSize: 100000,
        temporal: { lookbackDays: 180 },
      })
    );

    const config = loadConfig(tmpDir);
    expect(config.maxFileSize).toBe(100000);
    expect(config.temporal.lookbackDays).toBe(180);
    // Defaults preserved
    expect(config.temporal.enabled).toBe(true);
    expect(config.include).toEqual(["**/*.ts", "**/*.tsx"]);

    rmSync(tmpDir, { recursive: true });
  });

  test("default architecture rules is empty array", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.architectureRules).toEqual([]);
  });

  test("default entry points is empty array", () => {
    const config = loadConfig("/nonexistent/path");
    expect(config.entryPoints).toEqual([]);
  });
});
