import xxhashInit from "xxhash-wasm";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

let h64ToString: (input: string) => string;

async function ensureHasher() {
  if (!h64ToString) {
    const xxhash = await xxhashInit();
    h64ToString = xxhash.h64ToString;
  }
}

export class MerkleIndex {
  private hashes: Map<string, string> = new Map();

  async update(files: Map<string, string>): Promise<{
    changed: string[];
    added: string[];
    removed: string[];
  }> {
    await ensureHasher();

    const changed: string[] = [];
    const added: string[] = [];
    const newHashes = new Map<string, string>();

    for (const [filePath, content] of files) {
      const hash = h64ToString(content);
      newHashes.set(filePath, hash);

      const oldHash = this.hashes.get(filePath);
      if (!oldHash) {
        added.push(filePath);
      } else if (oldHash !== hash) {
        changed.push(filePath);
      }
    }

    const removed: string[] = [];
    for (const filePath of this.hashes.keys()) {
      if (!newHashes.has(filePath)) {
        removed.push(filePath);
      }
    }

    this.hashes = newHashes;
    return { changed, added, removed };
  }

  getChangedFiles(files: Map<string, string>): string[] {
    const result: string[] = [];
    for (const [filePath, content] of files) {
      const hash = h64ToString(content);
      if (this.hashes.get(filePath) !== hash) {
        result.push(filePath);
      }
    }
    return result;
  }

  getRemovedFiles(currentFiles: Set<string>): string[] {
    const removed: string[] = [];
    for (const filePath of this.hashes.keys()) {
      if (!currentFiles.has(filePath)) {
        removed.push(filePath);
      }
    }
    return removed;
  }

  save(path: string): void {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data = Object.fromEntries(this.hashes);
    writeFileSync(path, JSON.stringify(data));
  }

  load(path: string): boolean {
    if (!existsSync(path)) return false;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      this.hashes = new Map(Object.entries(data));
      return true;
    } catch {
      return false;
    }
  }

  get size(): number {
    return this.hashes.size;
  }

  clear(): void {
    this.hashes.clear();
  }
}
