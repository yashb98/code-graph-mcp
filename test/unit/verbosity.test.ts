import { describe, test, expect } from "bun:test";
import { shapeResponse, truncateList } from "../../src/mcp/verbosity.js";
import type { Verbosity } from "../../src/types.js";

describe("shapeResponse", () => {
  const data = {
    count: 5,
    score: 85,
    files: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
    details: { x: 1, y: 2 },
  };

  test("normal returns data unchanged (no options)", () => {
    const result = shapeResponse(data, "normal");
    expect(result).toEqual(data);
  });

  test("minimal strips arrays beyond minimalArrayLimit", () => {
    const result = shapeResponse(data, "minimal", {
      minimalArrayLimit: 2,
    });
    expect(result.files).toEqual(["a.ts", "b.ts"]);
    expect((result as any).filesCount).toBe(5);
    expect(result.count).toBe(5);
    expect(result.score).toBe(85);
  });

  test("minimal with minimalStrip removes keys", () => {
    const result = shapeResponse(data, "minimal", {
      minimalStrip: ["details"],
    });
    expect((result as any).details).toBeUndefined();
    expect(result.count).toBe(5);
  });

  test("alwaysInclude keys survive minimal stripping", () => {
    const result = shapeResponse(data, "minimal", {
      alwaysInclude: ["files"],
      minimalArrayLimit: 0,
    });
    expect(result.files).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]);
  });

  test("normal with normalArrayLimit truncates", () => {
    const result = shapeResponse(data, "normal", {
      normalArrayLimit: 3,
    });
    expect(result.files).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect((result as any).filesTruncated).toBe(true);
    expect((result as any).filesTotal).toBe(5);
  });

  test("detailed returns everything", () => {
    const result = shapeResponse(data, "detailed", {
      minimalStrip: ["details"],
      detailedOnly: ["extra"],
    });
    expect(result).toEqual(data);
  });

  test("detailedOnly keys removed at normal level", () => {
    const withExtra = { ...data, extra: "bonus" };
    const result = shapeResponse(withExtra, "normal", {
      detailedOnly: ["extra"],
    });
    expect((result as any).extra).toBeUndefined();
  });
});

describe("truncateList", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

  test("detailed returns all items", () => {
    expect(truncateList(items, "detailed")).toEqual(items);
  });

  test("normal truncates to 20 by default", () => {
    expect(truncateList(items, "normal").length).toBe(20);
  });

  test("minimal truncates to 5 by default", () => {
    expect(truncateList(items, "minimal").length).toBe(5);
  });

  test("custom limits work", () => {
    expect(truncateList(items, "normal", 10).length).toBe(10);
    expect(truncateList(items, "minimal", 10, 3).length).toBe(3);
  });
});
