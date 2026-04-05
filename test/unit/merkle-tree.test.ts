import { describe, test, expect, beforeEach } from "bun:test";
import { MerkleIndex } from "../../src/indexer/merkle-tree.js";
import { join } from "path";
import { rmSync, existsSync } from "fs";

describe("MerkleIndex", () => {
  let index: MerkleIndex;

  beforeEach(() => {
    index = new MerkleIndex();
  });

  test("detects new files as added", async () => {
    const files = new Map([
      ["a.ts", "export const a = 1;"],
      ["b.ts", "export const b = 2;"],
    ]);

    const result = await index.update(files);
    expect(result.added).toContain("a.ts");
    expect(result.added).toContain("b.ts");
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  test("detects changed files", async () => {
    const files1 = new Map([
      ["a.ts", "export const a = 1;"],
    ]);
    await index.update(files1);

    const files2 = new Map([
      ["a.ts", "export const a = 2; // changed"],
    ]);
    const result = await index.update(files2);
    expect(result.changed).toContain("a.ts");
    expect(result.added).toEqual([]);
  });

  test("detects removed files", async () => {
    const files1 = new Map([
      ["a.ts", "export const a = 1;"],
      ["b.ts", "export const b = 2;"],
    ]);
    await index.update(files1);

    const files2 = new Map([
      ["a.ts", "export const a = 1;"],
    ]);
    const result = await index.update(files2);
    expect(result.removed).toContain("b.ts");
    expect(result.changed).toEqual([]);
  });

  test("unchanged files are not reported", async () => {
    const files = new Map([
      ["a.ts", "export const a = 1;"],
    ]);
    await index.update(files);

    const result = await index.update(files);
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  test("save and load round-trips", async () => {
    const tmpPath = join(import.meta.dir, "../.tmp-merkle-test.json");
    const files = new Map([
      ["a.ts", "export const a = 1;"],
      ["b.ts", "export const b = 2;"],
    ]);
    await index.update(files);
    index.save(tmpPath);

    const index2 = new MerkleIndex();
    const loaded = index2.load(tmpPath);
    expect(loaded).toBe(true);
    expect(index2.size).toBe(2);

    // Unchanged files should not be detected
    const result = await index2.update(files);
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);

    rmSync(tmpPath, { force: true });
  });

  test("load returns false for missing file", () => {
    expect(index.load("/nonexistent/path.json")).toBe(false);
  });

  test("getChangedFiles works without update", async () => {
    const files = new Map([
      ["a.ts", "export const a = 1;"],
    ]);
    await index.update(files);

    const changed = index.getChangedFiles(new Map([
      ["a.ts", "export const a = 1;"], // same
      ["b.ts", "new file"],            // new (not in index)
    ]));
    expect(changed).toContain("b.ts");
    expect(changed).not.toContain("a.ts");
  });

  test("getRemovedFiles detects deletions", async () => {
    const files = new Map([
      ["a.ts", "content"],
      ["b.ts", "content"],
    ]);
    await index.update(files);

    const removed = index.getRemovedFiles(new Set(["a.ts"]));
    expect(removed).toContain("b.ts");
    expect(removed).not.toContain("a.ts");
  });

  test("clear resets the index", async () => {
    const files = new Map([["a.ts", "content"]]);
    await index.update(files);
    expect(index.size).toBe(1);

    index.clear();
    expect(index.size).toBe(0);
  });
});
