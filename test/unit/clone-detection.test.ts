import { describe, test, expect } from "bun:test";
import { detectClones } from "../../src/analysis/clone-detection.js";

describe("Clone Detection", () => {
  test("detects exact duplicate functions", async () => {
    // Same function body in two files — identical code
    const funcBody = `function process(data: any) {\n  const result = data.map((x: any) => x * 2);\n  return result.filter((x: any) => x > 0);\n}`;
    const fileA = funcBody + `\nfunction unique() {\n  return "only in A";\n}`;
    const fileB = funcBody;

    const files = new Map([
      ["src/a.ts", fileA],
      ["src/b.ts", fileB],
    ]);

    const symbols = [
      { filePath: "src/a.ts", name: "process", line: 1, loc: 4, startOffset: 0, endOffset: funcBody.length },
      { filePath: "src/a.ts", name: "unique", line: 5, loc: 3, startOffset: funcBody.length + 1, endOffset: fileA.length },
      { filePath: "src/b.ts", name: "process", line: 1, loc: 4, startOffset: 0, endOffset: funcBody.length },
    ];

    const report = await detectClones(files, symbols, { minLoc: 2 });
    expect(report.clones.length).toBe(1);
    expect(report.clones[0].instances.length).toBe(2);
    expect(report.totalClonedLines).toBeGreaterThan(0);
  });

  test("skips small functions below minLoc", async () => {
    const code = `function tiny() { return 1; }`;
    const files = new Map([["a.ts", code]]);
    const symbols = [
      { filePath: "a.ts", name: "tiny", line: 1, loc: 1, startOffset: 0, endOffset: code.length },
    ];

    const report = await detectClones(files, symbols, { minLoc: 5 });
    expect(report.clones.length).toBe(0);
  });

  test("unique functions produce no clones", async () => {
    const fileA = `function foo() {\n  return "hello";\n  console.log("unique A");\n}`;
    const fileB = `function bar() {\n  return "world";\n  console.log("unique B");\n}`;

    const files = new Map([
      ["a.ts", fileA],
      ["b.ts", fileB],
    ]);

    const symbols = [
      { filePath: "a.ts", name: "foo", line: 1, loc: 4, startOffset: 0, endOffset: fileA.length },
      { filePath: "b.ts", name: "bar", line: 1, loc: 4, startOffset: 0, endOffset: fileB.length },
    ];

    const report = await detectClones(files, symbols, { minLoc: 2 });
    expect(report.clones.length).toBe(0);
  });

  test("reports clone ratio", async () => {
    const body = `function process(data: any) {\n  const result = data.map((x: any) => x * 2);\n  return result.filter((x: any) => x > 0);\n}`;
    const files = new Map([
      ["a.ts", body],
      ["b.ts", body],
    ]);

    const symbols = [
      { filePath: "a.ts", name: "process", line: 1, loc: 4, startOffset: 0, endOffset: body.length },
      { filePath: "b.ts", name: "process", line: 1, loc: 4, startOffset: 0, endOffset: body.length },
    ];

    const report = await detectClones(files, symbols, { minLoc: 2 });
    expect(report.cloneRatio).toBeGreaterThan(0);
    expect(report.cloneRatio).toBeLessThanOrEqual(1);
  });

  test("handles empty input", async () => {
    const report = await detectClones(new Map(), [], {});
    expect(report.clones).toEqual([]);
    expect(report.cloneRatio).toBe(0);
  });
});
