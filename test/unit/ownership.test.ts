import { describe, test, expect } from "bun:test";
import { computeOwnership, type FileOwnership } from "../../src/knowledge/ownership.js";
import { computeBusFactor } from "../../src/knowledge/bus-factor.js";
import type { FileAuthor } from "../../src/temporal/git-analyzer.js";

describe("Ownership", () => {
  test("single author = silo, low knowledge score", () => {
    const authorData: FileAuthor = {
      filePath: "src/service.ts",
      authors: [{ name: "Alice", email: "alice@test.com", lines: 100, percentage: 100 }],
      primaryAuthor: "Alice",
      authorCount: 1,
    };

    const result = computeOwnership(authorData);
    expect(result.primaryAuthor).toBe("Alice");
    expect(result.isSilo).toBe(true);
    expect(result.knowledgeScore).toBe(0);
  });

  test("two equal authors = not silo, high knowledge score", () => {
    const authorData: FileAuthor = {
      filePath: "src/shared.ts",
      authors: [
        { name: "Alice", email: "alice@test.com", lines: 50, percentage: 50 },
        { name: "Bob", email: "bob@test.com", lines: 50, percentage: 50 },
      ],
      primaryAuthor: "Alice",
      authorCount: 2,
    };

    const result = computeOwnership(authorData);
    expect(result.isSilo).toBe(false);
    expect(result.knowledgeScore).toBe(1);
    expect(result.authorCount).toBe(2);
  });

  test("dominant author crosses silo threshold", () => {
    const authorData: FileAuthor = {
      filePath: "src/mine.ts",
      authors: [
        { name: "Alice", email: "alice@test.com", lines: 90, percentage: 90 },
        { name: "Bob", email: "bob@test.com", lines: 10, percentage: 10 },
      ],
      primaryAuthor: "Alice",
      authorCount: 2,
    };

    const result = computeOwnership(authorData, 0.8);
    expect(result.isSilo).toBe(true);
    expect(result.knowledgeScore).toBeLessThan(0.5);
  });

  test("zero-line file returns unknown author", () => {
    const authorData: FileAuthor = {
      filePath: "src/empty.ts",
      authors: [],
      primaryAuthor: "unknown",
      authorCount: 0,
    };

    const result = computeOwnership(authorData);
    expect(result.primaryAuthor).toBe("unknown");
    expect(result.authorCount).toBe(0);
    expect(result.knowledgeScore).toBe(0);
    expect(result.isSilo).toBe(true);
  });

  test("custom silo threshold", () => {
    const authorData: FileAuthor = {
      filePath: "src/test.ts",
      authors: [
        { name: "Alice", email: "alice@test.com", lines: 60, percentage: 60 },
        { name: "Bob", email: "bob@test.com", lines: 40, percentage: 40 },
      ],
      primaryAuthor: "Alice",
      authorCount: 2,
    };

    expect(computeOwnership(authorData, 0.5).isSilo).toBe(true);
    expect(computeOwnership(authorData, 0.7).isSilo).toBe(false);
  });
});

describe("Bus Factor", () => {
  test("single-author community has bus factor 1", () => {
    const ownerships: FileOwnership[] = [
      { filePath: "a.ts", primaryAuthor: "Alice", authorCount: 1, knowledgeScore: 0, isSilo: true },
      { filePath: "b.ts", primaryAuthor: "Alice", authorCount: 1, knowledgeScore: 0, isSilo: true },
      { filePath: "c.ts", primaryAuthor: "Alice", authorCount: 1, knowledgeScore: 0, isSilo: true },
    ];

    const result = computeBusFactor(0, ownerships);
    expect(result.busFactor).toBe(1);
    expect(result.risk).toBe("high");
  });

  test("distributed team has higher bus factor", () => {
    const ownerships: FileOwnership[] = [
      { filePath: "a.ts", primaryAuthor: "Alice", authorCount: 2, knowledgeScore: 0.8, isSilo: false },
      { filePath: "b.ts", primaryAuthor: "Bob", authorCount: 2, knowledgeScore: 0.8, isSilo: false },
      { filePath: "c.ts", primaryAuthor: "Charlie", authorCount: 2, knowledgeScore: 0.8, isSilo: false },
      { filePath: "d.ts", primaryAuthor: "Diana", authorCount: 2, knowledgeScore: 0.8, isSilo: false },
    ];

    const result = computeBusFactor(0, ownerships);
    expect(result.busFactor).toBeGreaterThanOrEqual(2);
    expect(result.risk).not.toBe("high");
  });

  test("empty community has bus factor 0", () => {
    const result = computeBusFactor(0, []);
    expect(result.busFactor).toBe(0);
    expect(result.risk).toBe("high");
  });

  test("author contributions are sorted by files owned", () => {
    const ownerships: FileOwnership[] = [
      { filePath: "a.ts", primaryAuthor: "Alice", authorCount: 1, knowledgeScore: 0, isSilo: true },
      { filePath: "b.ts", primaryAuthor: "Alice", authorCount: 1, knowledgeScore: 0, isSilo: true },
      { filePath: "c.ts", primaryAuthor: "Bob", authorCount: 1, knowledgeScore: 0, isSilo: true },
    ];

    const result = computeBusFactor(0, ownerships);
    expect(result.authorContributions[0].author).toBe("Alice");
    expect(result.authorContributions[0].filesOwned).toBe(2);
    expect(result.authorContributions[1].author).toBe("Bob");
  });
});
