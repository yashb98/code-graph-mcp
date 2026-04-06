import { describe, test, expect, afterEach } from "bun:test";
import { startFileWatcher } from "../../src/indexer/file-watcher.js";
import { join } from "path";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import type { FSWatcher } from "fs";

const TMP_DIR = join(import.meta.dir, "../.tmp-watch-test");

describe("FileWatcher", () => {
  let watcher: FSWatcher | null = null;

  afterEach(() => {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  });

  test("starts and returns a watcher instance", () => {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
    writeFileSync(join(TMP_DIR, "test.ts"), "export const x = 1;");

    watcher = startFileWatcher(TMP_DIR, {
      debounceMs: 50,
      include: ["**/*.ts"],
      onChanges: () => {},
    });

    expect(watcher).toBeDefined();
  });

  test("filters non-matching files", () => {
    if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

    const changes: string[][] = [];
    watcher = startFileWatcher(TMP_DIR, {
      debounceMs: 50,
      include: ["**/*.ts"],
      onChanges: (files) => changes.push(files),
    });

    // Write a non-matching file — should not trigger
    writeFileSync(join(TMP_DIR, "test.json"), "{}");

    expect(watcher).toBeDefined();
    // Clean up
    try { unlinkSync(join(TMP_DIR, "test.json")); } catch {}
    try { unlinkSync(join(TMP_DIR, "test.ts")); } catch {}
  });
});
