import { watch, type FSWatcher } from "fs";
import { join } from "path";

export interface WatcherOptions {
  debounceMs: number;
  include: string[];
  onChanges: (files: string[]) => void;
}

export function startFileWatcher(repoRoot: string, options: WatcherOptions): FSWatcher {
  let changedFiles = new Set<string>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(repoRoot, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const filePath = filename.toString();

    // Check if it matches include patterns
    const matches = options.include.some((pattern) => {
      if (pattern.includes("*")) {
        return filePath.endsWith(".ts") || filePath.endsWith(".tsx");
      }
      return filePath.includes(pattern);
    });

    if (!matches) return;
    if (filePath.includes("node_modules") || filePath.includes("dist")) return;

    changedFiles.add(filePath);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const files = [...changedFiles];
      changedFiles = new Set();
      options.onChanges(files);
    }, options.debounceMs);
  });

  return watcher;
}
