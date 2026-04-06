import xxhashInit from "xxhash-wasm";

export interface CodeClone {
  hash: string;
  instances: Array<{
    filePath: string;
    symbolName: string;
    line: number;
    loc: number;
  }>;
  loc: number;
}

export interface CloneReport {
  clones: CodeClone[];
  totalClonedLines: number;
  cloneRatio: number;
}

let hasher: Awaited<ReturnType<typeof xxhashInit>> | null = null;

async function getHasher() {
  if (!hasher) hasher = await xxhashInit();
  return hasher;
}

/**
 * Normalize code for clone comparison:
 * - Strip comments
 * - Normalize whitespace
 * - Replace identifiers with placeholders (for near-clone detection)
 */
function normalizeForExactClone(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "")           // strip line comments
    .replace(/\/\*[\s\S]*?\*\//g, "")   // strip block comments
    .replace(/\s+/g, " ")               // normalize whitespace
    .trim();
}

function normalizeForNearClone(code: string): string {
  let normalized = normalizeForExactClone(code);
  // Replace string literals with placeholder
  normalized = normalized.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '"_STR_"');
  // Replace number literals with placeholder
  normalized = normalized.replace(/\b\d+(\.\d+)?\b/g, "_NUM_");
  return normalized;
}

export interface CloneDetectionOptions {
  /** Minimum lines of code for a symbol to be considered */
  minLoc?: number;
  /** Similarity threshold (1.0 = exact only, lower = near clones) */
  threshold?: number;
}

/**
 * Detect code clones across files by hashing function/class bodies.
 *
 * @param fileContents Map of filePath -> source code
 * @param symbols Array of symbols with their file locations
 */
export async function detectClones(
  fileContents: Map<string, string>,
  symbols: Array<{
    filePath: string;
    name: string;
    line: number;
    loc: number;
    startOffset: number;
    endOffset: number;
  }>,
  options: CloneDetectionOptions = {},
): Promise<CloneReport> {
  const { minLoc = 5, threshold = 1.0 } = options;
  const h = await getHasher();

  const isExact = threshold >= 1.0;
  const normalize = isExact ? normalizeForExactClone : normalizeForNearClone;

  // Hash each symbol's body
  const hashMap = new Map<string, CodeClone>();
  let totalLines = 0;

  for (const sym of symbols) {
    if (sym.loc < minLoc) continue;

    const source = fileContents.get(sym.filePath);
    if (!source) continue;

    const body = source.substring(sym.startOffset, sym.endOffset);
    const normalized = normalize(body);
    if (normalized.length < 20) continue; // too small

    const hash = h.h64ToString(normalized);

    if (hashMap.has(hash)) {
      hashMap.get(hash)!.instances.push({
        filePath: sym.filePath,
        symbolName: sym.name,
        line: sym.line,
        loc: sym.loc,
      });
    } else {
      hashMap.set(hash, {
        hash,
        instances: [{
          filePath: sym.filePath,
          symbolName: sym.name,
          line: sym.line,
          loc: sym.loc,
        }],
        loc: sym.loc,
      });
    }

    totalLines += sym.loc;
  }

  // Only keep hashes with 2+ instances (actual clones)
  const clones = [...hashMap.values()].filter(c => c.instances.length >= 2);
  clones.sort((a, b) => b.loc * b.instances.length - a.loc * a.instances.length);

  const clonedLines = clones.reduce((sum, c) => sum + c.loc * (c.instances.length - 1), 0);

  return {
    clones,
    totalClonedLines: clonedLines,
    cloneRatio: totalLines > 0 ? Math.round((clonedLines / totalLines) * 100) / 100 : 0,
  };
}
