import { describe, test, expect } from "bun:test";
import { validateConfig, loadConfig } from "../../src/config.js";
import type { CodeGraphConfig } from "../../src/types.js";
import { join } from "path";

describe("validateConfig", () => {
  function makeConfig(overrides: Partial<CodeGraphConfig> = {}): CodeGraphConfig {
    const base = loadConfig(join(import.meta.dir, "../fixtures/basic"));
    return { ...base, ...overrides };
  }

  test("valid config returns no warnings", () => {
    const config = makeConfig();
    expect(validateConfig(config)).toEqual([]);
  });

  test("warns on empty include patterns", () => {
    const config = makeConfig({ include: [] });
    const warnings = validateConfig(config);
    expect(warnings.some(w => w.includes("include patterns empty"))).toBe(true);
  });

  test("warns on very low maxFileSize", () => {
    const config = makeConfig({ maxFileSize: 100 });
    const warnings = validateConfig(config);
    expect(warnings.some(w => w.includes("very low"))).toBe(true);
  });

  test("warns on very high maxFileSize", () => {
    const config = makeConfig({ maxFileSize: 1000000 });
    const warnings = validateConfig(config);
    expect(warnings.some(w => w.includes("very high"))).toBe(true);
  });

  test("warns on hubDegreeMultiplier < 1", () => {
    const config = makeConfig({ hubDegreeMultiplier: 0.5 });
    const warnings = validateConfig(config);
    expect(warnings.some(w => w.includes("hubDegreeMultiplier"))).toBe(true);
  });

  test("warns on invalid siloThreshold", () => {
    const config = makeConfig({ knowledge: { enabled: true, decayHalfLifeDays: 90, siloThreshold: 1.5, minBusFactor: 2 } });
    const warnings = validateConfig(config);
    expect(warnings.some(w => w.includes("siloThreshold"))).toBe(true);
  });
});
