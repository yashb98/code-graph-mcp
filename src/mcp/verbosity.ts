import type { Verbosity } from "../types.js";

/**
 * Shapes tool responses based on verbosity level:
 * - minimal: counts/scores only, no lists, no details
 * - normal: default (current behavior)
 * - detailed: everything + extra context
 */
export function shapeResponse<T extends Record<string, unknown>>(
  data: T,
  verbosity: Verbosity,
  opts?: {
    /** Keys to always include regardless of verbosity */
    alwaysInclude?: string[];
    /** Keys to only include at "detailed" level */
    detailedOnly?: string[];
    /** Keys to strip at "minimal" level (arrays/objects with details) */
    minimalStrip?: string[];
    /** Max array length at "normal" level (default: unlimited) */
    normalArrayLimit?: number;
    /** Max array length at "minimal" level (default: 0 = counts only) */
    minimalArrayLimit?: number;
  },
): T {
  if (verbosity === "normal" && !opts?.normalArrayLimit && !opts?.detailedOnly?.length) return data;

  const result = { ...data };
  const always = new Set(opts?.alwaysInclude ?? []);

  if (verbosity === "minimal") {
    const strip = new Set(opts?.minimalStrip ?? []);
    const maxLen = opts?.minimalArrayLimit ?? 0;

    for (const [key, value] of Object.entries(result)) {
      if (always.has(key)) continue;

      if (strip.has(key)) {
        delete (result as Record<string, unknown>)[key];
        continue;
      }

      // Truncate arrays at minimal level
      if (Array.isArray(value) && value.length > maxLen) {
        (result as Record<string, unknown>)[key] = value.slice(0, maxLen);
        (result as Record<string, unknown>)[`${key}Count`] = value.length;
      }
    }
  }

  if (verbosity === "normal" && opts?.normalArrayLimit) {
    for (const [key, value] of Object.entries(result)) {
      if (always.has(key)) continue;
      if (Array.isArray(value) && value.length > opts.normalArrayLimit) {
        (result as Record<string, unknown>)[key] = value.slice(0, opts.normalArrayLimit);
        (result as Record<string, unknown>)[`${key}Truncated`] = true;
        (result as Record<string, unknown>)[`${key}Total`] = value.length;
      }
    }
  }

  if (verbosity === "detailed") {
    // Detailed includes everything — no stripping
    return result;
  }

  // Remove detailedOnly keys at non-detailed levels
  if (verbosity !== "detailed" && opts?.detailedOnly) {
    for (const key of opts.detailedOnly) {
      delete (result as Record<string, unknown>)[key];
    }
  }

  return result;
}

/** Default verbosity if not specified */
export const DEFAULT_VERBOSITY: Verbosity = "normal";

/** Truncate text for minimal responses */
export function truncateList<T>(items: T[], verbosity: Verbosity, normalMax = 20, minimalMax = 5): T[] {
  if (verbosity === "detailed") return items;
  if (verbosity === "minimal") return items.slice(0, minimalMax);
  return items.slice(0, normalMax);
}
